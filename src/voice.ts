// src/voice.ts
import workletUrl from "./engine/voiceProcessor.js?url";
import type { KSParams } from "./voicePresets";

export type Voice = {
  ctx: AudioContext;
  resume: () => Promise<void>;
  pluck: (freq: number, velocity: number, glideFromFreq?: number) => void;
  setPreset: (params: KSParams) => void;
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

  const dry = ctx.createGain();
  dry.gain.value = 0.85;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  const convolver = ctx.createConvolver();
  convolver.buffer = buildReverbIR(ctx);

  node.connect(dry).connect(ctx.destination);
  node.connect(convolver).connect(wet).connect(ctx.destination);

  return {
    ctx,
    resume: () => ctx.resume(),
    pluck: (freq, velocity, glideFromFreq) =>
      node.port.postMessage({ type: "pluck", freq, velocity, glideFromFreq }),
    setPreset: (params) => node.port.postMessage({ type: "preset", params }),
    dispose: () => void ctx.close(),
  };
}
