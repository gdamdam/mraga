// mraga voice processor. Holds a pool of KS voices so rings overlap (spec §7).
// Messages: { type: "pluck", freq, velocity, glideFromFreq } round-robin a voice.
class MragaVoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const POOL = 8;
    this.voices = [];
    for (let i = 0; i < POOL; i++) this.voices.push(new KSVoice(sampleRate));
    this.rr = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === "pluck") {
        const v = this.voices[this.rr];
        this.rr = (this.rr + 1) % this.voices.length;
        v.pluck(m.freq, m.velocity, m.glideFromFreq);
      }
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const ch0 = out[0];
    for (let i = 0; i < ch0.length; i++) {
      let s = 0;
      for (const v of this.voices) s += v.render();
      s *= 0.35; // headroom for the pool
      for (let c = 0; c < out.length; c++) out[c][i] = s;
    }
    return true;
  }
}

registerProcessor("mraga-voice", MragaVoiceProcessor);
