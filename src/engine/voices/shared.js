// One Karplus–Strong plucked string voice, implemented as a variable-length
// delay line (fractional read) so the pitch can glide. Bright noise excitation
// through a one-pole lowpass feedback loop => a struck/decaying tone. The voice
// palette (src/voicePresets.ts) drives brightness/damping/decay/jawari; the
// defaults below are the santoor baseline == the MVP voice.
//
// A voice can render several parallel KS lines (a "course") detuned by a few
// cents, since santoor/sitar/qanun sound 2–4 strings per note. Each line is a
// KSString holding its own delay-line state; the voice sums them and applies
// gain/jawari once. courseDetune=0 (or courseCount<=1) => a single string ==
// the old single-line timbre, sample-for-sample.

// A single plucked delay line: buffer + read/write pointers + the loop-lowpass
// state. Split out of KSVoice so a course can hold N of them cheaply. The math
// here is the original KS render, unchanged — the only additions are a per-
// string detune `ratio` (so a course/bend keeps its spread) and an optional
// `inject` in render() for sympathetic (taraf) coupling; inject defaults to 0,
// which is a no-op that reproduces the old buffer write exactly.
class KSString {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.buf = new Float32Array(2);
    this.w = 0; // write pointer into the delay line
    this.last = 0;
    this.lp = 0; // loop-lowpass state (brightness shapes the sustained tone)
    // Glide: the effective delay length slides from curLen -> targetLen over
    // glideRemain samples (meend portamento). No glide => curLen === targetLen.
    this.curLen = 2;
    this.targetLen = 2;
    this.glideRemain = 0;
    this.ratio = 1; // this string's detune vs. the course centre (1 = centre)
  }

  // Fill the delay line for a fresh pluck at `freq` (already detuned by ratio),
  // optionally gliding from `fromLen`. `excite(buf)` writes the shaped noise
  // burst so pick-position / velocity shaping lives in the voice, not here.
  pluck(freq, fromFreq, glideSamples, excite) {
    this.targetLen = Math.max(2, this.sr / freq);
    const fromLen = fromFreq && fromFreq > 0 ? Math.max(2, this.sr / fromFreq) : this.targetLen;
    this.curLen = fromLen;
    this.glideRemain = glideSamples;
    // Delay line must hold the longest delay we'll read (the lower pitch).
    const bufLen = Math.max(4, Math.ceil(Math.max(fromLen, this.targetLen)) + 2);
    this.buf = new Float32Array(bufLen);
    excite(this.buf);
    this.w = 0;
    this.last = 0;
    this.lp = 0;
  }

  // Andolan retune in place (no re-excitation). Grows the buffer for a lower
  // target, preserving ringing state chronologically so there's no click.
  bend(freq, glideSamples) {
    const newLen = Math.max(2, this.sr / freq);
    const need = Math.ceil(newLen) + 2;
    if (need > this.buf.length) {
      const N = this.buf.length;
      const grown = new Float32Array(need);
      for (let i = 0; i < N; i++) grown[i] = this.buf[(this.w + i) % N];
      this.buf = grown;
      this.w = N;
    }
    this.targetLen = newLen;
    this.glideRemain = glideSamples;
  }

  // Tune an idle (undamped) string to `freq` and clear it — used by the taraf
  // bank, whose strings are never plucked, only driven by `inject`.
  tune(freq) {
    const len = Math.max(2, this.sr / freq);
    this.curLen = len;
    this.targetLen = len;
    this.glideRemain = 0;
    this.buf = new Float32Array(Math.max(4, Math.ceil(len) + 2));
    this.w = 0;
    this.last = 0;
    this.lp = 0;
  }

  // One sample of the KS loop. Returns the interpolated read (pre-gain,
  // pre-jawari). `inject` adds an external excitation into the loop input for
  // sympathetic coupling; 0 => the original write, bit-for-bit.
  render(damp, brightness, inject) {
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
    this.lp = brightness * cur + (1 - brightness) * this.lp;
    const avg = damp * (this.lp + this.last);
    this.last = this.lp;
    this.buf[this.w] = avg + (inject || 0);
    this.w = (this.w + 1) % N;
    return cur;
  }
}

// A resonant bandpass biquad (RBJ). Cheap fixed-coefficient filter used in
// parallel to model a soundboard/gourd body resonance post-sum. Transposed
// direct form II for a compact state.
class Biquad {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
    this.z1 = 0; this.z2 = 0;
  }
  setBandpass(sr, freq, q) {
    const w0 = (2 * Math.PI * Math.max(1, freq)) / sr;
    const cw = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Math.max(0.0001, q));
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b1 = 0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * cw) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  process(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

class KSVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    // The course: one KSString by default (single string == old behavior).
    this.strings = [new KSString(sampleRate)];
    this.active = false;
    this.damp = 0.4975;
    this.gain = 0;
    // Voice-palette params (santoor baseline).
    this.brightness = 1.0; // excitation + loop lowpass amount (1 = bright)
    this.damping = 0.4975; // KS loop coefficient (< 0.5 for stability)
    this.decay = 0.99995; // per-sample gain falloff
    this.jawari = 0; // output waveshaper buzz (0..1)
    // New timbre params — all zeroed here reproduce the MVP single-string sound.
    this.courseDetune = 0; // cents spread across the course (0 = single string)
    this.courseCount = 1; // strings per note (1 = single string)
    this.pickPos = 0; // pick-position comb fraction 0..1 (0 = raw burst)
    this.velTrack = 0; // velocity->excitation-brightness coupling (0 = off)
    this._nActive = 1; // strings currently sounding (set on pluck)
  }

  // Backward-compat: older callers/tests read buf/curLen/targetLen off the voice
  // directly. Delegate to the centre (first) string so those keep working.
  get buf() { return this.strings[0].buf; }
  get curLen() { return this.strings[0].curLen; }
  get targetLen() { return this.strings[0].targetLen; }

  setParams(p) {
    this.brightness = p.brightness;
    this.damping = p.damping;
    this.decay = p.decay;
    this.jawari = p.jawari;
    this.courseDetune = p.courseDetune || 0;
    this.courseCount = Math.max(1, Math.round(p.courseCount || 1));
    this.pickPos = p.pickPos || 0;
    this.velTrack = p.velTrack || 0;
  }

  // Ensure the course holds `n` KSStrings (grown lazily; never shrinks the pool
  // to avoid churn — extras just go idle when courseCount drops).
  _ensureStrings(n) {
    while (this.strings.length < n) this.strings.push(new KSString(this.sr));
  }

  // Detune ratio for string k of n, spread symmetrically across courseDetune
  // cents (k=centre gets 1.0 when n is odd). n<=1 => always 1.0 (no spread).
  _ratio(k, n) {
    if (n <= 1 || this.courseDetune <= 0) return 1;
    const cents = this.courseDetune * (k / (n - 1) - 0.5); // -D/2 .. +D/2
    return Math.pow(2, cents / 1200);
  }

  // Build the shaped excitation burst into `buf` (length == string buffer). The
  // burst is white noise one-pole-lowpassed by `effBright` (warm<->bright), then
  // optionally comb-filtered at the pick position. effBright==brightness and
  // pickPos==0 reproduce the original raw burst exactly.
  _excite(buf, len, effBright) {
    let prev = 0;
    const a = effBright;
    for (let i = 0; i < buf.length; i++) {
      const white = Math.random() * 2 - 1;
      prev = a * white + (1 - a) * prev;
      buf[i] = prev;
    }
    // Pick-position comb: subtracting a delayed copy notches the harmonic whose
    // node sits under the pick, thinning the tone like plucking near the bridge.
    if (this.pickPos > 0) {
      const d = Math.round(this.pickPos * len);
      if (d >= 1 && d < buf.length) {
        for (let i = buf.length - 1; i >= d; i--) buf[i] -= buf[i - d];
      }
    }
  }

  pluck(freq, velocity, glideFromFreq) {
    const n = this.courseDetune > 0 ? this.courseCount : 1;
    this._ensureStrings(n);
    // Harder strikes get a brighter excitation lowpass (velTrack couples the
    // burst brightness to velocity); velTrack=0 => effBright==brightness (old).
    const effBright = Math.max(0, Math.min(1, this.brightness * (1 - this.velTrack * (1 - velocity))));
    const glide = glideFromFreq && glideFromFreq > 0 ? Math.round(this.sr * 0.08) : 0; // 80ms
    for (let k = 0; k < this.strings.length; k++) {
      const s = this.strings[k];
      if (k < n) {
        s.ratio = this._ratio(k, n);
        const f = freq * s.ratio;
        const from = glideFromFreq && glideFromFreq > 0 ? glideFromFreq * s.ratio : 0;
        const len = Math.max(2, this.sr / f);
        s.pluck(f, from, glide, (b) => this._excite(b, len, effBright));
      } else {
        // Idle any strings beyond the active course so they don't ring on.
        s.buf = new Float32Array(2);
        s.last = 0; s.lp = 0;
      }
    }
    this._nActive = n;
    this.active = true;
    this.gain = velocity;
    this.damp = this.damping;
  }

  // Andolan: retarget the ringing pitch smoothly over `seconds`, adding NO new
  // excitation. Bends every string in the course, preserving its detune ratio.
  bend(freq, seconds) {
    if (!this.active) return; // nothing ringing to bend; a bend never excites
    const glide = Math.max(1, Math.round(this.sr * Math.max(0, seconds)));
    const n = this._nActive || 1;
    for (let k = 0; k < n; k++) this.strings[k].bend(freq * this.strings[k].ratio, glide);
  }

  render() {
    if (!this.active) return 0;
    const n = this._nActive || 1;
    let cur = 0;
    for (let k = 0; k < n; k++) cur += this.strings[k].render(this.damp, this.brightness, 0);
    if (n > 1) cur /= n; // keep the summed course near a single string's level

    this.gain *= this.decay; // overall decay
    if (this.gain < 0.0001) this.active = false;
    // Jawari: tanh drive adds metallic harmonics (sitar). 0 => clean passthrough.
    const out = this.jawari > 0 ? Math.tanh(cur * (1 + this.jawari * 6)) : cur;
    return out * this.gain;
  }
}
