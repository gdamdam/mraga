// src/voicePresets.ts
// Six struck/plucked flavours, each a parameter set over the one Karplus–Strong
// voice (src/engine/voices/shared.js). Select-one (no blending). Numbers are
// tasteful starting points to tune by ear; the RELATIVE design is what matters.
export type VoiceId = "santoor" | "koto" | "sitar" | "mallet" | "qanun" | "kalimba";

export type KSParams = {
  brightness: number; // 0..1 lowpass on the excitation burst (1 = bright)
  damping: number;    // KS loop coefficient, <0.5 for stability
  decay: number;      // per-sample gain falloff, <1
  jawari: number;     // 0..1 output waveshaper buzz (sitar)
};

export const VOICE_IDS: VoiceId[] = ["santoor", "koto", "sitar", "mallet", "qanun", "kalimba"];

export const VOICE_LABELS: Record<VoiceId, string> = {
  santoor: "santoor",
  koto: "koto",
  sitar: "sitar",
  mallet: "mallet",
  qanun: "qanun",
  kalimba: "kalimba",
};

export const VOICE_PRESETS: Record<VoiceId, KSParams> = {
  // santoor == MVP baseline voice.
  santoor: { brightness: 1.0, damping: 0.4975, decay: 0.99995, jawari: 0 },
  koto: { brightness: 0.6, damping: 0.499, decay: 0.99997, jawari: 0 },
  sitar: { brightness: 0.8, damping: 0.499, decay: 0.99997, jawari: 0.7 },
  mallet: { brightness: 0.35, damping: 0.494, decay: 0.9999, jawari: 0 },
  qanun: { brightness: 0.95, damping: 0.4965, decay: 0.99993, jawari: 0.15 },
  kalimba: { brightness: 0.7, damping: 0.495, decay: 0.99991, jawari: 0.2 },
};

export function getPreset(id: string): KSParams {
  return (VOICE_PRESETS as Record<string, KSParams>)[id] ?? VOICE_PRESETS.santoor;
}
