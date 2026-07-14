// mraga voice processor. Holds a pool of KS voices so rings overlap (spec §7),
// plus two shared post-sum stages that model the physical instrument body:
//   - body resonance: a few parallel bandpass biquads (soundboard/gourd), and
//   - taraf: a quiet bank of undamped sympathetic strings tuned to the raga's
//     strong degrees, driven by a low-gain tap of the pooled output.
// Both are no-ops when their preset params are empty/zero, so a preset with the
// new fields zeroed reproduces the original pooled KS timbre.
// Messages:
//   { type: "pluck", freq, velocity, glideFromFreq } — round-robin a voice
//   { type: "bend", freq, seconds } — glide the last-plucked voice's pitch, no re-pluck (andolan)
//   { type: "preset", params } — set the active voice flavour + body/taraf config
//   { type: "taraf", freqs } — (re)tune the sympathetic-string bank
class MragaVoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const POOL = 8;
    this.voices = [];
    for (let i = 0; i < POOL; i++) this.voices.push(new KSVoice(sampleRate));
    this.rr = 0;
    this.lastVoice = null; // most recently plucked voice; andolan bends target it
    // Post-sum body resonance (parallel bandpass). Empty => bypass.
    this.body = [];
    this.bodyGain = [];
    // Sympathetic-string bank. Empty (or tarafSend=0) => bypass.
    this.taraf = [];
    this.tarafSend = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === "pluck") {
        const v = this.voices[this.rr];
        this.rr = (this.rr + 1) % this.voices.length;
        // Clamp velocity at the audio boundary: the KS loop filter is only
        // conditionally stable (DC gain slightly >1), so a stray velocity >1
        // could spike before the gain envelope pulls it down.
        const vel = Math.max(0, Math.min(1, m.velocity));
        v.pluck(m.freq, vel, m.glideFromFreq);
        this.lastVoice = v;
      } else if (m.type === "bend") {
        // Andolan waver: bend the sustained note in place. No new excitation, so
        // a slow oscillation reads as pitch movement, not repeated strikes.
        if (this.lastVoice) this.lastVoice.bend(m.freq, m.seconds);
      } else if (m.type === "preset" && m.params) {
        // Select-one: apply the flavour to all pooled voices so currently
        // ringing and future plucks share the active timbre.
        for (const v of this.voices) v.setParams(m.params);
        this._setBody(m.params.body);
        this.tarafSend = m.params.tarafSend || 0;
      } else if (m.type === "taraf") {
        this._setTaraf(m.freqs);
      }
    };
  }

  // Rebuild the parallel body-resonance biquads from a list of {freq,q,gain}.
  _setBody(list) {
    this.body = [];
    this.bodyGain = [];
    if (!list || !list.length) return;
    for (const r of list) {
      const bq = new Biquad();
      bq.setBandpass(sampleRate, r.freq, r.q);
      this.body.push(bq);
      this.bodyGain.push(r.gain || 0);
    }
  }

  // (Re)tune the sympathetic bank to `freqs` (the raga's strong degrees). Reuses
  // existing strings where possible so a retune doesn't reallocate the world.
  _setTaraf(freqs) {
    if (!freqs || !freqs.length) { this.taraf = []; return; }
    while (this.taraf.length < freqs.length) this.taraf.push(new KSString(sampleRate));
    this.taraf.length = freqs.length;
    for (let i = 0; i < freqs.length; i++) this.taraf[i].tune(freqs[i]);
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const ch0 = out[0];
    const hasBody = this.body.length > 0;
    const hasTaraf = this.tarafSend > 0 && this.taraf.length > 0;
    for (let i = 0; i < ch0.length; i++) {
      let s = 0;
      for (const v of this.voices) s += v.render();
      // Body resonance: add the parallel resonators' output to the dry sum.
      if (hasBody) {
        let r = 0;
        for (let b = 0; b < this.body.length; b++) r += this.bodyGain[b] * this.body[b].process(s);
        s += r;
      }
      // Taraf: drive each undamped string with a low-gain tap of the sum and add
      // their collective ring back in — the sympathetic bloom. Undamped strings
      // (damp≈0.5) ring for seconds; the injection is small so it stays quiet.
      if (hasTaraf) {
        const inj = this.tarafSend * 0.03 * s;
        let t = 0;
        for (const ts of this.taraf) t += ts.render(0.4995, 0.5, inj);
        s += this.tarafSend * 0.6 * t;
      }
      s *= 0.35; // headroom for the pool
      for (let c = 0; c < out.length; c++) out[c][i] = s;
    }
    return true;
  }
}

registerProcessor("mraga-voice", MragaVoiceProcessor);
