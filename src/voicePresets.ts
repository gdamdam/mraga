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
  // santoor == MVP baseline voice (brightness 1.0 => no loop-lowpass colouring).
  // brightness now drives a lowpass INSIDE the feedback loop, so it shapes the
  // sustained timbre — the values are spread widely for audibly distinct voices.
  santoor: { brightness: 1.0, damping: 0.4975, decay: 0.99995, jawari: 0 },    // bright, medium ring
  koto: { brightness: 0.4, damping: 0.498, decay: 0.99997, jawari: 0 },        // dark, long, soft
  sitar: { brightness: 0.75, damping: 0.498, decay: 0.99996, jawari: 0.85 },   // bright + heavy jawari buzz
  mallet: { brightness: 0.18, damping: 0.494, decay: 0.9996, jawari: 0 },      // very dark, short struck bar
  qanun: { brightness: 0.9, damping: 0.496, decay: 0.99985, jawari: 0.25 },    // bright, dry, slight buzz
  kalimba: { brightness: 0.5, damping: 0.495, decay: 0.9998, jawari: 0.4 },    // mid, short, bell-ish buzz
};

export function getPreset(id: string): KSParams {
  return (VOICE_PRESETS as Record<string, KSParams>)[id] ?? VOICE_PRESETS.santoor;
}
