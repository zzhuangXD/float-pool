import * as T from 'three';
import { POOL } from './water.js';

export class WaterRenderer {
  constructor(field, scene, highPrecision = true) {
    this.field = field;
    this.texture = new T.DataTexture(field.height, field.nx, field.nz, T.RedFormat, T.FloatType);
    this.texture.minFilter = this.texture.magFilter = T.NearestFilter;
    this.texture.needsUpdate = true;
    this.target = new T.WebGLRenderTarget(1, 1, { depthBuffer: true, type: highPrecision ? T.HalfFloatType : T.UnsignedByteType });
    const vertices = [], uvs = [], indices = [];
    for (let z = 0; z < field.nz; z++) for (let x = 0; x < field.nx; x++) {
      vertices.push(x * field.dx - POOL.rx, POOL.level, z * field.dz - POOL.rz);
      uvs.push(x / (field.nx - 1), z / (field.nz - 1));
      if (x < field.nx - 1 && z < field.nz - 1) { const i = z * field.nx + x; indices.push(i, i + field.nx, i + 1, i + 1, i + field.nx, i + field.nx + 1); }
    }
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
    this.material = new T.ShaderMaterial({
      uniforms: { uHeight: { value: this.texture }, uScene: { value: this.target.texture }, uTime: { value: 0 }, uWind: { value: field.wind }, uStep: { value: new T.Vector2(1 / field.nx, 1 / field.nz) }, uCell: { value: new T.Vector2(field.dx, field.dz) }, uRadii: { value: new T.Vector2(POOL.rx, POOL.rz) } },
      vertexShader: `
        uniform sampler2D uHeight; uniform float uTime; uniform float uWind;
        uniform vec2 uStep; uniform vec2 uCell;
        varying vec3 vWorld; varying vec3 vNormal; varying vec4 vClip; varying float vHeight;
        float ambient(vec2 p) { return uWind * 0.018 * (sin(p.x * 2.2 + p.y * 1.4 + uTime * 1.3) + 0.5 * sin(p.y * 3.1 - uTime * 1.1)); }
        float heightAt(vec2 uv, vec2 p) { return texture2D(uHeight, uv).r + ambient(p); }
        void main() {
          vec3 p = position; float h = heightAt(uv, p.xz); p.y += h;
          float hx = (heightAt(uv + vec2(uStep.x,0.),p.xz + vec2(uCell.x,0.)) - heightAt(uv - vec2(uStep.x,0.),p.xz - vec2(uCell.x,0.))) / (2. * uCell.x);
          float hz = (heightAt(uv + vec2(0.,uStep.y),p.xz + vec2(0.,uCell.y)) - heightAt(uv - vec2(0.,uStep.y),p.xz - vec2(0.,uCell.y))) / (2. * uCell.y);
          vNormal = normalize(vec3(-hx,1.,-hz)); vHeight = h;
          vWorld = (modelMatrix * vec4(p,1.)).xyz; vClip = projectionMatrix * viewMatrix * vec4(vWorld,1.); gl_Position = vClip;
        }
      `,
      fragmentShader: `
        uniform sampler2D uScene; uniform vec2 uRadii; uniform float uTime;
        varying vec3 vWorld; varying vec3 vNormal; varying vec4 vClip; varying float vHeight;
        void main() {
          vec2 oval = vWorld.xz / uRadii; float radius = dot(oval,oval); if (radius > 1.) discard;
          vec3 N = normalize(vNormal + vec3(sin(vWorld.z * 13. + uTime) * 0.007,0.,cos(vWorld.x * 11. - uTime) * 0.007));
          vec3 V = normalize(cameraPosition - vWorld);
          vec2 screenUv = vClip.xy / vClip.w * 0.5 + 0.5;
          vec2 refractUv = clamp(screenUv + vec2(N.x - N.z * .4, N.z + N.x * .3) * 0.026,vec2(.001),vec2(.999));
          vec3 underneath = texture2D(uScene,refractUv).rgb;
          vec3 color = mix(underneath,vec3(0.12,0.56,0.47),0.13);
          float fresnel = pow(1. - max(dot(N,V),0.),3.);
          color = mix(color,vec3(0.72,0.88,0.77),0.08 + fresnel * 0.38);
          vec3 L = normalize(vec3(-4.,9.,5.));
          float spec = pow(max(dot(reflect(-L,N),V),0.),130.);
          color += vec3(1.,0.99,0.87) * spec * 0.9;
          float glint = pow(max(dot(reflect(normalize(vec3(1.,-1.,-2.)),N),V),0.),150.);
          color += vec3(0.8,0.9,0.82) * glint * 0.35;
          color += smoothstep(0.98,1.,radius) * vec3(0.09,0.12,0.09);
          gl_FragColor = vec4(color,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new T.Mesh(geometry, this.material); this.mesh.frustumCulled = false; scene.add(this.mesh);
    const floorMaterial = new T.MeshStandardMaterial({ color: '#53baa7', roughness: 0.42, metalness: 0.02 });
    this.floorUniform = { value: 0 };
    floorMaterial.onBeforeCompile = shader => {
      shader.uniforms.uCausticTime = this.floorUniform;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFloor;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFloor = (modelMatrix * vec4(position, 1.)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFloor; uniform float uCausticTime;').replace('#include <color_fragment>', `#include <color_fragment>
        vec2 p = vFloor.xz;
        vec2 tiles = abs(fract(p * 1.45) - .5);
        float seam = smoothstep(.479,.495,max(tiles.x,tiles.y));
        float t = uCausticTime;
        vec2 q = p * 4.6 + vec2(sin(p.y*2.+t*.6),cos(p.x*1.7-t*.5))*.48;
        float c1 = abs(sin(q.x + sin(q.y + t*.23)) * cos(q.y + sin(q.x - t*.3)));
        float caustic = pow(1. - c1,.0 + 11.);
        float c2 = abs(sin(q.x*1.27-t*.24) * cos(q.y*.92+t*.17));
        caustic += pow(1.-c2,18.)*.45;
        diffuseColor.rgb *= 1. - seam * .065;
        diffuseColor.rgb += vec3(.10,.18,.10) * caustic;
      `);
    };
    this.floor = new T.Mesh(new T.CylinderGeometry(1, 1, 0.015, 128), floorMaterial); this.floor.scale.set(POOL.rx + 0.025, 1, POOL.rz + 0.025); this.floor.position.y = POOL.floor + 0.025; this.floor.receiveShadow = true; scene.add(this.floor);
  }
  resize(width, height) { this.target.setSize(width, height); }
  update() { this.texture.needsUpdate = true; this.material.uniforms.uTime.value = this.field.time; this.material.uniforms.uWind.value = this.field.wind; this.floorUniform.value = this.field.time; }
  render(renderer, scene, camera) {
    this.mesh.visible = false;
    renderer.setRenderTarget(this.target); renderer.render(scene, camera);
    this.mesh.visible = true;
    renderer.setRenderTarget(null); renderer.render(scene, camera);
  }
}
