// One Karplus–Strong plucked string voice, implemented as a variable-length
// delay line (fractional read) so the pitch can glide. Bright noise excitation
// through a one-pole lowpass feedback loop => a struck/decaying tone. The voice
// palette (src/voicePresets.ts) drives brightness/damping/decay/jawari; the
// defaults below are the santoor baseline == the MVP voice.
class KSVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.buf = new Float32Array(2);
    this.w = 0; // write pointer into the delay line
    this.active = false;
    this.damp = 0.4975;
    this.gain = 0;
    this.last = 0;
    this.lp = 0; // loop-lowpass state (brightness shapes the sustained tone)
    // Glide: the effective delay length slides from curLen -> targetLen over
    // glideRemain samples (meend portamento). No glide => curLen === targetLen.
    this.curLen = 2;
    this.targetLen = 2;
    this.glideRemain = 0;
    // Voice-palette params (santoor baseline).
    this.brightness = 1.0; // excitation lowpass amount (1 = bright/unfiltered)
    this.damping = 0.4975; // KS loop coefficient (< 0.5 for stability)
    this.decay = 0.99995; // per-sample gain falloff
    this.jawari = 0; // output waveshaper buzz (0..1)
  }

  setParams(p) {
    this.brightness = p.brightness;
    this.damping = p.damping;
    this.decay = p.decay;
    this.jawari = p.jawari;
  }

  pluck(freq, velocity, glideFromFreq) {
    this.targetLen = Math.max(2, this.sr / freq);
    const fromLen = glideFromFreq && glideFromFreq > 0 ? Math.max(2, this.sr / glideFromFreq) : this.targetLen;
    this.curLen = fromLen;
    this.glideRemain = glideFromFreq && glideFromFreq > 0 ? Math.round(this.sr * 0.08) : 0; // 80ms

    // Delay line must hold the longest delay we'll read (the lower pitch).
    const bufLen = Math.max(4, Math.ceil(Math.max(fromLen, this.targetLen)) + 2);
    this.buf = new Float32Array(bufLen);
    // Excitation: white noise one-pole-lowpassed by brightness (warm <-> bright).
    let prev = 0;
    const a = this.brightness;
    for (let i = 0; i < bufLen; i++) {
      const white = Math.random() * 2 - 1;
      prev = a * white + (1 - a) * prev;
      this.buf[i] = prev;
    }
    this.w = 0;
    this.active = true;
    this.gain = velocity;
    this.damp = this.damping;
    this.last = 0;
    this.lp = 0;
  }

  render() {
    if (!this.active) return 0;
    // Advance the glide toward the target delay length.
    if (this.glideRemain > 0) {
      this.curLen += (this.targetLen - this.curLen) / this.glideRemain;
      this.glideRemain--;
    } else {
      this.curLen = this.targetLen;
    }

    const N = this.buf.length;
    // Fractional read at (w - curLen): linear interpolation between two taps.
    let rp = this.w - this.curLen;
    rp = ((rp % N) + N) % N;
    const i0 = Math.floor(rp);
    const frac = rp - i0;
    const i1 = (i0 + 1) % N;
    const cur = this.buf[i0] * (1 - frac) + this.buf[i1] * frac;

    // Loop lowpass: brightness sets how much treble survives each pass, so it
    // colours the SUSTAINED tone. brightness=1 => lp=cur => plain KS loop.
    this.lp = this.brightness * cur + (1 - this.brightness) * this.lp;
    const avg = this.damp * (this.lp + this.last);
    this.last = this.lp;
    this.buf[this.w] = avg;
    this.w = (this.w + 1) % N;

    this.gain *= this.decay; // overall decay
    if (this.gain < 0.0001) this.active = false;
    // Jawari: tanh drive adds metallic harmonics (sitar). 0 => clean passthrough.
    const out = this.jawari > 0 ? Math.tanh(cur * (1 + this.jawari * 6)) : cur;
    return out * this.gain;
  }
}
