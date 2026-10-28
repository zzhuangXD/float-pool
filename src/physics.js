import * as C from 'cannon-es';
import { POOL, WaterField } from './water.js';

const FIXED = 1 / 120;
export const TOYS = {
  duck: { mass: 0.28, radius: 0.36, draft: 0.12, sampleY: -0.17, spreadX: 0.15, spreadZ: 0.2 },
  ring: { mass: 0.42, radius: 0.67, draft: 0.095, sampleY: -0.13, spreadX: 0.4, spreadZ: 0.4 },
  flamingo: { mass: 0.5, radius: 0.68, draft: 0.1, sampleY: -0.12, spreadX: 0.38, spreadZ: 0.4 },
  ball: { mass: 0.32, radius: 0.41, draft: 0.12, sampleY: -0.3, spreadX: 0.13, spreadZ: 0.13 },
  board: { mass: 0.85, radius: 1.05, draft: 0.065, sampleY: -0.04, spreadX: 0.27, spreadZ: 0.76 },
};

export class PoolPhysics {
  constructor() {
    this.water = new WaterField(); this.items = []; this.accumulator = 0; this.time = 0; this.id = 0; this.grabbed = null;
    this.world = new C.World({ gravity: new C.Vec3(0, -9.81, 0), allowSleep: false });
    this.world.solver.iterations = 10;
    this.world.defaultContactMaterial.friction = 0.13;
    this.world.defaultContactMaterial.restitution = 0.35;
    const floor = new C.Body({ mass: 0, shape: new C.Plane(), position: new C.Vec3(0, POOL.floor, 0) });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0); this.world.addBody(floor);
    // Short tangent colliders give the inflatable oval a continuous inner wall.
    for (let i = 0; i < 64; i++) {
      const t = i / 64 * Math.PI * 2, rx = 3.98, rz = 2.7;
      const dx = -rx * Math.sin(t), dz = rz * Math.cos(t);
      const wall = new C.Body({ mass: 0, shape: new C.Box(new C.Vec3(0.1, 0.65, Math.hypot(dx, dz) * Math.PI / 64 + 0.035)), position: new C.Vec3(rx * Math.cos(t), 0.55, rz * Math.sin(t)) });
      wall.quaternion.setFromEuler(0, Math.atan2(dx, dz), 0); this.world.addBody(wall);
    }
  }
  spawn(kind, options = {}) {
    if (!TOYS[kind] || this.items.length >= 22) return null;
    const spec = TOYS[kind], scale = options.scale ?? 1;
    const pos = this.water.clamp(options.x ?? (Math.random() - 0.5) * 4.3, options.z ?? (Math.random() - 0.5) * 2.7, kind === 'board' ? 1 : 0.7);
    const body = new C.Body({ mass: spec.mass * scale ** 3, linearDamping: 0.16, angularDamping: kind === 'ball' ? 0.2 : 0.53 });
    if (kind === 'board') body.addShape(new C.Box(new C.Vec3(0.36 * scale, 0.1 * scale, 1.03 * scale)));
    else if (kind === 'ring' || kind === 'flamingo') {
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; body.addShape(new C.Sphere(0.17 * scale), new C.Vec3(Math.cos(a) * 0.47 * scale, 0, Math.sin(a) * 0.47 * scale)); }
    } else body.addShape(new C.Sphere((kind === 'duck' ? 0.29 : 0.41) * scale));
    body.position.set(pos.x, options.y ?? POOL.level + 0.42, pos.z);
    body.quaternion.setFromEuler(0, options.yaw ?? Math.random() * Math.PI * 2, 0);
    const samples = [];
    for (const x of [-spec.spreadX, spec.spreadX]) for (const z of [-spec.spreadZ, spec.spreadZ]) samples.push(new C.Vec3(x * scale, spec.sampleY * scale, z * scale));
    const item = { id: ++this.id, kind, scale, body, samples, draft: spec.draft * scale, previousY: body.position.y, previousX: body.position.x, previousZ: body.position.z, splashCooldown: 0, wet: false };
    body.addEventListener('collide', (event) => {
      const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
      if (impact > 0.4 && item.splashCooldown <= 0) { this.water.disturb(body.position.x, body.position.z, Math.min(0.09, impact * 0.018), 0.25); item.splashCooldown = 0.18; }
    });
    this.world.addBody(body); this.items.push(item); return item;
  }
  removeAll() { this.release(); for (const item of this.items) this.world.removeBody(item.body); this.items.length = 0; this.water.reset(); }
  reset() {
    this.removeAll();
    const arrangement = [
      ['board', -1.6, -0.75, -0.55, 1], ['duck', -2.0, 0.85, -2.45, 1],
      ['duck', 0, -1.65, -1.7, 0.78], ['ball', 2.35, -0.75, 1.1, 1],
      ['ring', 1.7, 0.95, 0.5, 1], ['flamingo', -0.15, 0.65, 0.4, 1],
      ['ring', 1.05, -1.1, 1.5, 0.8],
    ];
    for (const [kind, x, z, yaw, scale] of arrangement) this.spawn(kind, { x, z, yaw, scale, y: POOL.level - (TOYS[kind].sampleY + TOYS[kind].draft) * scale + 0.04 });
  }
  grab(item, target) { this.grabbed = { item, target: new C.Vec3(target.x, target.y, target.z), pressed: false }; }
  moveGrab(x, z, pressed = false) {
    if (!this.grabbed) return;
    const g = this.grabbed, margin = g.item.kind === 'board' ? 0.95 : TOYS[g.item.kind].radius * g.item.scale + 0.08;
    const p = this.water.clamp(x, z, margin);
    g.target.set(p.x, POOL.level + (pressed ? -0.5 : 0.12), p.z); g.pressed = pressed;
  }
  release() { const old = this.grabbed; this.grabbed = null; return old?.item; }
  splash(x = 0, z = 0, strength = 0.22) {
    this.water.disturb(x, z, strength, 0.35);
    for (const { body } of this.items) {
      const dx = body.position.x - x, dz = body.position.z - z, d = Math.hypot(dx, dz);
      const falloff = Math.exp(-d * 0.7);
      body.applyImpulse(new C.Vec3(dx / (d + 0.1) * strength * body.mass * falloff * 2, strength * body.mass * falloff * 2.5, dz / (d + 0.1) * strength * body.mass * falloff * 2));
    }
  }
  step(dt) {
    this.accumulator += Math.min(Math.max(dt, 0), 0.0667);
    while (this.accumulator >= FIXED) {
      this.accumulator -= FIXED; this.time += FIXED;
      this.water.step(FIXED);
      for (const item of this.items) this.applyBuoyancy(item);
      if (this.grabbed) {
        const { item, target } = this.grabbed, b = item.body;
        const spring = item.kind === 'board' ? 105 : 95, damping = 17;
        b.applyForce(new C.Vec3(
          ((target.x - b.position.x) * spring - b.velocity.x * damping) * b.mass,
          ((target.y - b.position.y) * spring - b.velocity.y * damping) * b.mass,
          ((target.z - b.position.z) * spring - b.velocity.z * damping) * b.mass,
        ));
      }
      this.world.step(FIXED);
      for (const item of this.items) this.coupleWaves(item);
    }
  }
  applyBuoyancy(item) {
    const b = item.body, n = item.samples.length;
    if (item.kind === 'ball') {
      // A sphere's submerged cap is independent of rotation. Body-local sample
      // points alone would incorrectly let a rolling beach ball sink.
      const r = 0.41 * item.scale, level = POOL.level + this.water.sample(b.position.x, b.position.z);
      const h = Math.max(0, Math.min(2 * r, level - b.position.y + r));
      const fraction = h * h * (3 * r - h) / (4 * r ** 3);
      const buoyancy = fraction / 0.3, wet = Math.min(buoyancy, 1.3), slope = this.water.slope(b.position.x, b.position.z);
      b.applyForce(new C.Vec3(-b.velocity.x * b.mass * 2.7 * wet - slope.x * b.mass * 4.4, b.mass * (9.81 * buoyancy - b.velocity.y * 5.4 * wet), -b.velocity.z * b.mass * 2.7 * wet - slope.z * b.mass * 4.4));
      return;
    }
    for (const local of item.samples) {
      const wp = b.pointToWorldFrame(local), relative = wp.vsub(b.position);
      const level = POOL.level + this.water.sample(wp.x, wp.z);
      const depth = level - wp.y;
      if (depth <= 0 || !this.water.contains(wp.x, wp.z, -0.05)) continue;
      const immersion = Math.min(depth / item.draft, 3.2);
      const velocity = new C.Vec3(); b.getVelocityAtWorldPoint(wp, velocity);
      const slope = this.water.slope(wp.x, wp.z);
      const mass = b.mass / n;
      b.applyForce(new C.Vec3(
        -velocity.x * mass * 2.7 - slope.x * mass * 4.4,
        immersion * mass * 9.81 - velocity.y * mass * 5.4,
        -velocity.z * mass * 2.7 - slope.z * mass * 4.4,
      ), relative);
    }
    // Ballast in the bottom of the hollow toy gives it a restoring moment.
    // Without this, fully submerging bottom samples can invert a rubber duck.
    const up = b.quaternion.vmult(new C.Vec3(0, 1, 0)), slope = this.water.slope(b.position.x, b.position.z);
    const normal = new C.Vec3(-slope.x * 0.35, 1, -slope.z * 0.35); normal.normalize();
    const restoring = up.cross(normal);
    b.torque.x += b.mass * (restoring.x * 8 - b.angularVelocity.x * 0.75);
    b.torque.z += b.mass * (restoring.z * 8 - b.angularVelocity.z * 0.75);
  }
  coupleWaves(item) {
    const b = item.body; item.splashCooldown -= FIXED;
    const depth = POOL.level + this.water.sample(b.position.x, b.position.z) - (b.position.y + TOYS[item.kind].sampleY * item.scale);
    const wet = depth > 0;
    if (wet && !item.wet && b.velocity.y < -0.2 && item.splashCooldown <= 0) {
      this.water.disturb(b.position.x, b.position.z, Math.min(0.16, Math.abs(b.velocity.y) * 0.05), 0.28 * item.scale);
      item.splashCooldown = 0.15;
    }
    const distance = Math.hypot(b.position.x - item.previousX, b.position.z - item.previousZ);
    if (wet && distance > 0.055) {
      this.water.disturb(b.position.x, b.position.z, Math.min(0.035, Math.hypot(b.velocity.x, b.velocity.z) * 0.008), 0.22 * item.scale);
      item.previousX = b.position.x; item.previousZ = b.position.z;
    }
    // Moving a body vertically displaces water as well as receiving its force.
    if (wet && item.splashCooldown <= 0 && Math.abs(b.velocity.y) > 0.18) {
      this.water.disturb(b.position.x, b.position.z, Math.max(-0.012, Math.min(0.012, -b.velocity.y * 0.007)), 0.25 * item.scale);
      item.splashCooldown = 0.07;
    }
    // An out-of-bounds recovery handles an aggressively thrown toy gracefully.
    if (b.position.y < -2 || Math.abs(b.position.x) > 6 || Math.abs(b.position.z) > 5) {
      const p = this.water.clamp(b.position.x, b.position.z, 1);
      b.position.set(p.x, POOL.level + 0.4, p.z); b.velocity.setZero(); b.angularVelocity.setZero();
    }
    item.wet = wet; item.previousY = b.position.y;
  }
  snapshot() {
    return { time: this.time, energy: this.water.energy(), wind: this.water.wind, count: this.items.length, grabbed: this.grabbed?.item.id ?? null, items: this.items.map(i => ({ id: i.id, kind: i.kind, position: { x: i.body.position.x, y: i.body.position.y, z: i.body.position.z }, velocity: { x: i.body.velocity.x, y: i.body.velocity.y, z: i.body.velocity.z } })) };
  }
}
