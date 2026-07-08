// src/gamaka.ts
// Gamaka (ornament) grammar — a PURE, seeded module. Ornaments are expressed as
// short "micro-notes" the engine emits around a main note, so they flow through
// the same scheduler/voice path (precise onsets, real glide) with NO audio-layer
// changes. Ornaments come ONLY from a raga's authored rules — never generic
// random decoration — and are fully deterministic given the rng.
//
// Four ornaments (development.md roadmap):
//   meend   — a slide INTO the note (formalizes the engine's glide, per raga)
//   kan     — a short grace note approaching the main note from an adjacent
//             scale degree (below when ascending, above when descending)
//   andolan — a slow oscillation (a few cents) around a held resting note
//   murki   — a rare fast ornamental turn before landing on the note
//
// A micro-note carries an explicit Hz, so pitches are bounded near the main note
// (adjacent lattice degrees or a few cents off) and never escape the register.

import { degreeToHz } from "./tuning";

export type GamakaKind = "meend" | "kan" | "andolan" | "murki";

// Authored per raga (see ragas.ts). Each rule lists the degrees it applies to
// (degree indices 0..scaleLen-1) and a probability. Absent rule => never fires.
export type GamakaRules = {
  meend?: { degrees: number[]; prob: number };
  kan?: { degrees: number[]; prob: number };
  andolan?: { degrees: number[]; cents: number; prob: number };
  murki?: { degrees: number[]; prob: number };
};

// A note emitted before/after the main note. glideFromHz makes it slide in.
export type MicroNote = {
  pitchHz: number;
  velocity: number;
  ioiSec: number;
  glideFromHz?: number;
};

export type GamakaContext = {
  degreeIndex: number;
  octave: number;
  scaleCents: number[];
  tonicHz: number;
  pitchHz: number; // the main note
  prevPitchHz: number | null;
  ascending: boolean; // melodic direction into this note
  isPhraseStart: boolean;
  restingStrength: number; // 0..1 (how strong a resting note this is)
  baseIoiSec: number;
};

export type GamakaPlan = {
  kind: GamakaKind | null;
  graces: MicroNote[]; // emitted BEFORE the main note
  glideFromHz?: number; // main note slides in (meend / kan)
  tail: MicroNote[]; // emitted AFTER the main note (andolan waver)
};

const EMPTY: GamakaPlan = { kind: null, graces: [], tail: [] };

function has(list: number[] | undefined, degree: number): boolean {
  return !!list && list.includes(degree);
}

// Nearest allowed scale degree above/below the current one, as {degreeIndex,
// octave}. Without an `allowed` mask, uses the immediate chromatic-ish neighbour
// (degree index ± 1, wrapping octaves). Kept in-lattice so the grace is musical.
function neighbor(
  degreeIndex: number,
  octave: number,
  scaleLen: number,
  dir: 1 | -1,
  allowed?: boolean[],
): { degreeIndex: number; octave: number } {
  let d = degreeIndex;
  let o = octave;
  for (let steps = 0; steps < scaleLen; steps++) {
    d += dir;
    if (d >= scaleLen) {
      d = 0;
      o += 1;
    } else if (d < 0) {
      d = scaleLen - 1;
      o -= 1;
    }
    if (!allowed || allowed[d]) return { degreeIndex: d, octave: o };
  }
  return { degreeIndex, octave };
}

function centsShift(hz: number, cents: number): number {
  return hz * Math.pow(2, cents / 1200);
}

// Deterministically plan the ornament (at most one) for a note. `enabled` gates
// the whole feature; `rules` are the raga's authored ornament grammar. Returns
// an empty plan when disabled, ruleless, or when no rule fires — leaving the main
// note untouched. `allowed` (optional) is the raga's usable-degree mask so
// grace/turn notes stay in the raga.
export function planGamaka(
  ctx: GamakaContext,
  rules: GamakaRules | null | undefined,
  enabled: boolean,
  rng: () => number,
  allowed?: boolean[],
): GamakaPlan {
  if (!enabled || !rules) return EMPTY;
  const { degreeIndex, octave, scaleCents, tonicHz } = ctx;
  const scaleLen = scaleCents.length;
  if (scaleLen < 2) return EMPTY;
  const graceIoi = Math.min(0.09, Math.max(0.04, ctx.baseIoiSec * 0.18));

  // Priority: a decisive single ornament per note. Draw once per candidate so
  // the rng stream stays stable regardless of which rules exist.
  // --- kan: grace approach, strongest at phrase starts and on resting notes.
  if (has(rules.kan?.degrees, degreeIndex) && rng() < (rules.kan!.prob ?? 0)) {
    // Approach from below when ascending, from above when descending.
    const dir: 1 | -1 = ctx.ascending ? -1 : 1;
    const g = neighbor(degreeIndex, octave, scaleLen, dir, allowed);
    const gHz = degreeToHz(scaleCents, tonicHz, g.degreeIndex, g.octave);
    if (gHz > 0) {
      return {
        kind: "kan",
        graces: [{ pitchHz: gHz, velocity: 0.5, ioiSec: graceIoi }],
        glideFromHz: gHz, // main note slides off the grace
        tail: [],
      };
    }
  }

  // --- murki: rare fast turn (upper neighbour → main → lower neighbour → main).
  if (has(rules.murki?.degrees, degreeIndex) && rng() < (rules.murki!.prob ?? 0)) {
    const up = neighbor(degreeIndex, octave, scaleLen, 1, allowed);
    const down = neighbor(degreeIndex, octave, scaleLen, -1, allowed);
    const upHz = degreeToHz(scaleCents, tonicHz, up.degreeIndex, up.octave);
    const downHz = degreeToHz(scaleCents, tonicHz, down.degreeIndex, down.octave);
    if (upHz > 0 && downHz > 0) {
      const turnIoi = graceIoi * 0.8;
      return {
        kind: "murki",
        graces: [
          { pitchHz: upHz, velocity: 0.45, ioiSec: turnIoi },
          { pitchHz: ctx.pitchHz, velocity: 0.5, ioiSec: turnIoi },
          { pitchHz: downHz, velocity: 0.45, ioiSec: turnIoi },
        ],
        glideFromHz: downHz,
        tail: [],
      };
    }
  }

  // --- meend: slide INTO the note from the previous pitch (per raga).
  if (
    ctx.prevPitchHz != null &&
    has(rules.meend?.degrees, degreeIndex) &&
    rng() < (rules.meend!.prob ?? 0)
  ) {
    return { kind: "meend", graces: [], glideFromHz: ctx.prevPitchHz, tail: [] };
  }

  // --- andolan: gentle oscillation around a held resting note (tail waver).
  if (
    ctx.restingStrength > 0.4 &&
    has(rules.andolan?.degrees, degreeIndex) &&
    rng() < (rules.andolan!.prob ?? 0)
  ) {
    const cents = Math.min(60, Math.max(5, rules.andolan!.cents ?? 20));
    const wobbleIoi = Math.max(0.12, ctx.baseIoiSec * 0.4);
    const up = centsShift(ctx.pitchHz, cents);
    const back = ctx.pitchHz;
    // Two gentle swells up-and-back, each gliding — a slow waver, not a trill.
    return {
      kind: "andolan",
      graces: [],
      tail: [
        { pitchHz: up, velocity: 0.4, ioiSec: wobbleIoi, glideFromHz: back },
        { pitchHz: back, velocity: 0.4, ioiSec: wobbleIoi, glideFromHz: up },
      ],
    };
  }

  return EMPTY;
}
