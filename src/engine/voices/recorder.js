// Recorder tap for WAV export. Sits on the master bus (input-only; its output
// is silence, connected to destination just so the graph keeps pulling it).
// While recording it copies each stereo render quantum and posts batches of
// ~0.75s to the main thread as transferables. Allocation in the render loop is
// accepted here: it only happens while the user is actively recording.
class MragaRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.rec = false;
    this.bufL = [];
    this.bufR = [];
    this.frames = 0;
    this.port.onmessage = (e) => {
      const t = e.data && e.data.type;
      if (t === "start") {
        this.rec = true;
      } else if (t === "stop") {
        this.rec = false;
        this.flush();
        this.port.postMessage({ type: "done" });
      }
    };
  }

  flush() {
    if (this.frames === 0) return;
    const l = new Float32Array(this.frames);
    const r = new Float32Array(this.frames);
    let o = 0;
    for (let i = 0; i < this.bufL.length; i++) {
      l.set(this.bufL[i], o);
      r.set(this.bufR[i], o);
      o += this.bufL[i].length;
    }
    this.bufL = [];
    this.bufR = [];
    this.frames = 0;
    this.port.postMessage({ type: "chunk", l, r }, [l.buffer, r.buffer]);
  }

  process(inputs) {
    if (!this.rec) return true;
    const inp = inputs[0];
    if (!inp || inp.length === 0) return true;
    const L = inp[0];
    const R = inp[1] || inp[0];
    const l = new Float32Array(L.length);
    l.set(L);
    const r = new Float32Array(R.length);
    r.set(R);
    this.bufL.push(l);
    this.bufR.push(r);
    this.frames += L.length;
    if (this.frames >= 32768) this.flush(); // ~0.75s at 44.1kHz
    return true;
  }
}

registerProcessor("mraga-recorder", MragaRecorderProcessor);
