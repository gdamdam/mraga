// src/mragaScene.ts
// Serializes mraga UI state to/from a URL-safe base64 string for presets and scene sharing.
// Uses the ?s= query parameter. Synchronous — no compression, no async.

import { bytesToUrlSafeB64, urlSafeB64ToBytes } from "./shareCodec";

export type MragaScene = {
  v: 1;
  knobs: {
    density: number; register: number; restlessness: number; silence: number;
    rhythm: number; theme: number; focus: number;
  };
  voice: string;   // VoiceId
  octave: number;  // -2..2
  volume: number;  // 0..1
  timing: "free" | "bpm" | "link";
  bpm: number;     // 40..240
  theme: string;   // ThemeId
  seed: number;    // PRNG seed (reproducible improvisation)
  tuning: { tonicHz: number; scaleCents: number[]; label: string };
};

// ---------------------------------------------------------------------------
// encode
// ---------------------------------------------------------------------------

export function encodeScene(scene: MragaScene): string {
  return bytesToUrlSafeB64(new TextEncoder().encode(JSON.stringify(scene)));
}

// ---------------------------------------------------------------------------
// decode + validation/sanitization
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && isFinite(v);
}

function validateKnobs(
  knobs: unknown,
): MragaScene["knobs"] | null {
  if (!knobs || typeof knobs !== "object") return null;
  const k = knobs as Record<string, unknown>;
  for (const key of ["density", "register", "restlessness", "silence"]) {
    if (!isFiniteNumber(k[key])) return null;
  }
  return {
    density: clamp(k.density as number, 0, 1),
    register: clamp(k.register as number, 0, 1),
    restlessness: clamp(k.restlessness as number, 0, 1),
    silence: clamp(k.silence as number, 0, 1),
    // Added later — defaults keep older shared scenes valid.
    rhythm: isFiniteNumber(k.rhythm) ? clamp(k.rhythm as number, 0, 1) : 0.8,
    theme: isFiniteNumber(k.theme) ? clamp(k.theme as number, 0, 1) : 0.7,
    focus: isFiniteNumber(k.focus) ? clamp(k.focus as number, 0, 1) : 0,
  };
}

function validateTuning(
  tuning: unknown,
): { tonicHz: number; scaleCents: number[]; label: string } | null {
  if (!tuning || typeof tuning !== "object") return null;
  const t = tuning as Record<string, unknown>;
  if (!isFiniteNumber(t.tonicHz) || (t.tonicHz as number) <= 0) return null;
  if (typeof t.label !== "string") return null;
  if (!Array.isArray(t.scaleCents)) return null;
  const scaleCents = t.scaleCents as unknown[];
  if (!scaleCents.every(isFiniteNumber)) return null;
  return {
    tonicHz: t.tonicHz as number,
    scaleCents: scaleCents as number[],
    label: t.label,
  };
}

const VALID_TIMING = new Set<string>(["free", "bpm", "link"]);

export function decodeScene(payload: string): MragaScene | null {
  try {
    const bytes = urlSafeB64ToBytes(payload);
    const json = new TextDecoder().decode(bytes);
    const raw = JSON.parse(json) as Record<string, unknown>;

    if (!raw || typeof raw !== "object") return null;
    if (raw.v !== 1) return null;

    const knobs = validateKnobs(raw.knobs);
    if (!knobs) return null;

    if (typeof raw.voice !== "string" || !raw.voice) return null;

    if (!isFiniteNumber(raw.octave)) return null;
    const octave = clamp(Math.round(raw.octave as number), -2, 2);

    if (!isFiniteNumber(raw.volume)) return null;
    const volume = clamp(raw.volume as number, 0, 1);

    if (typeof raw.timing !== "string" || !VALID_TIMING.has(raw.timing)) return null;
    const timing = raw.timing as "free" | "bpm" | "link";

    if (!isFiniteNumber(raw.bpm)) return null;
    const bpm = clamp(raw.bpm as number, 40, 240);

    if (typeof raw.theme !== "string" || !raw.theme) return null;

    const tuning = validateTuning(raw.tuning);
    if (!tuning) return null;

    // seed added later — default to 0 (deterministic) for older shared scenes.
    const seed = isFiniteNumber(raw.seed) ? Math.round(raw.seed as number) : 0;

    return {
      v: 1,
      knobs,
      voice: raw.voice,
      octave,
      volume,
      timing,
      bpm,
      theme: raw.theme,
      seed,
      tuning,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export function sceneToUrl(scene: MragaScene, baseUrl?: string): string {
  const payload = encodeScene(scene);
  if (!baseUrl) return `?s=${payload}`;
  // Append ?s= or &s= depending on whether the base URL already has a query string.
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}s=${payload}`;
}

export function sceneFromUrl(url: string): MragaScene | null {
  try {
    const parsed = new URL(url);
    const s = parsed.searchParams.get("s");
    if (!s) return null;
    return decodeScene(s);
  } catch {
    return null;
  }
}
