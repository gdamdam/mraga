// src/arc.ts
// Performance arc: a slow alap → jor → jhala trajectory over the knob space,
// so a session evolves like a raga performance instead of staying static.
// Pure: progress t (0..1) → knob overrides. The App blends these over the
// user's knobs while the arc is engaged and stops playback when t reaches 1.
import type { Knobs } from "./conducting";

export type ArcPhase = "alap" | "jor" | "jhala";

// Selectable durations (minutes) for the full arc.
export const ARC_DURATIONS_MIN = [6, 12, 24];

// Phase boundaries in normalized time.
const JOR_AT = 0.42;
const JHALA_AT = 0.75;

export function arcPhaseAt(t: number): ArcPhase {
  if (t < JOR_AT) return "alap";
  if (t < JHALA_AT) return "jor";
  return "jhala";
}

type ArcPoint = { t: number; k: Required<Pick<Knobs, "density" | "rhythm" | "silence" | "register" | "restlessness">> };

// Control points: unmetered, spacious, low (alap) — a pulse emerges (jor) —
// fast, tight, high climax (jhala).
const POINTS: ArcPoint[] = [
  { t: 0.0, k: { density: 0.08, rhythm: 0.1, silence: 0.55, register: 0.25, restlessness: 0.15 } },
  { t: JOR_AT, k: { density: 0.4, rhythm: 0.55, silence: 0.3, register: 0.45, restlessness: 0.3 } },
  { t: JHALA_AT, k: { density: 0.7, rhythm: 0.85, silence: 0.12, register: 0.6, restlessness: 0.45 } },
  { t: 1.0, k: { density: 0.97, rhythm: 0.95, silence: 0.04, register: 0.8, restlessness: 0.6 } },
];

const lerp = (a: number, b: number, x: number) => a + (b - a) * x;

// Register ceiling: alap opens low and slowly reveals the upper register (the
// classic exposition that starts near the tonic and unfolds upward). The upper
// bound starts ~a fifth above center and widens to the full configured half-span
// by the time jor begins, then stays fully open. A perfect fifth is ~0.585 of an
// octave, so ~0.6 of the half-span reads musically as "a fifth up".
const ALAP_CEILING_FRAC = 0.6;

// Upper register bound at progress t (clamped 0..1), as a step offset above
// center — what the engine adds to centerStep for `hi`. Returns halfSpanSteps
// (a no-op clamp) at/after jor. Pure: linear in t, no rng/time/random. Values
// >= halfSpanSteps mean "don't clamp"; on very small spans it starts fully open.
export function arcCeilingStep(t: number, halfSpanSteps: number): number {
  const x = Math.max(0, Math.min(1, t));
  const start = Math.min(ALAP_CEILING_FRAC * halfSpanSteps, halfSpanSteps);
  const f = Math.min(1, x / JOR_AT); // fully open by the time jor begins
  return Math.floor(lerp(start, halfSpanSteps, f));
}

// Knob overrides at progress t (clamped to 0..1), piecewise-linear between
// the control points. DENSITY/RHYTHM/SILENCE/REGISTER/RESTLESS are driven;
// THEME/FOCUS stay the user's.
export function arcKnobs(t: number): Pick<Knobs, "density" | "rhythm" | "silence" | "register" | "restlessness"> {
  const x = Math.max(0, Math.min(1, t));
  let a = POINTS[0];
  let b = POINTS[POINTS.length - 1];
  for (let i = 0; i < POINTS.length - 1; i++) {
    if (x >= POINTS[i].t && x <= POINTS[i + 1].t) {
      a = POINTS[i];
      b = POINTS[i + 1];
      break;
    }
  }
  const span = b.t - a.t || 1;
  const f = (x - a.t) / span;
  return {
    density: lerp(a.k.density, b.k.density, f),
    rhythm: lerp(a.k.rhythm, b.k.rhythm, f),
    silence: lerp(a.k.silence, b.k.silence, f),
    register: lerp(a.k.register, b.k.register, f),
    restlessness: lerp(a.k.restlessness, b.k.restlessness, f),
  };
}
