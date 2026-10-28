import test from 'node:test';
import assert from 'node:assert/strict';
import { WaterField, POOL } from '../src/water.js';
import { PoolPhysics } from '../src/physics.js';

function advance(p, seconds, dt = 1 / 120) { for (let i = 0; i < Math.round(seconds / dt); i++) p.step(dt); }

test('a local disturbance propagates, stays inside the oval, and dissipates', () => {
  const water = new WaterField(); water.wind = 0;
  assert.equal(water.disturb(5, 0), false);
  water.disturb(0, 0, 0.2, 0.22);
  const initial = water.energy();
  for (let i = 0; i < 54; i++) water.step();
  assert.ok(Math.abs(water.sample(1, 0, false)) > 0.0001, 'wave should reach a point away from the click');
  for (let i = 0; i < 1200; i++) water.step();
  assert.ok(water.energy() < initial * 0.02, 'waves should settle without pumping energy');
  for (let i = 0; i < water.height.length; i++) {
    assert.ok(Number.isFinite(water.height[i]));
    if (!water.mask[i]) assert.equal(water.height[i], 0);
  }
});

test('all five toy types float, including a rotating beach ball', () => {
  for (const kind of ['duck', 'ring', 'ball', 'board', 'flamingo']) {
    const p = new PoolPhysics(); p.water.wind = 0;
    const item = p.spawn(kind, { x: 0, z: 0, yaw: 0.4, y: 1.7 });
    if (kind === 'ball') item.body.angularVelocity.set(2, 1, 3);
    advance(p, 15);
    assert.ok(item.body.position.y > 0.7 && item.body.position.y < 1.2, `${kind} sank or remained in the air: ${item.body.position.y}`);
    assert.ok(Math.abs(item.body.velocity.y) < 0.03, `${kind} never settled`);
  }
});

test('a passing ripple transports every toy, without an instant global kick', () => {
  for (const kind of ['duck', 'ring', 'ball', 'board', 'flamingo']) {
    const p = new PoolPhysics(); p.water.wind = 0;
    const item = p.spawn(kind, { x: 0.5, z: 0, yaw: 0 }); advance(p, 8);
    const start = item.body.position.clone(), velocity = item.body.velocity.clone();
    p.splash(-0.7, 0, 0.21);
    assert.ok(item.body.velocity.almostEquals(velocity, 1e-12), `${kind}: wave should propagate before moving the float`);
    advance(p, 0.1);
    assert.ok(Math.abs(item.body.position.x - start.x) < 0.002, `${kind}: response arrived before the wave`);
    let travel = 0, tilt = 0;
    for (let frame = 0; frame < 468; frame++) {
      p.step(1 / 120);
      travel = Math.max(travel, Math.hypot(item.body.position.x - start.x, item.body.position.z - start.z));
      const up = item.body.quaternion.vmult({ x: 0, y: 1, z: 0 });
      tilt = Math.max(tilt, Math.acos(Math.max(-1, Math.min(1, up.y))));
    }
    assert.ok(travel > 0.1 && travel < 0.65, `${kind}: tap should produce visible, bounded drift: ${travel}`);
    assert.ok(tilt > 0.04 && tilt < 0.6, `${kind}: wave should visibly rock or roll the toy: ${tilt}`);
    advance(p, 12);
    assert.ok(item.body.position.y > 0.7 && item.body.position.y < 1.2, `${kind}: must still float after the wave`);
    assert.ok(Math.hypot(item.body.velocity.x, item.body.velocity.z) < 0.03, `${kind}: drift should settle`);
  }
});

test('surface-current pulses remain bounded and reset removes residual flow', () => {
  const water = new WaterField(); water.wind = 0;
  for (let i = 0; i < 100; i++) water.launchWave(Math.sin(i), Math.cos(i), 0.07, 0.23);
  assert.ok(water.pulses.length <= 24);
  for (let i = 0; i < 90; i++) water.step();
  assert.ok(Math.hypot(water.motion(1.5, 0).x, water.motion(1.5, 0).z) > 0.001);
  water.reset();
  assert.deepEqual(water.motion(1.5, 0), { x: 0, y: 0, z: 0 });
  assert.equal(water.energy(), 0);
});

test('every pressed toy displaces water, resurfaces and rights itself', () => {
  for (const kind of ['duck', 'ring', 'flamingo', 'board', 'ball']) {
    const p = new PoolPhysics(); p.water.wind = 0;
    const item = p.spawn(kind, { x: 0, z: 0, yaw: 0 }); advance(p, 8);
    const resting = item.body.position.y;
    p.grab(item, item.body.position); p.moveGrab(0, 0, true); advance(p, 1.5);
    assert.ok(item.body.position.y < resting - 0.2, `${kind}: long press should submerge the toy`);
    assert.ok(p.water.energy() > 0.00001, `${kind}: submerging should create waves`);
    p.release(); advance(p, 12);
    assert.ok(Math.abs(item.body.position.y - resting) < 0.025, `${kind}: release should restore floating`);
  }
});

test('dragging and collisions remain finite under repeated splashes', () => {
  const p = new PoolPhysics(); p.reset();
  p.grab(p.items[1], p.items[1].body.position); p.moveGrab(2.6, 0.2);
  advance(p, 2); p.release();
  assert.ok(p.items[1].body.position.x > 1.6, 'drag spring should move the toy');
  for (let j = 0; j < 15; j++) { p.splash(Math.sin(j) * 2, Math.cos(j), 0.3); advance(p, 1); }
  for (const item of p.snapshot().items) {
    for (const value of Object.values(item.position)) assert.ok(Number.isFinite(value));
    assert.ok(item.position.y > POOL.floor && item.position.y < 1.6);
    assert.ok(Math.abs(item.position.x) < 4.2 && Math.abs(item.position.z) < 3);
  }
});

test('physics time and buoyancy are independent of display refresh rate', () => {
  const a = new PoolPhysics(), b = new PoolPhysics(); a.water.wind = b.water.wind = 0;
  a.spawn('duck', { x: 0, z: 0, y: 1.2, yaw: 0 }); b.spawn('duck', { x: 0, z: 0, y: 1.2, yaw: 0 });
  advance(a, 5, 1 / 120); advance(b, 5, 1 / 30);
  assert.ok(Math.abs(a.items[0].body.position.y - b.items[0].body.position.y) < 0.0001);
});
