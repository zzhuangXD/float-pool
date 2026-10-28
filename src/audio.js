export class PoolAudio {
  constructor() { this.enabled = false; this.context = null; this.last = 0; }
  async toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) { this.enabled = false; return false; }
      this.context ??= new Audio(); await this.context.resume(); this.splash(0.5);
    }
    return this.enabled;
  }
  splash(strength = 0.6) {
    if (!this.enabled || !this.context || performance.now() - this.last < 110) return;
    this.last = performance.now(); const ctx = this.context, now = ctx.currentTime;
    const osc = ctx.createOscillator(), gain = ctx.createGain(); osc.type = 'sine';
    osc.frequency.setValueAtTime(370 + strength * 180, now); osc.frequency.exponentialRampToValueAtTime(95, now + 0.16);
    gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.035 * strength + 0.008, now + 0.01); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    osc.connect(gain).connect(ctx.destination); osc.start(now); osc.stop(now + 0.25);
    const length = Math.floor(ctx.sampleRate * 0.18), buffer = ctx.createBuffer(1, length, ctx.sampleRate), samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / length * 6);
    const noise = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), volume = ctx.createGain(); noise.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = 900; volume.gain.value = 0.04 * strength;
    noise.connect(filter).connect(volume).connect(ctx.destination); noise.start(now); noise.stop(now + 0.18);
  }
}
