// src/engine.ts
// Melodic engine: each phrase is a precomputed shape (a directed contour that
// resolves on a resting note), and phrases REPEAT/SEQUENCE the previous shape —
// recurring motifs make the line feel intentional rather than random. The
// pulse is steady; RESTLESSNESS loosens contour/repetition toward a free walk.
// Pure & seeded: no audio, no Date.
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
  pRest: number;
  phrasePauseFactor: number;
  glideProbability: number;
};

export type EngineState = {
  degreeIndex: number;
  octave: number;
  phrase: number[];     // precomputed lattice step positions for the current phrase
  phraseIdx: number;    // index of the next note to emit within `phrase`
  lastDeltas: number[]; // step deltas of the last phrase (for repetition/sequence)
  prevPitchHz: number | null;
  pendingPhraseEnd: boolean;
};

export function initState(): EngineState {
  return {
    degreeIndex: 0,
    octave: 1,
    phrase: [],
    phraseIdx: 0,
    lastDeltas: [],
    prevPitchHz: null,
    pendingPhraseEnd: false,
  };
}

function sampleIoi(params: EngineParams, rng: () => number, mult: number): number {
  return params.baseIoiSec * mult * Math.exp(params.ioiJitter * gaussian(rng));
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

// Build the next phrase as a sequence of lattice step positions. Either repeats
// the previous shape (motif/sequence) or generates a fresh directed contour
// that resolves onto a resting note.
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
): { steps: number[]; deltas: number[] } {
  // Motif repetition: replay the previous phrase's interval shape from here.
  if (lastDeltas.length >= 2 && rng() < params.repeatProb) {
    const steps: number[] = [];
    let p = curStep;
    for (const d of lastDeltas) {
      p = reflectClamp(p + d, lo, hi);
      steps.push(p);
    }
    steps[steps.length - 1] = nearestRestingStep(steps[steps.length - 1], lo, hi, scaleLen, resting);
    return { steps, deltas: lastDeltas };
  }

  // Fresh directed contour toward a resting target.
  const distFromCenter = curStep - centerStep;
  const dir =
    Math.abs(distFromCenter) > params.registerHalfSpanSteps * 0.6
      ? distFromCenter > 0
        ? -1
        : 1
      : rng() < 0.5
        ? -1
        : 1;
  const reach = 2 + Math.floor(rng() * 4); // 2..5 steps
  const target = nearestRestingStep(reflectClamp(curStep + dir * reach, lo, hi), lo, hi, scaleLen, resting);

  const steps: number[] = [];
  let p = curStep;
  let guard = 0;
  while (p !== target && guard++ < 24) {
    const toward = Math.sign(target - p) || dir;
    const step = rng() < params.contourStrength ? toward : rng() < 0.5 ? toward : -toward;
    let mag = 1;
    if (rng() < params.leapProbability) mag = 2 + Math.floor(rng() * 2); // 2..3
    p = reflectClamp(p + step * mag, lo, hi);
    steps.push(p);
  }
  if (steps.length === 0 || steps[steps.length - 1] !== target) steps.push(target);

  const deltas: number[] = [];
  let prev = curStep;
  for (const s of steps) {
    deltas.push(s - prev);
    prev = s;
  }
  return { steps, deltas };
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

  // 1. Rest? A breath strongly tends to follow a completed phrase; SILENCE adds
  //    ambient rests on top.
  const phraseBreath = state.pendingPhraseEnd;
  if ((phraseBreath && rng() < 0.7) || rng() < params.pRest) {
    const phraseEnd = phraseBreath || rng() < 0.3;
    const ioi = sampleIoi(params, rng, phraseEnd ? params.phrasePauseFactor : 1);
    if (phraseEnd) next.pendingPhraseEnd = false;
    return { event: { kind: "rest", ioiSec: ioi, phraseEnd }, state: next };
  }

  const curStep = degreeToStepPos(state.degreeIndex, state.octave, scaleLen);

  // 2. Need a new phrase? Build one (repeat the last shape, or a fresh contour).
  if (state.phraseIdx >= state.phrase.length) {
    const { steps, deltas } = buildPhrase(curStep, centerStep, lo, hi, scaleLen, resting, params, rng, state.lastDeltas);
    next.phrase = steps;
    next.phraseIdx = 0;
    next.lastDeltas = deltas;
  }

  // 3. Emit the next note of the phrase.
  const phraseStart = next.phraseIdx === 0;
  const nextStep = next.phrase[next.phraseIdx];
  next.phraseIdx = next.phraseIdx + 1;
  if (next.phraseIdx >= next.phrase.length) next.pendingPhraseEnd = true;

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
  const longNote = rng() < params.longNoteProb;
  const ioiSec = sampleIoi(params, rng, longNote ? 2 : 1);

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
