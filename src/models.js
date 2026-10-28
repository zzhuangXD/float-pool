import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const materials = new Map();
export function vinyl(color, roughness = 0.33) {
  const key = color + ':' + roughness;
  if (!materials.has(key)) materials.set(key, new T.MeshPhysicalMaterial({ color, roughness, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.23 }));
  return materials.get(key);
}
export function mesh(geometry, material, parent, position = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new T.Mesh(geometry, material); m.position.set(...position); m.scale.set(...scale); m.castShadow = true; m.receiveShadow = true; parent?.add(m); return m;
}
function egg(parent, color, position, scale, segments = 32) { return mesh(new T.SphereGeometry(1, segments, 20), typeof color === 'string' ? vinyl(color) : color, parent, position, scale); }
export function rod(parent, a, b, radius, color) {
  const start = new T.Vector3(...a), end = new T.Vector3(...b), delta = end.clone().sub(start);
  const m = mesh(new T.CylinderGeometry(radius, radius, delta.length(), 10), typeof color === 'string' ? vinyl(color) : color, parent);
  m.position.copy(start.add(end).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize()); return m;
}
export function stripeMaterial(a, b, bands = 16) {
  const key = `stripe:${a}:${b}:${bands}`;
  if (materials.has(key)) return materials.get(key);
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 32;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < bands; i++) { ctx.fillStyle = i % 2 ? a : b; ctx.fillRect(i / bands * canvas.width, 0, Math.ceil(canvas.width / bands), 32); }
  const tex = new T.CanvasTexture(canvas); tex.colorSpace = T.SRGBColorSpace; tex.wrapS = T.RepeatWrapping; tex.anisotropy = 4;
  const mat = new T.MeshPhysicalMaterial({ map: tex, roughness: 0.37, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.3 });
  materials.set(key, mat); return mat;
}

function duck() {
  const g = new T.Group(), yellow = vinyl('#f9cc45'), wing = vinyl('#efb83c');
  egg(g, yellow, [0, 0.02, 0.03], [0.29, 0.245, 0.38]);
  egg(g, yellow, [0, 0.29, -0.23], [0.215, 0.215, 0.215]);
  egg(g, '#e98b35', [0, 0.245, -0.43], [0.145, 0.05, 0.145]);
  const tail = egg(g, yellow, [0, 0.10, 0.35], [0.12, 0.13, 0.21]); tail.rotation.x = -0.35;
  for (const side of [-1, 1]) {
    egg(g, wing, [side * 0.255, 0.05, 0.06], [0.065, 0.13, 0.24]);
    egg(g, '#343e33', [side * 0.135, 0.335, -0.385], [0.025, 0.029, 0.021], 16);
    egg(g, '#fff9db', [side * 0.142, 0.345, -0.4], [0.006, 0.007, 0.006], 8);
  }
  return g;
}
function ring(flamingo = false) {
  const g = new T.Group();
  const mat = flamingo ? vinyl('#ec989f') : stripeMaterial('#df997f', '#fff0d4', 12);
  const torus = mesh(new T.TorusGeometry(0.47, 0.17, 20, 80), mat, g); torus.rotation.x = Math.PI / 2;
  // Welded vinyl seams and a tiny inflation valve.
  const seam = mesh(new T.TorusGeometry(0.636, 0.004, 4, 80), vinyl(flamingo ? '#de8991' : '#e7c6ab'), g); seam.rotation.x = Math.PI / 2;
  egg(g, '#fbedd7', [0.49, 0.13, 0.11], [0.025, 0.015, 0.04], 12);
  if (flamingo) {
    const curve = new T.CatmullRomCurve3([new T.Vector3(0, 0.02, -0.45), new T.Vector3(0, 0.34, -0.62), new T.Vector3(0, 0.76, -0.65), new T.Vector3(0, 0.9, -0.48)]);
    mesh(new T.TubeGeometry(curve, 32, 0.105, 12, false), mat, g);
    egg(g, mat, [0, 0.88, -0.45], [0.145, 0.155, 0.19]);
    egg(g, '#fff4d9', [0, 0.85, -0.27], [0.1, 0.085, 0.13]);
    egg(g, '#4b5345', [0, 0.81, -0.18], [0.075, 0.065, 0.075]);
    for (const s of [-1, 1]) {
      egg(g, '#465042', [s * 0.13, 0.91, -0.43], [0.018, 0.021, 0.018], 12);
      egg(g, '#e38b95', [s * 0.49, 0.09, 0.01], [0.1, 0.11, 0.27]);
    }
    const tail = egg(g, mat, [0, 0.1, 0.51], [0.14, 0.12, 0.22]); tail.rotation.x = -0.5;
  } else {
    for (const side of [-1, 1]) {
      const handle = new T.CatmullRomCurve3([new T.Vector3(side * 0.46, 0.11, -0.15), new T.Vector3(side * 0.5, 0.23, 0), new T.Vector3(side * 0.46, 0.11, 0.15)]);
      mesh(new T.TubeGeometry(handle, 12, 0.018, 6, false), vinyl('#fff2dc'), g);
    }
  }
  return g;
}
function ball() {
  const g = new T.Group();
  const colors = ['#efba59', '#fff0d9', '#82b5bd', '#e5947d', '#fff0d9', '#b8c78c'];
  for (let i = 0; i < 6; i++) mesh(new T.SphereGeometry(0.41, 12, 28, i * Math.PI / 3, Math.PI / 3 + 0.001), vinyl(colors[i], 0.3), g);
  egg(g, '#fff0d9', [0, 0.405, 0], [0.08, 0.012, 0.08], 20);
  return g;
}
function boardShape(w, length) {
  const s = new T.Shape(); s.moveTo(0, -length);
  s.bezierCurveTo(w * 0.8, -length, w, -length * 0.65, w, -length * 0.2);
  s.lineTo(w * 0.92, length * 0.65); s.quadraticCurveTo(w * 0.8, length, 0, length);
  s.quadraticCurveTo(-w * 0.8, length, -w * 0.92, length * 0.65); s.lineTo(-w, -length * 0.2);
  s.bezierCurveTo(-w, -length * 0.65, -w * 0.8, -length, 0, -length); return s;
}
function board() {
  const g = new T.Group();
  const geom = new T.ExtrudeGeometry(boardShape(0.35, 1.08), { depth: 0.1, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: 0.045, bevelThickness: 0.045, curveSegments: 24 });
  geom.rotateX(-Math.PI / 2); geom.translate(0, -0.05, 0);
  mesh(geom, vinyl('#f3d2a2'), g);
  const padGeom = new T.ShapeGeometry(boardShape(0.26, 0.66)); padGeom.rotateX(-Math.PI / 2);
  mesh(padGeom, vinyl('#e9987c', 0.73), g, [0, 0.1, 0.12]);
  for (let i = 0; i < 8; i++) rod(g, [-0.23, 0.107, -0.34 + i * 0.13], [0.23, 0.107, -0.34 + i * 0.13], 0.004, '#d48b72');
  for (const z of [-0.79, -0.58]) {
    rod(g, [-0.24, 0.115, z], [0.24, 0.115, z + 0.18], 0.012, '#6b8678');
    rod(g, [0.24, 0.115, z], [-0.24, 0.115, z + 0.18], 0.012, '#6b8678');
  }
  const handle = new T.CatmullRomCurve3([new T.Vector3(-0.07, 0.11, 0.06), new T.Vector3(0, 0.17, 0.06), new T.Vector3(0.07, 0.11, 0.06)]);
  mesh(new T.TubeGeometry(handle, 12, 0.018, 6, false), vinyl('#4b6254'), g);
  rod(g, [0.33, 0.17, -0.75], [0.33, 0.17, 0.85], 0.018, '#4d6557');
  egg(g, '#6d9888', [0.33, 0.17, 0.91], [0.125, 0.022, 0.25]);
  rod(g, [0.23, 0.17, -0.79], [0.43, 0.17, -0.79], 0.018, '#4d6557');
  return g;
}
export function createToyModel(kind) {
  const g = kind === 'duck' ? duck() : kind === 'ring' ? ring() : kind === 'ball' ? ball() : kind === 'board' ? board() : ring(true);
  g.userData.kind = kind; return g;
}

class OvalCurve extends T.Curve {
  constructor(rx, rz) { super(); this.rx = rx; this.rz = rz; }
  getPoint(t, target = new T.Vector3()) { const a = t * Math.PI * 2; return target.set(Math.cos(a) * this.rx, 0, Math.sin(a) * this.rz); }
}
export function ovalTube(rx, rz, radius, material, parent, y = 0, detail = 160) {
  return mesh(new T.TubeGeometry(new OvalCurve(rx, rz), detail, radius, 16, true), material, parent, [0, y, 0]);
}
export function createPool() {
  const g = new T.Group();
  const bottom = mesh(new T.CylinderGeometry(1, 1, 0.13, 128), vinyl('#d2e4d0', 0.68), g, [0, 0.08, 0], [4.12, 1, 2.81]); bottom.castShadow = false;
  const rim = stripeMaterial('#e8a08a', '#fff0d6', 48);
  ovalTube(4.06, 2.77, 0.235, rim, g, 0.31);
  ovalTube(4.06, 2.77, 0.235, rim, g, 0.73);
  // Fine weld line between both inflated chambers.
  const valve = mesh(new T.CylinderGeometry(0.06, 0.06, 0.032, 20), vinyl('#f4d6b9'), g, [1.7, 0.66, 2.7]); valve.rotation.x = Math.PI / 2;
  const cap = mesh(new T.CylinderGeometry(0.038, 0.038, 0.04, 16), vinyl('#e5b8a0'), g, [1.7, 0.66, 2.725]); cap.rotation.x = Math.PI / 2;
  return g;
}

function leaf(parent, start, end, width, color, bend = 0.18) {
  const a = new T.Vector3(...start), b = new T.Vector3(...end), dir = b.clone().sub(a);
  const side = new T.Vector3(-dir.z, 0, dir.x).normalize();
  const vertices = [], indices = [], rows = 14;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows, p = a.clone().lerp(b, t); p.y += Math.sin(t * Math.PI) * bend;
    const w = Math.sin(Math.PI * t) ** 0.75 * width;
    for (const s of [-1, 0, 1]) { const q = p.clone().addScaledVector(side, w * s); q.y -= Math.abs(s) * w * 0.2; vertices.push(q.x, q.y, q.z); }
    if (i < rows) for (let j = 0; j < 2; j++) { const k = i * 3 + j; indices.push(k, k + 3, k + 1, k + 1, k + 3, k + 4); }
  }
  const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const mat = new T.MeshStandardMaterial({ color, roughness: 0.8, side: T.DoubleSide }); mesh(geometry, mat, parent);
  rod(parent, start, end, 0.009, '#53734b');
}
function plant(parent, position, scale = 1) {
  const g = new T.Group(); g.position.set(...position); g.scale.setScalar(scale); parent.add(g);
  mesh(new T.CylinderGeometry(0.34, 0.24, 0.6, 36), new T.MeshStandardMaterial({ color: '#c0bba0', roughness: 0.9 }), g, [0, 0.3, 0]);
  mesh(new T.CylinderGeometry(0.3, 0.3, 0.015, 32), vinyl('#666448', 0.95), g, [0, 0.607, 0]);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, h = 0.85 + (i % 4) * 0.18;
    const base = [Math.cos(a) * 0.1, 0.58, Math.sin(a) * 0.1], mid = [Math.cos(a) * 0.22, h, Math.sin(a) * 0.22];
    rod(g, base, mid, 0.018, '#64825b');
    leaf(g, mid, [Math.cos(a) * 0.85, h + 0.2, Math.sin(a) * 0.85], 0.22, i % 2 ? '#637e4a' : '#76915b', 0.28);
  }
}
export function createGarden() {
  const g = new T.Group();
  const deckMat = new T.MeshStandardMaterial({ color: '#e9e7d8', roughness: 0.95 });
  deckMat.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDeck;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDeck = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vDeck;').replace('#include <color_fragment>', `#include <color_fragment>
      vec2 tile = abs(fract((vDeck.xz + 0.24) / 0.73) - 0.5);
      float grout = smoothstep(0.477, 0.493, max(tile.x, tile.y));
      float grain = fract(sin(dot(vDeck.xz,vec2(127.1,311.7))) * 43758.5453);
      diffuseColor.rgb *= 1.0 - grout * 0.10 + (grain - 0.5) * 0.025;
    `);
  };
  mesh(new RoundedBoxGeometry(10.2, 0.16, 7.4, 3, 0.16), deckMat, g, [0, -0.07, 0]);
  const ground = mesh(new T.PlaneGeometry(200, 200), new T.ShadowMaterial({ color: '#56674b', opacity: 0.09 }), g, [0, -0.165, 0]); ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
  plant(g, [-4.2, 0.02, -2.75], 1.03); plant(g, [4.15, 0.02, -2.6], 0.66);
  // A casually folded striped beach towel.
  const towel = mesh(new RoundedBoxGeometry(1.4, 0.035, 0.62, 2, 0.03), stripeMaterial('#bdc7a2', '#f2ecd7', 14), g, [-3.5, 0.04, 2.75]); towel.rotation.y = -0.13;
  mesh(new RoundedBoxGeometry(0.5, 0.07, 0.62, 2, 0.04), stripeMaterial('#bdc7a2', '#f2ecd7', 6), g, [-3.95, 0.075, 2.81]).rotation.y = -0.13;
  // Two little poolside slippers.
  for (const s of [-1, 1]) {
    const slipper = new T.Group(); slipper.position.set(3.65 + s * 0.19, 0.045, 2.65 + s * 0.03); slipper.rotation.y = 0.3 + s * 0.12; g.add(slipper);
    egg(slipper, '#e6a48c', [0, 0, 0], [0.13, 0.028, 0.29]);
    const strap = mesh(new T.TorusGeometry(0.105, 0.028, 8, 20, Math.PI), vinyl('#f2c8af'), slipper, [0, 0.025, -0.06]); strap.rotation.y = Math.PI;
  }
  // A small side table, lemonade and a straw.
  const table = new T.Group(); table.position.set(4.7, 0, -0.4); g.add(table);
  mesh(new T.CylinderGeometry(0.32, 0.29, 0.04, 40), vinyl('#d9c6a5', 0.75), table, [0, 0.49, 0]);
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; rod(table, [Math.cos(a) * 0.2, 0.02, Math.sin(a) * 0.2], [Math.cos(a) * 0.16, 0.48, Math.sin(a) * 0.16], 0.027, '#d2c1a1'); }
  const glass = new T.MeshPhysicalMaterial({ color: '#e6a944', transparent: true, opacity: 0.74, roughness: 0.12, clearcoat: 1 });
  mesh(new T.CylinderGeometry(0.085, 0.065, 0.23, 24), glass, table, [0, 0.62, 0]);
  rod(table, [0.01, 0.6, 0], [0.07, 0.89, 0], 0.008, '#f4ebd1');
  return g;
}
