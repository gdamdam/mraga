// src/voicePresets.ts
// Six struck/plucked flavours, each a parameter set over the one Karplus–Strong
// voice (src/engine/voices/shared.js). Select-one (no blending). Numbers are
// tasteful starting points to tune by ear; the RELATIVE design is what matters.
export type VoiceId = "santoor" | "koto" | "sitar" | "mallet" | "qanun" | "kalimba";

// A body resonance: one parallel bandpass "formant" of the soundboard/gourd.
export type BodyReson = {
  freq: number; // resonance centre in Hz
  q: number;    // sharpness (higher = narrower/ringier)
  gain: number; // how much of this resonance to mix back in (small, ~0.1..0.5)
};

export type KSParams = {
  brightness: number; // 0..1 lowpass on the excitation burst (1 = bright)
  damping: number;    // KS loop coefficient, <0.5 for stability
  decay: number;      // per-sample gain falloff, <1
  jawari: number;     // 0..1 output waveshaper buzz (sitar)
  // --- extended timbre (all zero/empty == the original single-string sound) ---
  courseDetune: number; // cents spread across the string course (0 = single string)
  courseCount: number;  // strings per note, 1..4 (1 = single string)
  pickPos: number;      // pick-position comb fraction 0..1 (0 = raw burst)
  velTrack: number;     // velocity->excitation-brightness coupling 0..1 (0 = off)
  tarafSend: number;    // send into the sympathetic-string bank 0..1 (0 = off)
  body: BodyReson[];    // parallel body resonances post-sum (empty = bypass)
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

// The four core params (brightness/damping/decay/jawari) keep each voice's
// established pitch/decay/buzz character; the extended params add physical
// realism. Restraint is deliberate: courses are a few cents, body gains are
// small, taraf is quiet. Setting every extended field to 0/[] on any row
// reproduces that row's original single-string timbre exactly.
export const VOICE_PRESETS: Record<VoiceId, KSParams> = {
  // santoor: hammered dulcimer — 3 strings per course, bright wooden box, no
  // sympathetic strings. Core values are the MVP baseline (brightness 1.0).
  santoor: {
    brightness: 1.0, damping: 0.4975, decay: 0.99995, jawari: 0,
    courseDetune: 4, courseCount: 3, pickPos: 0.12, velTrack: 0.2, tarafSend: 0,
    body: [{ freq: 1600, q: 4, gain: 0.25 }, { freq: 3200, q: 6, gain: 0.15 }],
  },
  // koto: dark, long, soft — paired strings, low paulownia-box resonance.
  koto: {
    brightness: 0.4, damping: 0.498, decay: 0.99997, jawari: 0,
    courseDetune: 3, courseCount: 2, pickPos: 0.18, velTrack: 0.25, tarafSend: 0,
    body: [{ freq: 320, q: 3, gain: 0.3 }, { freq: 900, q: 5, gain: 0.18 }],
  },
  // sitar: bright + heavy jawari, gourd body, a strong bank of taraf strings.
  sitar: {
    brightness: 0.75, damping: 0.498, decay: 0.99996, jawari: 0.85,
    courseDetune: 2, courseCount: 2, pickPos: 0.25, velTrack: 0.3, tarafSend: 0.6,
    body: [{ freq: 260, q: 2.5, gain: 0.35 }, { freq: 1200, q: 5, gain: 0.2 }],
  },
  // mallet: very dark, short struck bar — single string, resonant bar body,
  // velocity-expressive. No course, no taraf.
  mallet: {
    brightness: 0.18, damping: 0.494, decay: 0.9996, jawari: 0,
    courseDetune: 0, courseCount: 1, pickPos: 0, velTrack: 0.5, tarafSend: 0,
    body: [{ freq: 700, q: 8, gain: 0.25 }],
  },
  // qanun: bright, dry, slight buzz — 3 strings per course, bright box.
  qanun: {
    brightness: 0.9, damping: 0.496, decay: 0.99985, jawari: 0.25,
    courseDetune: 5, courseCount: 3, pickPos: 0.2, velTrack: 0.25, tarafSend: 0,
    body: [{ freq: 1400, q: 5, gain: 0.2 }, { freq: 2800, q: 7, gain: 0.12 }],
  },
  // kalimba: mid, short, bell-ish buzz — single tine on a wooden block. No taraf.
  kalimba: {
    brightness: 0.5, damping: 0.495, decay: 0.9998, jawari: 0.4,
    courseDetune: 0, courseCount: 1, pickPos: 0, velTrack: 0.4, tarafSend: 0,
    body: [{ freq: 500, q: 6, gain: 0.28 }, { freq: 1800, q: 8, gain: 0.14 }],
  },
};

export function getPreset(id: string): KSParams {
  return (VOICE_PRESETS as Record<string, KSParams>)[id] ?? VOICE_PRESETS.santoor;
}
