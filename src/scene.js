import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPool, createGarden, createToyModel } from './models.js';
import { WaterRenderer } from './water-renderer.js';
import { POOL } from './water.js';

class Droplets {
  constructor(scene) {
    this.count = 160; this.positions = new Float32Array(this.count * 3); this.velocity = new Float32Array(this.count * 3); this.life = new Float32Array(this.count); this.cursor = 0;
    for (let i = 0; i < this.count; i++) this.positions[i * 3 + 1] = -20;
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(this.positions, 3).setUsage(T.DynamicDrawUsage));
    this.points = new T.Points(geometry, new T.PointsMaterial({ color: '#d8f5e4', size: 0.032, transparent: true, opacity: 0.85, depthWrite: false }));
    this.points.frustumCulled = false; scene.add(this.points);
  }
  splash(x, z, amount = 22, strength = 1) {
    for (let n = 0; n < amount; n++) {
      const i = this.cursor++ % this.count, p = i * 3, a = Math.random() * Math.PI * 2;
      this.positions[p] = x + Math.cos(a) * 0.1; this.positions[p + 1] = POOL.level + 0.03; this.positions[p + 2] = z + Math.sin(a) * 0.1;
      this.velocity[p] = Math.cos(a) * (0.3 + Math.random() * 0.5) * strength;
      this.velocity[p + 1] = (0.8 + Math.random() * 1.5) * strength; this.velocity[p + 2] = Math.sin(a) * (0.3 + Math.random() * 0.5) * strength;
      this.life[i] = 1;
    }
  }
  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      const p = i * 3; this.velocity[p + 1] -= 7 * dt;
      this.positions[p] += this.velocity[p] * dt; this.positions[p + 1] += this.velocity[p + 1] * dt; this.positions[p + 2] += this.velocity[p + 2] * dt;
      if (this.positions[p + 1] < POOL.level - 0.02) { this.life[i] = 0; this.positions[p + 1] = -20; }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

export class PoolScene {
  constructor(container, physics) {
    this.container = container; this.physics = physics; this.mobile = matchMedia('(max-width:680px)').matches;
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.mobile ? 1.5 : 1.8));
    this.renderer.outputColorSpace = T.SRGBColorSpace; this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap; this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.setAttribute('aria-label', '充气泳池：轻点拨水，拖动物件，按住下压；双指或右键转动视角');
    this.renderer.domElement.setAttribute('role', 'img'); container.append(this.renderer.domElement);
    this.scene = new T.Scene(); this.renderer.setClearColor('#f5f3ed', 0);
    this.camera = new T.OrthographicCamera(-8, 8, 5, -5, 0.1, 100);
    this.camera.position.set(7.8, 11.5, 14.5);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.18, 0); this.controls.enableDamping = true; this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false; this.controls.minPolarAngle = 0.08; this.controls.maxPolarAngle = 1.23; this.controls.minZoom = 0.75; this.controls.maxZoom = 1.65;
    this.controls.mouseButtons = { LEFT: null, MIDDLE: T.MOUSE.DOLLY, RIGHT: T.MOUSE.ROTATE };
    this.controls.touches = { ONE: null, TWO: T.TOUCH.DOLLY_ROTATE }; this.controls.rotateSpeed = 0.55;
    this.controls.update();
    const pmrem = new T.PMREMGenerator(this.renderer), room = new RoomEnvironment();
    this.env = pmrem.fromScene(room, 0.04).texture; this.scene.environment = this.env; this.scene.environmentIntensity = 0.45; room.dispose(); pmrem.dispose();
    this.scene.add(new T.HemisphereLight('#fff9e6', '#c2d1b4', 1.65));
    const sun = new T.DirectionalLight('#fff3da', 2.7); sun.position.set(-4, 9, 5); sun.castShadow = true;
    sun.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 30 });
    sun.shadow.normalBias = 0.025; sun.shadow.bias = -0.0002; sun.shadow.radius = 3; this.scene.add(sun);
    this.scene.add(createGarden()); this.scene.add(createPool());
    this.water = new WaterRenderer(physics.water, this.scene, this.renderer.extensions.has('EXT_color_buffer_float')); this.droplets = new Droplets(this.scene);
    this.toys = new Map(); this.pickable = []; this.raycaster = new T.Raycaster(); this.pointer = new T.Vector2(); this.waterPlane = new T.Plane(new T.Vector3(0, 1, 0), -POOL.level);
    this.frame = 0; this.fps = 60; this.frameTimes = []; this.topView = false;
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container); this.resize();
  }
  resize() {
    const width = this.container.clientWidth, height = this.container.clientHeight; if (!width || !height) return;
    this.mobile = matchMedia('(max-width:680px), (max-height:540px) and (pointer:coarse)').matches;
    this.renderer.setSize(width, height); const aspect = width / height;
    const viewHeight = Math.max(this.mobile ? 7.8 : 8.4, (this.mobile ? 11.65 : 12.8) / aspect);
    this.camera.left = -viewHeight * aspect / 2; this.camera.right = viewHeight * aspect / 2; this.camera.top = viewHeight / 2; this.camera.bottom = -viewHeight / 2;
    this.camera.clearViewOffset();
    if (!this.mobile) this.camera.setViewOffset(width, height, -width * 0.105, 0, width, height);
    this.camera.updateProjectionMatrix();
    const ratio = Math.min(devicePixelRatio || 1, this.mobile ? 1.5 : 1.8);
    this.renderer.setPixelRatio(ratio); this.water.resize(Math.floor(width * ratio * (this.mobile ? 0.85 : 1)), Math.floor(height * ratio * (this.mobile ? 0.85 : 1)));
  }
  syncToys() {
    const live = new Set(this.physics.items.map(item => item.id));
    for (const [id, model] of this.toys) if (!live.has(id)) {
      this.scene.remove(model); model.traverse(child => { if (child.geometry) child.geometry.dispose(); }); this.toys.delete(id);
    }
    for (const item of this.physics.items) {
      let model = this.toys.get(item.id);
      if (!model) { model = createToyModel(item.kind); model.userData.item = item; model.scale.setScalar(item.scale); this.toys.set(item.id, model); this.scene.add(model); }
      model.position.copy(item.body.position); model.quaternion.copy(item.body.quaternion);
    }
    this.pickable = [...this.toys.values()];
  }
  ray(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera); return this.raycaster;
  }
  waterPoint(clientX, clientY) { return this.ray(clientX, clientY).ray.intersectPlane(this.waterPlane, new T.Vector3()); }
  pick(clientX, clientY) {
    const hit = this.ray(clientX, clientY).intersectObjects(this.pickable, true)[0]; if (!hit) return null;
    let object = hit.object; while (object && !object.userData.item) object = object.parent;
    return object?.userData.item ?? null;
  }
  project(x, y, z) {
    const p = new T.Vector3(x, y, z).project(this.camera), r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
  }
  toggleView() {
    this.topView = !this.topView;
    this.camera.position.copy(this.topView ? new T.Vector3(0.01, 19, 0.01) : new T.Vector3(7.8, 11.5, 14.5));
    this.camera.zoom = 1; this.camera.updateProjectionMatrix(); this.controls.update();
  }
  render(dt) {
    this.frame++; this.controls.update(); this.syncToys(); this.water.update(); this.droplets.update(dt);
    this.renderer.shadowMap.needsUpdate = this.frame % (this.mobile ? 5 : 3) === 1;
    this.water.render(this.renderer, this.scene, this.camera);
    this.frameTimes.push(dt); if (this.frameTimes.length > 90) this.frameTimes.shift();
    if (this.frameTimes.length === 90 && this.frame % 90 === 0) {
      this.fps = 1 / (this.frameTimes.reduce((a, b) => a + b, 0) / 90);
      if (this.fps < 34 && this.renderer.getPixelRatio() > 1) { this.renderer.setPixelRatio(1); this.renderer.setSize(this.container.clientWidth, this.container.clientHeight); this.water.resize(this.container.clientWidth, this.container.clientHeight); }
    }
  }
  makeThumbnails() {
    const preview = new T.Scene(); preview.environment = this.env; preview.add(new T.HemisphereLight('#fff9e9', '#b7c6a2', 3));
    const light = new T.DirectionalLight('#fff4dc', 3); light.position.set(-3, 5, -2); preview.add(light);
    const camera = new T.OrthographicCamera(-1.3, 1.3, 0.975, -0.975, 0.1, 20); camera.position.set(2, 2.5, -3.8); camera.lookAt(0, 0.13, 0);
    const target = new T.WebGLRenderTarget(160, 120); target.texture.colorSpace = T.SRGBColorSpace;
    const oldAlpha = this.renderer.getClearAlpha(), oldClear = this.renderer.getClearColor(new T.Color()); this.renderer.setClearColor(0, 0);
    for (const kind of ['duck', 'ring', 'ball', 'board', 'flamingo']) {
      const model = createToyModel(kind); model.rotation.y = kind === 'board' ? -0.2 : -0.4; if (kind === 'duck') model.scale.setScalar(1.6); else if (kind === 'ball') model.scale.setScalar(1.6); else if (kind === 'ring') model.scale.setScalar(1.25);
      if (kind === 'flamingo') model.position.y = -0.22;
      preview.add(model); this.renderer.setRenderTarget(target); this.renderer.render(preview, camera);
      const data = new Uint8Array(160 * 120 * 4); this.renderer.readRenderTargetPixels(target, 0, 0, 160, 120, data);
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 120;
      const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(160, 120);
      for (let y = 0; y < 120; y++) pixels.data.set(data.subarray((119 - y) * 640, (120 - y) * 640), y * 640);
      ctx.putImageData(pixels, 0, 0); const img = document.createElement('img'); img.src = canvas.toDataURL('image/png'); img.alt = ''; document.getElementById(`thumb-${kind}`).replaceChildren(img);
      preview.remove(model); model.traverse(c => c.geometry?.dispose());
    }
    this.renderer.setRenderTarget(null); this.renderer.setClearColor(oldClear, oldAlpha); target.dispose();
  }
}
