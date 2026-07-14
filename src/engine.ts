// src/engine.ts
// Melodic engine: each phrase is a precomputed shape — a directed contour that
// resolves on a resting note, carrying its OWN rhythm — and phrases REPEAT /
// SEQUENCE the previous shape (pitch AND rhythm) so recurring motifs are
// recognizable. The pulse is steady (note values are integer multiples of a
// base unit, barely humanised when calm). RESTLESSNESS loosens contour,
// repetition and timing toward a free walk. Pure & seeded: no audio, no Date.
import { gaussian } from "./rng";
import {
  degreeToHz,
  degreeToStepPos,
  stepPosToDegree,
  hzToNearestStepPos,
  restingNotes,
} from "./tuning";
import { planGamaka, type GamakaRules } from "./gamaka";
import type { TaalBias } from "./taal";

export type NoteEvent = {
  kind: "note";
  pitchHz: number;
  glideFromHz?: number;
  velocity: number;
  ioiSec: number;
  durationHint: number;
  degreeIndex: number;
  octave: number;
  // Andolan tail micro-notes are a continuous waver off the held note, not a
  // fresh attack — flagged so the voice can bend rather than re-pluck them.
  noPluck?: true;
};
export type RestEvent = { kind: "rest"; ioiSec: number; phraseEnd: boolean };
export type EngineEvent = NoteEvent | RestEvent;

export type EngineParams = {
  baseIoiSec: number;
  ioiJitter: number;
  longNoteProb: number;
  centerPitchHz: number;
  registerHalfSpanSteps: number;
  // Badhat: clamp the upper register bound to centerStep + this (step offset above
  // center). Absent = no clamp (today's behavior). Never adds an rng() draw.
  ceilingStep?: number;
  contourStrength: number;
  leapProbability: number;
  tonicGravity: number;
  restingDwell: number;
  repeatProb: number;
  focus: number; // 0 = all scale degrees, 1 = small characteristic palette
  pRest: number;
  phrasePauseFactor: number;
  glideProbability: number;
  // Raga grammar (optional — absent means the FOCUS palette applies both ways).
  arohaMask?: boolean[];   // degrees allowed while ascending
  avarohaMask?: boolean[]; // degrees allowed while descending
  degreeBoost?: number[];  // extra per-degree resting strength (vadi/samvadi)
  degreeAttenuate?: number[]; // degree indices whose base resting strength is damped (raga weak/durbal degrees)
  pakadSteps?: number[];   // signature phrase, lattice steps relative to Sa
  pakadProb?: number;      // chance a fresh phrase is the pakad
  // Conducting: a tapped ladder degree the line is pulled toward.
  pullDegree?: number | null;
  // Gamaka (ornaments): authored per-raga rules + a master enable. When
  // disabled (default) no rng is consumed, so existing seeds reproduce exactly.
  gamaka?: GamakaRules | null;
  gamakaEnabled?: boolean;
  // Taal: structural bias for the current cycle position (accent / rest /
  // resolution multipliers). Absent => free/rubato (no taal). Mild by design.
  taalBias?: TaalBias | null;
  // --- Wave 2A phrase-engine upgrade. Each flag defaults off/absent and, when
  // off, consumes ZERO new rng draws so existing seeds reproduce identically
  // (same discipline as gamakaEnabled). See docs/superpowers/phrase-engine-upgrade.md.
  // Rhythm cells: per-phrase rhythmic figure from a small vocabulary instead of
  // the plain per-note 1|2 draw. When on, draws a fire + weighted-pick rng.
  rhythmCellsEnabled?: boolean;
  // Tihai: near sam, sometimes build the last motif ×3 landing exactly on sam.
  // Requires a taal (taalBias) + matraPosition + cycleMatras. When on, draws one
  // fire-decision rng per eligible phrase-build.
  tihaiEnabled?: boolean;
  matraPosition?: number; // current fractional beat position within the cycle
  cycleMatras?: number;   // taal.matras (cycle length)
  // Vakra: choose the aroha/avaroha mask per phrase segment (not per step) and
  // prefer the authored crooked-descent successor. rng-neutral remap; gated so
  // multi-mask raga share-links stay byte-identical when off.
  vakraEnabled?: boolean;
  avarohaPath?: number[]; // authored crooked descent order (degree indices)
};

export type EngineState = {
  degreeIndex: number;
  octave: number;
  phrase: number[];       // precomputed lattice step positions for the current phrase
  phraseRhythm: number[]; // per-note IOI multiple (1 = pulse, 2 = held/double)
  phraseIdx: number;      // index of the next note to emit within `phrase`
  lastDeltas: number[];   // step deltas of the last phrase (for repetition/sequence)
  lastRhythm: number[];   // rhythm of the last phrase (repeated with the motif)
  prevPitchHz: number | null;
  pendingPhraseEnd: boolean;
  sameRun: number; // consecutive repeats of the current pitch (anti-stuck guard)
  pending: NoteEvent[]; // queued ornament micro-notes to emit before advancing
  lastPullDegree?: number | null; // last-seen pull target — triggers an immediate rebuild on a fresh tap
};

export function initState(): EngineState {
  return {
    degreeIndex: 0,
    octave: 1,
    phrase: [],
    phraseRhythm: [],
    phraseIdx: 0,
    lastDeltas: [],
    lastRhythm: [],
    prevPitchHz: null,
    pendingPhraseEnd: false,
    sameRun: 0,
    pending: [],
    lastPullDegree: null,
  };
}

// Steady pulse: an integer multiple of the base unit, only gently humanised
// (≈metronomic when ioiJitter is small).
function sampleIoi(params: EngineParams, rng: () => number, mult: number): number {
  return params.baseIoiSec * mult * Math.exp(params.ioiJitter * gaussian(rng) * 0.5);
}

function reflectClamp(sp: number, lo: number, hi: number): number {
  if (sp > hi) sp = hi - (sp - hi);
  if (sp < lo) sp = lo + (lo - sp);
  return Math.min(hi, Math.max(lo, sp));
}

function nearestRestingStep(
  target: number,
  lo: number,
  hi: number,
  scaleLen: number,
  resting: number[],
): number {
  let best = target;
  let bestDist = Infinity;
  for (let sp = Math.ceil(lo); sp <= Math.floor(hi); sp++) {
    const { degreeIndex } = stepPosToDegree(sp, scaleLen);
    if (resting[degreeIndex] > 0) {
      // Distance discounted by resting strength: a strong resting note (tonic,
      // a boosted vadi) wins over a weak one up to ~2 steps further away.
      const d = Math.abs(sp - target) - resting[degreeIndex] * 2;
      if (d < bestDist) {
        bestDist = d;
        best = sp;
      }
    }
  }
  return best;
}

// FOCUS: which scale degrees are allowed. focus=0 → all; focus=1 → ~5 of the
// most characteristic degrees (a pentatonic-ish core), narrowing the palette so
// the line is more coherent / less wandering. Tonic is always allowed.
function focusedDegrees(scaleCents: number[], resting: number[], focus: number): boolean[] {
  const n = scaleCents.length;
  const keep = Math.max(Math.min(5, n), Math.min(n, Math.round(n + (5 - n) * focus)));
  // Priority by consonance: strongest resting notes first, ties in scale order.
  // (A hardcoded major-pentatonic order used to assume a 12-EDO diatonic scale,
  // which mis-picked degrees under maqam/non-diatonic 12-tone tunings.)
  const priority = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => resting[b] - resting[a] || a - b,
  );
  const allowed = new Array<boolean>(n).fill(false);
  for (let i = 0; i < keep && i < priority.length; i++) allowed[priority[i]] = true;
  allowed[0] = true; // tonic always in the palette
  return allowed;
}

// Nearest lattice step of `degree` to `near`, kept within [lo, hi] when possible.
function nearestDegreeStep(degree: number, near: number, scaleLen: number, lo: number, hi: number): number {
  let best = degree;
  let bestDist = Infinity;
  const kLo = Math.floor((lo - degree) / scaleLen);
  const kHi = Math.ceil((hi - degree) / scaleLen);
  for (let k = kLo; k <= kHi; k++) {
    const cand = degree + k * scaleLen;
    if (cand < lo || cand > hi) continue;
    const d = Math.abs(cand - near);
    if (d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  return bestDist === Infinity ? reflectClamp(degree, lo, hi) : best;
}

function snapToAllowed(sp: number, allowed: boolean[], scaleLen: number, lo: number, hi: number): number {
  const deg = (x: number) => ((x % scaleLen) + scaleLen) % scaleLen;
  if (allowed[deg(sp)]) return sp;
  for (let r = 1; r <= scaleLen; r++) {
    for (const cand of [sp - r, sp + r]) {
      if (cand >= Math.ceil(lo) && cand <= Math.floor(hi) && allowed[deg(cand)]) return cand;
    }
  }
  return sp;
}

// --- Wave 2A helpers (pure; see docs/superpowers/phrase-engine-upgrade.md) ---

// Rhythm-cell vocabulary: per-phrase rhythmic figures (IOI multiples of the base
// pulse). Subdivisions (0.5, thirds) only earn weight at higher density; a
// separate fire draw lets phrases fall back to the plain pulse so four looping
// patterns don't become their own monotony.
export const RHYTHM_CELLS: number[][] = [
  [1, 1, 2],
  [0.5, 0.5, 1],
  [1, 0.5, 0.5, 2],
  [2 / 3, 2 / 3, 2 / 3],
];

// Choose a phrase rhythm. Gated by caller (rhythmCellsEnabled); when this runs it
// DOES consume rng (fire + maybe a weighted pick), so it only ever runs behind
// the flag. On non-fire it reproduces the original per-note 1|2 pulse.
function rhythmCellRhythm(len: number, params: EngineParams, rng: () => number): number[] {
  // Recover density / rhythm-tightness from the derived params (no knobs here):
  // baseIoiSec = 4·0.1^density, ioiJitter = 0.35·(1 - rhythm).
  const density = Math.min(1, Math.max(0, -Math.log10(Math.max(1e-6, params.baseIoiSec / 4.0))));
  const jitterNorm = Math.min(1, Math.max(0, params.ioiJitter / 0.35));
  const sub = density * (1 - jitterNorm); // appetite for subdivisions
  const fireProb = 0.2 + 0.55 * sub; // busy & tight → cells; sparse/rubato → plain
  if (rng() >= fireProb) {
    return Array.from({ length: len }, () => (rng() < params.longNoteProb ? 2 : 1));
  }
  const w = [1.0, 0.3 + 1.2 * sub, 0.2 + 1.0 * sub, 0.15 + 0.9 * sub];
  const total = w.reduce((a, b) => a + b, 0);
  let x = rng() * total;
  let idx = 0;
  for (let i = 0; i < w.length; i++) {
    if ((x -= w[i]) < 0) { idx = i; break; }
  }
  const cell = RHYTHM_CELLS[idx];
  return Array.from({ length: len }, (_, i) => cell[i % cell.length]); // tile across the phrase
}

// The degree that follows `deg` in an authored crooked-descent path (vakra), or
// null if `deg` is absent / terminal. Pure lookup — consumes no rng.
export function pathSuccessorDegree(deg: number, path: number[]): number | null {
  const i = path.indexOf(deg);
  if (i < 0 || i + 1 >= path.length) return null;
  return path[i + 1];
}

// Phrase-level dynamics arch: a pure multiplier on the melodic velocity that
// swells toward the contour's registral peak (note furthest from centre) and
// softens the phrase-final note. Consumes NO rng — it only reshapes the existing
// velocity draw, so seeds stay reproducible.
export function contourVelocityFactor(idx: number, len: number, steps: number[], centerStep: number): number {
  if (len <= 1) return 1;
  let peak = 0;
  let peakDist = -1;
  for (let i = 0; i < steps.length; i++) {
    const d = Math.abs(steps[i] - centerStep);
    if (d > peakDist) { peakDist = d; peak = i; }
  }
  const denom = Math.max(peak, len - 1 - peak, 1);
  const toPeak = 1 - Math.abs(idx - peak) / denom; // 1 at the peak, →0 at the far end
  let f = 0.85 + 0.25 * toPeak; // gentle arch
  if (idx === len - 1) f *= 0.8; // release the phrase-final note
  return f;
}

// Integer matras from a tihai's grid start to the target sam, sized so ≥3
// figures fit within ~1.5 cycles. Returns null when no sam fits the budget.
export function tihaiTargetMatras(matraPosition: number, cycleMatras: number, minFigure: number): number | null {
  const C = cycleMatras;
  if (!(C > 0)) return null;
  const startMatra = Math.round(matraPosition);
  const posInCycle = ((startMatra % C) + C) % C;
  let D = (C - posInCycle) % C;
  if (D === 0) D = C; // land on the NEXT sam, not the one we sit on
  const budget = Math.ceil(1.5 * C);
  while (D < 3 * minFigure && D <= budget) D += C;
  if (D < 3 * minFigure || D > budget) return null;
  return D;
}

// Tihai solver: the last motif (figureCells, IOI multiples) played 3× with equal
// gaps so the line resolves EXACTLY on sam. Works in integer ticks (U subdivides
// halves & thirds). Padding the figure's final note by p flips the parity of
// 3·(Fdur+p), resolving any parity miss; returns null when the figure can't fit.
// Guarantee: 3·(Fdur+pad) + 2·gap === D.
const TIHAI_U = 6;
export function planTihai(
  figureCells: number[],
  matraPosition: number,
  cycleMatras: number,
  U = TIHAI_U,
): { D: number; pad: number; gap: number } | null {
  const Fdur = figureCells.reduce((a, b) => a + b, 0);
  if (Fdur <= 0) return null;
  const D = tihaiTargetMatras(matraPosition, cycleMatras, Fdur);
  if (D == null) return null;
  const Ft = Math.round(Fdur * U);
  const Dt = Math.round(D * U);
  for (let p = 0; p <= 2 * U; p++) {
    const N = Dt - 3 * (Ft + p);
    if (N < 0) return null; // too long even padded ⇒ no tihai
    if (N % 2 === 0) return { D, pad: p / U, gap: N / 2 / U };
  }
  return null;
}

// Lay a tihai out as a normal precomputed phrase: the figure's pitch ×3 then a
// landing note on sam. Gaps are realized as extended held final notes of
// statements 1 & 2 (no rest events), pad extends every statement's final note.
function buildTihaiPhrase(
  figSteps: number[],
  figureCells: number[],
  pad: number,
  gap: number,
  landingStep: number,
  curStep: number,
): { steps: number[]; deltas: number[]; rhythm: number[] } {
  const k = figSteps.length;
  const steps: number[] = [];
  const rhythm: number[] = [];
  for (let rep = 0; rep < 3; rep++) {
    for (let i = 0; i < k; i++) {
      steps.push(figSteps[i]);
      let c = figureCells[i];
      if (i === k - 1) {
        c += pad; // pad all three statements' resolving note
        if (rep < 2) c += gap; // the two inter-statement gaps
      }
      rhythm.push(c);
    }
  }
  steps.push(landingStep);
  rhythm.push(2); // the resolving note rings on sam
  const deltas: number[] = [];
  let prev = curStep;
  for (const s of steps) { deltas.push(s - prev); prev = s; }
  return { steps, deltas, rhythm };
}

// Build the next phrase: pitch path (steps + deltas) AND its rhythm. Either
// repeats the previous motif (pitch + rhythm) or generates a fresh directed
// contour that resolves onto a resting note. All notes are snapped to the
// FOCUS palette (`allowed`).
function buildPhrase(
  curStep: number,
  centerStep: number,
  lo: number,
  hi: number,
  scaleLen: number,
  resting: number[],
  params: EngineParams,
  rng: () => number,
  lastDeltas: number[],
  lastRhythm: number[],
  up: boolean[],    // palette while ascending (aroha, or the FOCUS palette)
  down: boolean[],  // palette while descending (avaroha, or the FOCUS palette)
  union: boolean[], // up ∪ down — for direction-neutral snaps (targets)
): { steps: number[]; deltas: number[]; rhythm: number[] } {
  // Pakad: sometimes the raga's signature phrase IS the next phrase,
  // transposed by whole octaves to sit nearest the register centre. Not
  // snapped — the pakad is by definition inside the raga.
  const pakad = params.pakadSteps;
  if (pakad && pakad.length >= 2 && rng() < (params.pakadProb ?? 0)) {
    // Transpose the WHOLE pakad by an integer number of octaves so it fits
    // inside [lo,hi] as a block. Reflecting individual notes (reflectClamp) at
    // register extremes could bend the signature phrase onto out-of-raga
    // degrees; a block shift preserves every note's degree.
    const pmin = Math.min(...pakad);
    const pmax = Math.max(...pakad);
    const mean = (pmin + pmax) / 2;
    // Total amount by which the pakad pokes outside the register at offset k.
    const overflow = (k: number) =>
      Math.max(0, lo - (pmin + k * scaleLen)) + Math.max(0, pmax + k * scaleLen - hi);
    let bestK = Math.round((centerStep - mean) / scaleLen);
    let bestOv = overflow(bestK);
    // Search nearby octaves for the placement that best fits (0 == fully inside).
    for (let k = bestK - 4; k <= bestK + 4; k++) {
      const ov = overflow(k);
      if (ov < bestOv) {
        bestOv = ov;
        bestK = k;
      }
    }
    const shift = bestK * scaleLen;
    // Clamp (never reflect) only guards the degenerate case where the pakad's
    // span exceeds the whole register and no octave placement can contain it.
    const steps = pakad.map((p) => Math.min(hi, Math.max(lo, p + shift)));
    const deltas: number[] = [];
    let prev = curStep;
    for (const s of steps) {
      deltas.push(s - prev);
      prev = s;
    }
    // The pakad lands held on its last note.
    const rhythm = steps.map((_, i) => (i === steps.length - 1 ? 2 : 1));
    return { steps, deltas, rhythm };
  }

  // Motif repetition: replay the previous shape (pitch + rhythm) from here,
  // snapped to the direction-appropriate palette.
  if (lastDeltas.length >= 2 && rng() < params.repeatProb) {
    const steps: number[] = [];
    let p = curStep;
    // Vakra: pick the palette from the motif's OVERALL direction (one segment),
    // not per delta, so a momentary counter-step can't flip the mask mid-motif.
    const segDir = params.vakraEnabled ? (Math.sign(lastDeltas.reduce((a, b) => a + b, 0)) || 1) : 0;
    for (const d of lastDeltas) {
      const mask = params.vakraEnabled ? (segDir >= 0 ? up : down) : d >= 0 ? up : down;
      p = snapToAllowed(reflectClamp(p + d, lo, hi), mask, scaleLen, lo, hi);
      steps.push(p);
    }
    steps[steps.length - 1] = snapToAllowed(
      nearestRestingStep(steps[steps.length - 1], lo, hi, scaleLen, resting), union, scaleLen, lo, hi,
    );
    return { steps, deltas: lastDeltas, rhythm: lastRhythm };
  }

  // Fresh directed contour toward a resting target. Tonic gravity (from
  // RESTLESSNESS) gives a graded pull back toward the register centre —
  // stronger when calm and when further from home. A conducted pull (tapped
  // ladder degree) overrides the target outright.
  let target: number;
  if (params.pullDegree != null) {
    target = nearestDegreeStep(params.pullDegree, curStep, scaleLen, lo, hi);
  } else {
    const distFromCenter = curStep - centerStep;
    const towardCenter = distFromCenter > 0 ? -1 : 1;
    const homeBias = Math.min(
      0.95,
      Math.max(0.05, 0.5 + params.tonicGravity * (Math.abs(distFromCenter) / params.registerHalfSpanSteps) * 0.5),
    );
    const dir = rng() < homeBias ? towardCenter : -towardCenter;
    const reach = 3 + Math.floor(rng() * 5); // 3..7 steps — longer, singable arcs
    target = snapToAllowed(
      nearestRestingStep(reflectClamp(curStep + dir * reach, lo, hi), lo, hi, scaleLen, resting), union, scaleLen, lo, hi,
    );
  }

  const steps: number[] = [];
  let p = curStep;
  let guard = 0;
  const fallbackDir = Math.sign(target - curStep) || 1;
  // Vakra: one palette for the whole travel-toward-target segment; and, while
  // descending with an authored crooked path, prefer each step's path successor.
  const segMask = params.vakraEnabled ? (fallbackDir >= 0 ? up : down) : null;
  const descPath = params.vakraEnabled && fallbackDir < 0 ? params.avarohaPath : undefined;
  while (p !== target && guard++ < 24) {
    const toward = Math.sign(target - p) || fallbackDir;
    const step = rng() < params.contourStrength ? toward : rng() < 0.5 ? toward : -toward;
    let mag = 1;
    if (rng() < params.leapProbability) mag = 2 + Math.floor(rng() * 2); // 2..3
    const mask = segMask ?? (step >= 0 ? up : down);
    let cand = reflectClamp(p + step * mag, lo, hi);
    if (descPath) {
      const { degreeIndex: cd } = stepPosToDegree(cand, scaleLen);
      const succ = pathSuccessorDegree(cd, descPath);
      if (succ != null) cand = nearestDegreeStep(succ, cand, scaleLen, lo, hi); // crooked turn
    }
    p = snapToAllowed(cand, mask, scaleLen, lo, hi);
    steps.push(p);
  }
  if (steps.length === 0 || steps[steps.length - 1] !== target) steps.push(target);

  const deltas: number[] = [];
  let prev = curStep;
  for (const s of steps) {
    deltas.push(s - prev);
    prev = s;
  }
  // Rhythm: rhythm cells (gated) ride on the phrase, else the plain per-note
  // pulse (mostly base, occasional double-length held notes). OFF ⇒ same draws.
  const rhythm = params.rhythmCellsEnabled
    ? rhythmCellRhythm(steps.length, params, rng)
    : steps.map(() => (rng() < params.longNoteProb ? 2 : 1));
  return { steps, deltas, rhythm };
}

export function nextEvent(
  state: EngineState,
  scaleCents: number[],
  tonicHz: number,
  params: EngineParams,
  rng: () => number,
): { event: EngineEvent; state: EngineState } {
  const scaleLen = scaleCents.length;
  // Drain any queued ornament micro-notes first — they carry no melodic state
  // change and consume no rng, so determinism of the underlying line is intact.
  if (state.pending.length > 0) {
    const [head, ...rest] = state.pending;
    return { event: head, state: { ...state, pending: rest } };
  }
  const next: EngineState = { ...state };
  // Immediate pull response: a newly-tapped ladder degree ends the current phrase
  // so the NEXT note starts a fresh contour toward the new target (answers within
  // a note or two, not at the end of a long precomputed phrase). Fires only on a
  // transition to a new non-null pullDegree; pullDegree is never serialized, so
  // seeded replay (always null) never takes this path. Consumes no rng.
  const freshPull = params.pullDegree != null && params.pullDegree !== (state.lastPullDegree ?? null);
  // Taal structural bias (mild multipliers around 1.0; null => free/rubato).
  const tRest = Math.max(0, Math.min(2, params.taalBias?.rest ?? 1));
  const tAccent = Math.max(0, Math.min(1.6, params.taalBias?.accent ?? 1));
  const tResolution = Math.max(0.5, Math.min(3, params.taalBias?.resolution ?? 1));
  const tPhraseStart = Math.max(0.5, Math.min(2, params.taalBias?.phraseStart ?? 1));
  const restingBase = restingNotes(scaleCents);
  // Weak/durbal degrees: damp their intrinsic resting strength so lines stop
  // resolving onto them (e.g. Marwa marks Sa weak, yet its 0-cent tonic is the
  // strongest resting target — without this the line keeps homing to Sa).
  // restingNotes() itself is untouched (the tanpura relies on it).
  const atten = params.degreeAttenuate;
  const base =
    atten && atten.length > 0
      ? restingBase.map((r, i) => (atten.includes(i) ? r * 0.25 : r))
      : restingBase;
  // Vadi/samvadi boost: the raga's emphasized degrees behave as strong
  // resting notes (resolution targets, longer dwell, slight accent).
  const resting = params.degreeBoost
    ? base.map((r, i) => Math.max(r, params.degreeBoost![i] ?? 0))
    : base;
  const centerStep = hzToNearestStepPos(params.centerPitchHz, scaleCents, tonicHz);
  const lo = centerStep - params.registerHalfSpanSteps;
  const hi = centerStep + (params.ceilingStep != null ? Math.min(params.registerHalfSpanSteps, params.ceilingStep) : params.registerHalfSpanSteps);

  // 1. Rest? A breath sometimes follows a completed phrase; SILENCE adds ambient
  //    rests on top. (Not every phrase breathes — phrases also flow together.)
  const phraseBreath = state.pendingPhraseEnd;
  // Taal biases rests toward khali and away from sam (tRest scales rest odds).
  // When a fresh phrase would launch this event, phraseStart pulls launches
  // toward sam/tali by damping the breath that would delay them (a bias, not
  // a hard gate — resting there stays possible).
  const launchPending = phraseBreath || state.phraseIdx >= state.phrase.length;
  const restBias = launchPending ? tRest / tPhraseStart : tRest;
  if ((phraseBreath && rng() < 0.6 * restBias) || rng() < params.pRest * restBias) {
    const phraseEnd = phraseBreath || rng() < 0.3;
    const ioi = sampleIoi(params, rng, phraseEnd ? params.phrasePauseFactor : 1);
    if (phraseEnd) next.pendingPhraseEnd = false;
    return { event: { kind: "rest", ioiSec: ioi, phraseEnd }, state: next };
  }
  // Record the pull target only on a sounding note — a rest must not swallow a
  // fresh tap, so freshPull stays true until the line actually answers.
  next.lastPullDegree = params.pullDegree ?? null;

  const curStep = degreeToStepPos(state.degreeIndex, state.octave, scaleLen);
  // Palettes: a raga supplies direction-dependent masks (aroha/avaroha);
  // otherwise the FOCUS palette applies both ways.
  const focused = focusedDegrees(scaleCents, resting, params.focus);
  const up = params.arohaMask ?? focused;
  const down = params.avarohaMask ?? focused;
  const allowed = up.map((v, i) => v || down[i]); // union, for direction-neutral snaps

  // 2. Need a new phrase? Build one (a tihai, a repeat of the last motif, or a
  //    fresh contour).
  if (freshPull || state.phraseIdx >= state.phrase.length) {
    let built: { steps: number[]; deltas: number[]; rhythm: number[] } | null = null;
    // Tihai: only when enabled AND a taal/matra context AND a prior motif exist.
    // The single rng fire-draw happens ONLY on this gated path, so the default
    // (flag off) stream is untouched.
    if (
      params.tihaiEnabled &&
      params.taalBias &&
      params.cycleMatras &&
      params.matraPosition != null &&
      state.lastDeltas.length >= 2 &&
      state.lastRhythm.length === state.lastDeltas.length
    ) {
      const plan = planTihai(state.lastRhythm, params.matraPosition, params.cycleMatras);
      if (plan) {
        // theme proxy from repeatProb = lerp(0.15, 0.9, theme); conservative fire.
        const theme = Math.min(1, Math.max(0, (params.repeatProb - 0.15) / 0.75));
        if (rng() < 0.1 + 0.22 * theme) {
          // Reconstruct the figure's pitch from the last motif (snapped like a repeat).
          const figSteps: number[] = [];
          let fp = curStep;
          for (const d of state.lastDeltas) {
            const mask = d >= 0 ? up : down;
            fp = snapToAllowed(reflectClamp(fp + d, lo, hi), mask, scaleLen, lo, hi);
            figSteps.push(fp);
          }
          const landingStep = nearestDegreeStep(0, centerStep, scaleLen, lo, hi); // Sa on sam
          built = buildTihaiPhrase(figSteps, state.lastRhythm, plan.pad, plan.gap, landingStep, curStep);
        }
      }
    }
    if (!built) {
      // Near sam, strengthen the pull to resting notes so phrases resolve there.
      const restingForTarget = tResolution !== 1 ? resting.map((r) => r * tResolution) : resting;
      built = buildPhrase(
        curStep, centerStep, lo, hi, scaleLen, restingForTarget, params, rng, state.lastDeltas, state.lastRhythm, up, down, allowed,
      );
    }
    next.phrase = built.steps;
    next.phraseRhythm = built.rhythm;
    next.phraseIdx = 0;
    next.lastDeltas = built.deltas;
    next.lastRhythm = built.rhythm;
  }

  // 3. Emit the next note of the phrase, with its motif-bound rhythm.
  const phraseStart = next.phraseIdx === 0;
  let nextStep = next.phrase[next.phraseIdx];
  const mult = next.phraseRhythm[next.phraseIdx] ?? 1;
  next.phraseIdx = next.phraseIdx + 1;
  // Sometimes breathe after a completed phrase; sometimes flow into the next.
  if (next.phraseIdx >= next.phrase.length) next.pendingPhraseEnd = rng() < 0.6;

  // Anti-stuck guard: allow at most two identical pitches in a row, then nudge
  // to an adjacent allowed degree (prefer toward centre) so it can't drone on
  // one note.
  if (nextStep === curStep) {
    next.sameRun = state.sameRun + 1;
    if (next.sameRun >= 2) {
      const dir = centerStep < curStep ? -1 : 1;
      for (const off of [dir, -dir, 2 * dir, -2 * dir]) {
        const cand = snapToAllowed(curStep + off, allowed, scaleLen, lo, hi);
        if (cand !== curStep) {
          nextStep = cand;
          break;
        }
      }
      next.sameRun = 0;
    }
  } else {
    next.sameRun = 0;
  }

  const { degreeIndex, octave } = stepPosToDegree(nextStep, scaleLen);
  const pitchHz = degreeToHz(scaleCents, tonicHz, degreeIndex, octave);
  const restingStrength = resting[degreeIndex];
  const dwellMult = 1 + restingStrength * (params.restingDwell - 1);
  let glideFromHz =
    state.prevPitchHz != null && rng() < params.glideProbability ? state.prevPitchHz : undefined;

  next.degreeIndex = degreeIndex;
  next.octave = octave;
  next.prevPitchHz = pitchHz;

  const baseVel = 0.6 + rng() * 0.2;
  // Dynamics arch: swell toward the phrase's registral peak, soften the final
  // note. Pure remap of the melodic velocity (no new rng). Taal accent stays
  // multiplicative on top (strongest at sam).
  const arch = contourVelocityFactor(next.phraseIdx - 1, next.phrase.length, next.phrase, centerStep);
  const velocity = Math.min(1, ((baseVel + (phraseStart ? 0.12 : 0) + restingStrength * 0.1) * arch) * tAccent);
  const ioiSec = sampleIoi(params, rng, mult);

  // Gamaka: authored per-raga ornaments. Disabled (default) consumes NO rng, so
  // existing seeds reproduce identically. When enabled, the plan produces short
  // micro-notes emitted around the main note via the pending queue.
  const plan = planGamaka(
    {
      degreeIndex, octave, scaleCents, tonicHz, pitchHz,
      prevPitchHz: state.prevPitchHz,
      ascending: nextStep >= curStep,
      isPhraseStart: phraseStart,
      restingStrength,
      baseIoiSec: params.baseIoiSec,
    },
    params.gamaka,
    params.gamakaEnabled ?? false,
    rng,
    allowed,
  );
  if (plan.glideFromHz !== undefined) glideFromHz = plan.glideFromHz;

  const mkMicro = (
    m: { pitchHz: number; velocity: number; ioiSec: number; glideFromHz?: number },
    noPluck?: true,
  ): NoteEvent => ({
    kind: "note",
    pitchHz: m.pitchHz,
    glideFromHz: m.glideFromHz,
    velocity: Math.min(1, m.velocity * tAccent),
    ioiSec: m.ioiSec,
    durationHint: Math.min(8, m.ioiSec * 2),
    degreeIndex,
    octave,
    ...(noPluck ? { noPluck } : {}),
  });
  const graceEvents = plan.graces.map((m) => mkMicro(m));
  // Tail notes are the andolan waver — a continuous bend, not a re-attack.
  const tailEvents = plan.tail.map((m) => mkMicro(m, true));
  // Graces steal time from the main note so its onset stays near the grid.
  const graceTime = graceEvents.reduce((s, e) => s + e.ioiSec, 0);
  const mainIoi = Math.max(0.05, ioiSec - graceTime);

  const mainNote: NoteEvent = {
    kind: "note",
    pitchHz,
    glideFromHz,
    velocity,
    ioiSec: mainIoi,
    durationHint: Math.min(8, mainIoi * dwellMult * 1.4),
    degreeIndex,
    octave,
  };

  // Order: graces → main → andolan tail. The main note carries the melodic
  // state change; the queued micro-notes are transient (drained without rng).
  const sequence: NoteEvent[] = [...graceEvents, mainNote, ...tailEvents];
  next.pending = sequence.slice(1);
  return { event: sequence[0], state: next };
}
