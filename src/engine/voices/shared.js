// One Karplus–Strong plucked string voice. Bright noise excitation through a
// one-pole lowpass feedback loop => a struck/decaying tone (santoor/koto-ish).
class KSVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.buf = new Float32Array(1);
    this.idx = 0;
    this.len = 1;
    this.active = false;
    this.damp = 0.5;
    this.gain = 0;
    this.last = 0;
    // Glide state.
    this.glideSamples = 0;
    this.glideFromLen = 0;
  }

  pluck(freq, velocity, glideFromFreq) {
    this.len = Math.max(2, Math.round(this.sr / freq));
    this.buf = new Float32Array(this.len);
    for (let i = 0; i < this.len; i++) this.buf[i] = Math.random() * 2 - 1;
    this.idx = 0;
    this.active = true;
    this.gain = velocity;
    this.damp = 0.495 + velocity * 0.01;
    this.last = 0;
    if (glideFromFreq && glideFromFreq > 0) {
      this.glideFromLen = Math.max(2, Math.round(this.sr / glideFromFreq));
      this.glideSamples = Math.round(this.sr * 0.08); // 80ms portamento
    } else {
      this.glideSamples = 0;
    }
  }

  render() {
    if (!this.active) return 0;
    const cur = this.buf[this.idx];
    const nextIdx = (this.idx + 1) % this.len;
    const avg = this.damp * (cur + this.last);
    this.last = cur;
    this.buf[this.idx] = avg;
    this.idx = nextIdx;
    this.gain *= 0.99995; // slow overall decay
    if (this.gain < 0.0001) this.active = false;
    return cur * this.gain;
  }
}
