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
      const d = Math.abs(sp - target);
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
  allowed: boolean[],
): { steps: number[]; deltas: number[]; rhythm: number[] } {
  // Motif repetition: replay the previous shape (pitch + rhythm) from here,
  // snapped to the FOCUS palette.
  if (lastDeltas.length >= 2 && rng() < params.repeatProb) {
    const steps: number[] = [];
    let p = curStep;
    for (const d of lastDeltas) {
      p = snapToAllowed(reflectClamp(p + d, lo, hi), allowed, scaleLen, lo, hi);
      steps.push(p);
    }
    steps[steps.length - 1] = snapToAllowed(
      nearestRestingStep(steps[steps.length - 1], lo, hi, scaleLen, resting), allowed, scaleLen, lo, hi,
    );
    return { steps, deltas: lastDeltas, rhythm: lastRhythm };
  }

  // Fresh directed contour toward a resting target (on the FOCUS palette).
  const distFromCenter = curStep - centerStep;
  const dir =
    Math.abs(distFromCenter) > params.registerHalfSpanSteps * 0.6
      ? distFromCenter > 0
        ? -1
        : 1
      : rng() < 0.5
        ? -1
        : 1;
  const reach = 3 + Math.floor(rng() * 5); // 3..7 steps — longer, singable arcs
  const target = snapToAllowed(
    nearestRestingStep(reflectClamp(curStep + dir * reach, lo, hi), lo, hi, scaleLen, resting), allowed, scaleLen, lo, hi,
  );

  const steps: number[] = [];
  let p = curStep;
  let guard = 0;
  while (p !== target && guard++ < 24) {
    const toward = Math.sign(target - p) || dir;
    const step = rng() < params.contourStrength ? toward : rng() < 0.5 ? toward : -toward;
    let mag = 1;
    if (rng() < params.leapProbability) mag = 2 + Math.floor(rng() * 2); // 2..3
    p = snapToAllowed(reflectClamp(p + step * mag, lo, hi), allowed, scaleLen, lo, hi);
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
  const next: EngineState = { ...state };
  const resting = restingNotes(scaleCents);
  const centerStep = hzToNearestStepPos(params.centerPitchHz, scaleCents, tonicHz);
  const lo = centerStep - params.registerHalfSpanSteps;
  const hi = centerStep + params.registerHalfSpanSteps;

  // 1. Rest? A breath sometimes follows a completed phrase; SILENCE adds ambient
  //    rests on top. (Not every phrase breathes — phrases also flow together.)
  const phraseBreath = state.pendingPhraseEnd;
  if ((phraseBreath && rng() < 0.6) || rng() < params.pRest) {
    const phraseEnd = phraseBreath || rng() < 0.3;
    const ioi = sampleIoi(params, rng, phraseEnd ? params.phrasePauseFactor : 1);
    if (phraseEnd) next.pendingPhraseEnd = false;
    return { event: { kind: "rest", ioiSec: ioi, phraseEnd }, state: next };
  }

  const curStep = degreeToStepPos(state.degreeIndex, state.octave, scaleLen);
  const allowed = focusedDegrees(scaleCents, resting, params.focus);

  // 2. Need a new phrase? Build one (repeat the last motif, or a fresh contour).
  if (state.phraseIdx >= state.phrase.length) {
    const built = buildPhrase(
      curStep, centerStep, lo, hi, scaleLen, resting, params, rng, state.lastDeltas, state.lastRhythm, allowed,
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
  const glideFromHz =
    state.prevPitchHz != null && rng() < params.glideProbability ? state.prevPitchHz : undefined;

  next.degreeIndex = degreeIndex;
  next.octave = octave;
  next.prevPitchHz = pitchHz;

  const baseVel = 0.6 + rng() * 0.2;
  const velocity = Math.min(1, baseVel + (phraseStart ? 0.12 : 0) + restingStrength * 0.1);
  const ioiSec = sampleIoi(params, rng, mult);

  return {
    event: {
      kind: "note",
      pitchHz,
      glideFromHz,
      velocity,
      ioiSec,
      durationHint: Math.min(8, ioiSec * dwellMult * 1.4),
      degreeIndex,
      octave,
    },
    state: next,
  };
}
