export const POOL = Object.freeze({ rx: 3.87, rz: 2.57, level: 0.83, floor: 0.12 });

/** A damped finite-difference wave equation, with reflecting elliptical walls. */
export class WaterField {
  constructor(nx = 112, nz = 80) {
    this.nx = nx; this.nz = nz;
    this.dx = POOL.rx * 2 / (nx - 1); this.dz = POOL.rz * 2 / (nz - 1);
    this.height = new Float32Array(nx * nz);
    this.velocity = new Float32Array(nx * nz);
    this.mask = new Uint8Array(nx * nz);
    this.neighbors = new Int32Array(nx * nz * 4);
    this.active = []; this.time = 0; this.wind = 0.25;
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
  step(dt = 1 / 120) {
    this.time += dt;
    const h = this.height, v = this.velocity, n = this.neighbors;
    const invX = 1 / this.dx ** 2, invZ = 1 / this.dz ** 2;
    const damping = Math.exp(-1.15 * dt), c2 = 2.7 ** 2;
    for (const i of this.active) {
      const p = i * 4;
      const lap = (h[n[p]] + h[n[p + 1]] - 2 * h[i]) * invX + (h[n[p + 2]] + h[n[p + 3]] - 2 * h[i]) * invZ;
      v[i] = (v[i] + c2 * lap * dt) * damping;
    }
    for (const i of this.active) h[i] += v[i] * dt;
  }
  ambient(x, z) { return this.wind * 0.018 * (Math.sin(x * 2.2 + z * 1.4 + this.time * 1.3) + 0.5 * Math.sin(z * 3.1 - this.time * 1.1)); }
  sample(x, z, withAmbient = true) {
    const fx = Math.max(0, Math.min(this.nx - 1.001, (x + POOL.rx) / this.dx));
    const fz = Math.max(0, Math.min(this.nz - 1.001, (z + POOL.rz) / this.dz));
    const ix = Math.floor(fx), iz = Math.floor(fz), a = fx - ix, b = fz - iz, i = iz * this.nx + ix;
    const h = this.height;
    return (h[i] * (1 - a) + h[i + 1] * a) * (1 - b) + (h[i + this.nx] * (1 - a) + h[i + this.nx + 1] * a) * b + (withAmbient ? this.ambient(x, z) : 0);
  }
  slope(x, z) {
    return { x: (this.sample(x + this.dx, z) - this.sample(x - this.dx, z)) / (2 * this.dx), z: (this.sample(x, z + this.dz) - this.sample(x, z - this.dz)) / (2 * this.dz) };
  }
  energy() { let e = 0; for (const i of this.active) e += this.height[i] ** 2 + this.velocity[i] ** 2 * 0.005; return e; }
  reset() { this.height.fill(0); this.velocity.fill(0); }
}
