// src/engine.ts
// Melodic engine: directed phrase contours over a steady pulse. A phrase picks
// a direction + a resting-note target, walks (mostly stepwise) toward it, and
// resolves on it, followed by a breath. RESTLESSNESS loosens the contour and
// the rhythm toward the old wandering walk. Pure & seeded: no audio, no Date.
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
  pRest: number;
  phrasePauseFactor: number;
  glideProbability: number;
};

export type EngineState = {
  degreeIndex: number;
  octave: number;
  phrasePosition: number;
  phraseLength: number;
  phraseDir: number; // +1 up / -1 down
  phraseTargetStep: number;
  prevPitchHz: number | null;
  pendingPhraseEnd: boolean;
};

export function initState(): EngineState {
  return {
    degreeIndex: 0,
    octave: 1,
    phrasePosition: 0,
    phraseLength: 0,
    phraseDir: 1,
    phraseTargetStep: 0,
    prevPitchHz: null,
    pendingPhraseEnd: false,
  };
}

function sampleIoi(params: EngineParams, rng: () => number, mult: number): number {
  // Steady pulse * note-value multiple, with a gentle multiplicative humanise
  // (≈1 when ioiJitter is tiny, so calm playing is near-metronomic).
  return params.baseIoiSec * mult * Math.exp(params.ioiJitter * gaussian(rng));
}

// Nearest lattice step in [lo,hi] whose degree is a resting (consonant) note.
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

  // 2. Phrase start: choose a contour direction + a resting-note target.
  if (state.phrasePosition === 0) {
    const distFromCenter = curStep - centerStep;
    let dir: number;
    if (Math.abs(distFromCenter) > params.registerHalfSpanSteps * 0.6) {
      dir = distFromCenter > 0 ? -1 : 1; // turn back toward home near the edges
    } else {
      dir = rng() < 0.5 ? -1 : 1;
    }
    const reach = 2 + Math.floor(rng() * 4); // span 2..5 steps
    let target = curStep + dir * reach;
    target = Math.min(hi, Math.max(lo, target));
    target = nearestRestingStep(target, lo, hi, scaleLen, resting);
    next.phraseDir = dir;
    next.phraseTargetStep = target;
    next.phraseLength = Math.max(3, Math.abs(target - curStep) + 1 + Math.floor(rng() * 2));
    next.pendingPhraseEnd = false;
  }

  // 3. Move toward the target (directed contour); RESTLESSNESS loosens it.
  const isFinal = state.phrasePosition + 1 >= next.phraseLength;
  let nextStep: number;
  if (isFinal) {
    nextStep = next.phraseTargetStep; // resolve the phrase onto its resting note
  } else {
    const toward = Math.sign(next.phraseTargetStep - curStep) || next.phraseDir;
    const dir = rng() < params.contourStrength ? toward : rng() < 0.5 ? toward : -toward;
    let magnitude = 1;
    if (rng() < params.leapProbability) magnitude = 2 + Math.floor(rng() * 2); // 2..3
    nextStep = curStep + dir * magnitude;
    if (nextStep > hi) nextStep = hi - (nextStep - hi);
    if (nextStep < lo) nextStep = lo + (lo - nextStep);
    nextStep = Math.min(hi, Math.max(lo, nextStep));
  }

  const { degreeIndex, octave } = stepPosToDegree(nextStep, scaleLen);
  const pitchHz = degreeToHz(scaleCents, tonicHz, degreeIndex, octave);
  const restingStrength = resting[degreeIndex];
  const dwellMult = 1 + restingStrength * (params.restingDwell - 1);
  const glideFromHz =
    state.prevPitchHz != null && rng() < params.glideProbability ? state.prevPitchHz : undefined;

  const phraseStart = state.phrasePosition === 0;
  next.phrasePosition = state.phrasePosition + 1;
  if (next.phrasePosition >= next.phraseLength) {
    next.pendingPhraseEnd = true;
    next.phrasePosition = 0; // the next note begins a fresh contour
  }
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
