export const POOL = Object.freeze({ rx: 3.87, rz: 2.57, level: 0.83, floor: 0.12 });
const WAVE_SPEED = 2.7;

/** A damped finite-difference wave equation, with reflecting elliptical walls. */
export class WaterField {
  constructor(nx = 112, nz = 80) {
    this.nx = nx; this.nz = nz;
    this.dx = POOL.rx * 2 / (nx - 1); this.dz = POOL.rz * 2 / (nz - 1);
    this.height = new Float32Array(nx * nz);
    this.velocity = new Float32Array(nx * nz);
    this.flowX = new Float32Array(nx * nz);
    this.flowZ = new Float32Array(nx * nz);
    this.mask = new Uint8Array(nx * nz);
    this.neighbors = new Int32Array(nx * nz * 4);
    this.active = []; this.time = 0; this.wind = 0.25; this.pulses = [];
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const i = z * nx + x;
      const px = x * this.dx - POOL.rx, pz = z * this.dz - POOL.rz;
      if ((px / POOL.rx) ** 2 + (pz / POOL.rz) ** 2 <= 1) { this.mask[i] = 1; this.active.push(i); }
    }
    for (const i of this.active) {
      const adjacent = [i - 1, i + 1, i - nx, i + nx];
      for (let n = 0; n < 4; n++) this.neighbors[i * 4 + n] = this.mask[adjacent[n]] ? adjacent[n] : i;
    }
  }
  contains(x, z, margin = 0) { return (x / (POOL.rx - margin)) ** 2 + (z / (POOL.rz - margin)) ** 2 < 1; }
  clamp(x, z, margin = 0.28) {
    const length = Math.hypot(x / (POOL.rx - margin), z / (POOL.rz - margin));
    return length > 1 ? { x: x / length, z: z / length } : { x, z };
  }
  disturb(x, z, strength = 0.12, radius = 0.23) {
    if (!this.contains(x, z)) return false;
    const cx = (x + POOL.rx) / this.dx, cz = (z + POOL.rz) / this.dz;
    const rx = Math.ceil(radius * 3 / this.dx), rz = Math.ceil(radius * 3 / this.dz);
    for (let iz = Math.max(0, Math.floor(cz - rz)); iz <= Math.min(this.nz - 1, cz + rz); iz++) {
      for (let ix = Math.max(0, Math.floor(cx - rx)); ix <= Math.min(this.nx - 1, cx + rx); ix++) {
        const i = iz * this.nx + ix;
        if (!this.mask[i]) continue;
        const r2 = ((ix - cx) * this.dx) ** 2 + ((iz - cz) * this.dz) ** 2;
        // A compact, near zero-volume disturbance avoids raising the whole pool.
        const bump = Math.exp(-r2 / (radius * radius * 0.5)) - 0.25 * Math.exp(-r2 / (radius * radius * 2));
        this.height[i] = Math.max(-0.25, Math.min(0.25, this.height[i] + bump * strength));
      }
    }
    return true;
  }
  launchWave(x, z, strength = 0.21, radius = 0.48) {
    if (!this.disturb(x, z, strength, radius)) return false;
    // Approximate the outward transport from a hand pushing water. Its crest
    // travels with the simulated wave instead of kicking every toy instantly.
    this.pulses.push({ x, z, strength, radius, time: this.time });
    if (this.pulses.length > 24) this.pulses.shift();
    return true;
  }
  step(dt = 1 / 120) {
    this.time += dt;
    while (this.pulses.length && this.time - this.pulses[0].time > 4) this.pulses.shift();
    const h = this.height, v = this.velocity, n = this.neighbors;
    const invX = 1 / this.dx ** 2, invZ = 1 / this.dz ** 2;
    const damping = Math.exp(-0.72 * dt), flowDamping = Math.exp(-0.9 * dt), c2 = WAVE_SPEED ** 2;
    for (const i of this.active) {
      const p = i * 4;
      const lap = (h[n[p]] + h[n[p + 1]] - 2 * h[i]) * invX + (h[n[p + 2]] + h[n[p + 3]] - 2 * h[i]) * invZ;
      v[i] = (v[i] + c2 * lap * dt) * damping;
      // Wave slopes accelerate the water horizontally. Floats can then receive
      // the local moving-water velocity when the wave actually reaches them.
      const gx = (h[n[p + 1]] - h[n[p]]) / (2 * this.dx);
      const gz = (h[n[p + 3]] - h[n[p + 2]]) / (2 * this.dz);
      this.flowX[i] = (this.flowX[i] - 9.81 * gx * dt) * flowDamping;
      this.flowZ[i] = (this.flowZ[i] - 9.81 * gz * dt) * flowDamping;
    }
    for (const i of this.active) h[i] += v[i] * dt;
  }
  ambient(x, z) { return this.wind * 0.018 * (Math.sin(x * 2.2 + z * 1.4 + this.time * 1.3) + 0.5 * Math.sin(z * 3.1 - this.time * 1.1)); }
  interpolate(values, x, z) {
    const fx = Math.max(0, Math.min(this.nx - 1.001, (x + POOL.rx) / this.dx));
    const fz = Math.max(0, Math.min(this.nz - 1.001, (z + POOL.rz) / this.dz));
    const ix = Math.floor(fx), iz = Math.floor(fz), a = fx - ix, b = fz - iz, i = iz * this.nx + ix;
    return (values[i] * (1 - a) + values[i + 1] * a) * (1 - b) + (values[i + this.nx] * (1 - a) + values[i + this.nx + 1] * a) * b;
  }
  sample(x, z, withAmbient = true) { return this.interpolate(this.height, x, z) + (withAmbient ? this.ambient(x, z) : 0); }
  motion(x, z) {
    const ambientVelocity = this.wind * 0.018 * (1.3 * Math.cos(x * 2.2 + z * 1.4 + this.time * 1.3) - 0.55 * Math.cos(z * 3.1 - this.time * 1.1));
    const flow = { x: this.interpolate(this.flowX, x, z), y: this.interpolate(this.velocity, x, z) + ambientVelocity, z: this.interpolate(this.flowZ, x, z) };
    for (const pulse of this.pulses) {
      const dx = x - pulse.x, dz = z - pulse.z, distance = Math.hypot(dx, dz);
      if (distance < 0.001) continue;
      const front = (this.time - pulse.time) * WAVE_SPEED, width = pulse.radius + distance * 0.1;
      const offset = (distance - front) / width;
      if (Math.abs(offset) > 2.5) continue;
      const speed = pulse.strength * WAVE_SPEED * Math.exp(-2 * offset * offset - distance * 0.25) / Math.sqrt(1 + distance * 0.7);
      flow.x += dx / distance * speed; flow.z += dz / distance * speed;
    }
    return flow;
  }
  slope(x, z) {
    return { x: (this.sample(x + this.dx, z) - this.sample(x - this.dx, z)) / (2 * this.dx), z: (this.sample(x, z + this.dz) - this.sample(x, z - this.dz)) / (2 * this.dz) };
  }
  energy() { let e = 0; for (const i of this.active) e += this.height[i] ** 2 + this.velocity[i] ** 2 * 0.005; return e; }
  reset() { this.height.fill(0); this.velocity.fill(0); this.flowX.fill(0); this.flowZ.fill(0); this.pulses.length = 0; }
}
