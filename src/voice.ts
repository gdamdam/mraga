// src/voice.ts
import workletUrl from "./engine/voiceProcessor.js?url";
import { concatChunks } from "./recorder";
import type { KSParams } from "./voicePresets";

export type Voice = {
  ctx: AudioContext;
  resume: () => Promise<void>;
  pluck: (freq: number, velocity: number, glideFromFreq?: number) => void;
  // Andolan: glide the last-plucked voice's pitch to pitchHz over `seconds`,
  // with no re-pluck (so a slow waver doesn't sound like repeated strikes).
  bend: (pitchHz: number, seconds: number) => void;
  setPreset: (params: KSParams) => void;
  // (Re)tune the sympathetic-string (taraf) bank to a set of frequencies (the
  // raga's strong degrees). Call on raga/tuning change; [] clears the bank.
  retuneTaraf: (freqs: number[]) => void;
  setVolume: (v: number) => void; // master output gain, 0..1
  getLevel: () => number;         // current output RMS, ~0..1 (for the logo pulse)
  // Tanpura drone: a second KS pool with its own level, sharing the space.
  pluckDrone: (freq: number, velocity: number) => void;
  setDronePreset: (params: KSParams) => void;
  setDroneLevel: (v: number) => void; // 0..1
  // WAV capture of the master output (melody + drone + reverb).
  startRecording: () => void;
  stopRecording: () => Promise<{ left: Float32Array; right: Float32Array; sampleRate: number }>;
  // mbus publishing: the master bus node (pre-destination) to publish from.
  getPublishTap: () => AudioNode;
  dispose: () => void;
};

// A short algorithmic reverb so the struck voice sits in ambient space (spec §3).
function buildReverbIR(ctx: AudioContext, seconds = 2.2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = ir.getChannelData(c);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
  }
  return ir;
}

export async function createVoice(): Promise<Voice> {
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule(workletUrl);
  const node = new AudioWorkletNode(ctx, "mraga-voice", { outputChannelCount: [2] });
  // Separate KS pool for the tanpura so its preset/level are independent of
  // the melodic voice, while sharing the same dry/reverb space.
  const droneNode = new AudioWorkletNode(ctx, "mraga-voice", { outputChannelCount: [2] });
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.5;

  const dry = ctx.createGain();
  dry.gain.value = 0.85;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  const convolver = ctx.createConvolver();
  convolver.buffer = buildReverbIR(ctx);

  // Master gain so the UI volume slider scales the whole (dry + wet) output.
  const master = ctx.createGain();
  master.gain.value = 0.8;

  // Analyser tap on the master so the UI can read output level (logo pulse).
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  const buf = new Uint8Array(analyser.fftSize);

  node.connect(dry).connect(master);
  node.connect(convolver).connect(wet).connect(master);
  droneNode.connect(droneGain);
  droneGain.connect(dry);
  droneGain.connect(convolver);
  master.connect(analyser);
  master.connect(ctx.destination);

  // Recorder tap on the master. Input-only in spirit; its (silent) output is
  // wired to the destination so the graph keeps pulling it every quantum.
  const recNode = new AudioWorkletNode(ctx, "mraga-recorder", { outputChannelCount: [1] });
  master.connect(recNode);
  recNode.connect(ctx.destination);
  let recL: Float32Array[] = [];
  let recR: Float32Array[] = [];
  let recDone: (() => void) | null = null;
  recNode.port.onmessage = (e) => {
    const m = e.data;
    if (m?.type === "chunk") {
      recL.push(m.l);
      recR.push(m.r);
    } else if (m?.type === "done") {
      recDone?.();
      recDone = null;
    }
  };


  const getLevel = () => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const x = (buf[i] - 128) / 128;
      sum += x * x;
    }
    return Math.sqrt(sum / buf.length);
  };

  return {
    ctx,
    resume: () => ctx.resume(),
    pluck: (freq, velocity, glideFromFreq) =>
      node.port.postMessage({ type: "pluck", freq, velocity, glideFromFreq }),
    bend: (pitchHz, seconds) =>
      node.port.postMessage({ type: "bend", freq: pitchHz, seconds }),
    setPreset: (params) => node.port.postMessage({ type: "preset", params }),
    retuneTaraf: (freqs) => node.port.postMessage({ type: "taraf", freqs }),
    setVolume: (v) => {
      master.gain.value = Math.max(0, Math.min(1, v));
    },
    getLevel,
    pluckDrone: (freq, velocity) =>
      droneNode.port.postMessage({ type: "pluck", freq, velocity }),
    setDronePreset: (params) => droneNode.port.postMessage({ type: "preset", params }),
    setDroneLevel: (v) => {
      droneGain.gain.value = Math.max(0, Math.min(1, v));
    },
    startRecording: () => {
      recL = [];
      recR = [];
      recNode.port.postMessage({ type: "start" });
    },
    stopRecording: () =>
      new Promise((resolve) => {
        // The worklet flushes its tail, then posts "done" — resolve after that
        // so the last partial batch is included.
        recDone = () => {
          resolve({ left: concatChunks(recL), right: concatChunks(recR), sampleRate: ctx.sampleRate });
          recL = [];
          recR = [];
        };
        recNode.port.postMessage({ type: "stop" });
      }),
    getPublishTap: () => master,
    dispose: () => void ctx.close(),
  };
}
