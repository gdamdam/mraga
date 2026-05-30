// One Karplus–Strong plucked string voice. Bright noise excitation through a
// one-pole lowpass feedback loop => a struck/decaying tone. The voice palette
// (src/voicePresets.ts) drives brightness/damping/decay/jawari; the defaults
// below are the santoor baseline == the MVP voice.
class KSVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.buf = new Float32Array(1);
    this.idx = 0;
    this.len = 1;
    this.active = false;
    this.damp = 0.4975;
    this.gain = 0;
    this.last = 0;
    // Glide state (declared; portamento rendering is a future enhancement).
    this.glideSamples = 0;
    this.glideFromLen = 0;
    // Voice-palette params (santoor baseline).
    this.brightness = 1.0; // excitation lowpass amount (1 = bright/unfiltered)
    this.damping = 0.4975; // KS loop coefficient (< 0.5 for stability)
    this.decay = 0.99995;  // per-sample gain falloff
    this.jawari = 0;       // output waveshaper buzz (0..1)
  }

  setParams(p) {
    this.brightness = p.brightness;
    this.damping = p.damping;
    this.decay = p.decay;
    this.jawari = p.jawari;
  }

  pluck(freq, velocity, glideFromFreq) {
    this.len = Math.max(2, Math.round(this.sr / freq));
    this.buf = new Float32Array(this.len);
    // Excitation: white noise one-pole-lowpassed by brightness (warm <-> bright).
    let prev = 0;
    const a = this.brightness;
    for (let i = 0; i < this.len; i++) {
      const white = Math.random() * 2 - 1;
      prev = a * white + (1 - a) * prev;
      this.buf[i] = prev;
    }
    this.idx = 0;
    this.active = true;
    this.gain = velocity;
    this.damp = this.damping;
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
    this.gain *= this.decay; // overall decay
    if (this.gain < 0.0001) this.active = false;
    // Jawari: tanh drive adds metallic harmonics (sitar). 0 => clean passthrough.
    const out = this.jawari > 0 ? Math.tanh(cur * (1 + this.jawari * 6)) : cur;
    return out * this.gain;
  }
}
