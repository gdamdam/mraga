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
};
export type RestEvent = { kind: "rest"; ioiSec: number; phraseEnd: boolean };
export type EngineEvent = NoteEvent | RestEvent;

export type EngineParams = {
  baseIoiSec: number;
  ioiJitter: number;
  longNoteProb: number;
  centerPitchHz: number;
  registerHalfSpanSteps: number;
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
  // Priority: a 12-tone major-pentatonic-first order, else by consonance.
  const priority =
    n === 12
      ? [0, 2, 4, 7, 9, 5, 11, 3, 8, 10, 1, 6]
      : Array.from({ length: n }, (_, i) => i).sort((a, b) => resting[b] - resting[a] || a - b);
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
    const mean = pakad.reduce((a, b) => a + b, 0) / pakad.length;
    const k = Math.round((centerStep - mean) / scaleLen);
    const steps = pakad.map((p) => reflectClamp(p + k * scaleLen, lo, hi));
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
    for (const d of lastDeltas) {
      const mask = d >= 0 ? up : down;
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
  while (p !== target && guard++ < 24) {
    const toward = Math.sign(target - p) || fallbackDir;
    const step = rng() < params.contourStrength ? toward : rng() < 0.5 ? toward : -toward;
    let mag = 1;
    if (rng() < params.leapProbability) mag = 2 + Math.floor(rng() * 2); // 2..3
    const mask = step >= 0 ? up : down;
    p = snapToAllowed(reflectClamp(p + step * mag, lo, hi), mask, scaleLen, lo, hi);
    steps.push(p);
  }
  if (steps.length === 0 || steps[steps.length - 1] !== target) steps.push(target);

  const deltas: number[] = [];
  let prev = curStep;
  for (const s of steps) {
    deltas.push(s - prev);
    prev = s;
  }
  // Rhythm: mostly the base pulse, occasional double-length (held) notes.
  const rhythm = steps.map(() => (rng() < params.longNoteProb ? 2 : 1));
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
  // Taal structural bias (mild multipliers around 1.0; null => free/rubato).
  const tRest = Math.max(0, Math.min(2, params.taalBias?.rest ?? 1));
  const tAccent = Math.max(0, Math.min(1.6, params.taalBias?.accent ?? 1));
  const tResolution = Math.max(0.5, Math.min(3, params.taalBias?.resolution ?? 1));
  const tPhraseStart = Math.max(0.5, Math.min(2, params.taalBias?.phraseStart ?? 1));
  const restingBase = restingNotes(scaleCents);
  // Vadi/samvadi boost: the raga's emphasized degrees behave as strong
  // resting notes (resolution targets, longer dwell, slight accent).
  const resting = params.degreeBoost
    ? restingBase.map((r, i) => Math.max(r, params.degreeBoost![i] ?? 0))
    : restingBase;
  const centerStep = hzToNearestStepPos(params.centerPitchHz, scaleCents, tonicHz);
  const lo = centerStep - params.registerHalfSpanSteps;
  const hi = centerStep + params.registerHalfSpanSteps;

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

  const curStep = degreeToStepPos(state.degreeIndex, state.octave, scaleLen);
  // Palettes: a raga supplies direction-dependent masks (aroha/avaroha);
  // otherwise the FOCUS palette applies both ways.
  const focused = focusedDegrees(scaleCents, resting, params.focus);
  const up = params.arohaMask ?? focused;
  const down = params.avarohaMask ?? focused;
  const allowed = up.map((v, i) => v || down[i]); // union, for direction-neutral snaps

  // 2. Need a new phrase? Build one (repeat the last motif, or a fresh contour).
  if (state.phraseIdx >= state.phrase.length) {
    // Near sam, strengthen the pull to resting notes so phrases resolve there.
    const restingForTarget = tResolution !== 1 ? resting.map((r) => r * tResolution) : resting;
    const built = buildPhrase(
      curStep, centerStep, lo, hi, scaleLen, restingForTarget, params, rng, state.lastDeltas, state.lastRhythm, up, down, allowed,
    );
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
  // Taal accent scales emphasis (strongest at sam).
  const velocity = Math.min(1, (baseVel + (phraseStart ? 0.12 : 0) + restingStrength * 0.1) * tAccent);
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

  const mkMicro = (m: { pitchHz: number; velocity: number; ioiSec: number; glideFromHz?: number }): NoteEvent => ({
    kind: "note",
    pitchHz: m.pitchHz,
    glideFromHz: m.glideFromHz,
    velocity: Math.min(1, m.velocity * tAccent),
    ioiSec: m.ioiSec,
    durationHint: Math.min(8, m.ioiSec * 2),
    degreeIndex,
    octave,
  });
  const graceEvents = plan.graces.map(mkMicro);
  const tailEvents = plan.tail.map(mkMicro);
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
