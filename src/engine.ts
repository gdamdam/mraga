// src/engine.ts
// Scale-aware gravity walk (spec §4). Pure & seeded: nextEvent has no side
// effects and no AudioContext. The walk lives on a lattice of (degreeIndex,
// octave); a "step position" is octave*scaleLen + degreeIndex.
import { makeRng, gaussian } from "./rng";
import { degreeToHz, degreeToStepPos, stepPosToDegree, hzToNearestStepPos, restingNotes } from "./tuning";

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
  meanIoiSec: number;
  ioiJitter: number;
  centerPitchHz: number;
  registerHalfSpanSteps: number;
  stepVariance: number;
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
  prevPitchHz: number | null;
  pendingPhraseEnd: boolean;
};

export function initState(): EngineState {
  return {
    degreeIndex: 0,
    octave: 1,
    phrasePosition: 0,
    phraseLength: 5,
    prevPitchHz: null,
    pendingPhraseEnd: false,
  };
}

function sampleIoi(params: EngineParams, rng: () => number): number {
  // Log-normal jitter around the mean so timing never feels mechanical.
  return params.meanIoiSec * Math.exp(params.ioiJitter * gaussian(rng));
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

  // 1. Rest?
  if (rng() < params.pRest) {
    const phraseEnd = next.pendingPhraseEnd || rng() < 0.35;
    const ioi = sampleIoi(params, rng) * (phraseEnd ? params.phrasePauseFactor : 1);
    if (phraseEnd) {
      next.phrasePosition = 0;
      next.phraseLength = 3 + Math.floor(rng() * 6); // 3..8 notes
      next.pendingPhraseEnd = false;
    }
    return { event: { kind: "rest", ioiSec: ioi, phraseEnd }, state: next };
  }

  // 2. Pick the next pitch from the current lattice position.
  const curSp = degreeToStepPos(state.degreeIndex, state.octave, scaleLen);
  const centerSp = hzToNearestStepPos(params.centerPitchHz, scaleCents, tonicHz);
  const dist = curSp - centerSp; // + above center

  // Tonic gravity: bias direction toward center, stronger the further out.
  const gravityBias = params.tonicGravity * dist * 0.15;
  const pDown = Math.min(0.9, Math.max(0.1, 0.5 + gravityBias));
  const direction = rng() < pDown ? -1 : 1;

  // Step magnitude: mostly 1; occasional leaps; RESTLESSNESS widens both.
  let magnitude = 1;
  if (rng() < params.leapProbability) {
    magnitude = 2 + Math.floor(rng() * 3); // 2..4
  } else if (rng() < params.stepVariance / 4) {
    magnitude = 2;
  }

  let nextSp = curSp + direction * magnitude;

  // Register bounds: reflect moves that exceed the allowed span inward.
  const lo = centerSp - params.registerHalfSpanSteps;
  const hi = centerSp + params.registerHalfSpanSteps;
  if (nextSp > hi) nextSp = hi - (nextSp - hi);
  if (nextSp < lo) nextSp = lo + (lo - nextSp);
  nextSp = Math.min(hi, Math.max(lo, nextSp)); // guard against double overshoot

  const { degreeIndex, octave } = stepPosToDegree(nextSp, scaleLen);
  const pitchHz = degreeToHz(scaleCents, tonicHz, degreeIndex, octave);

  // Resting-note weighting: longer dwell + accent on consonant degrees.
  const resting = restingNotes(scaleCents)[degreeIndex];
  const dwellMult = 1 + resting * (params.restingDwell - 1);

  // Glide (meend): occasionally portamento from the previous pitch.
  const glideFromHz =
    state.prevPitchHz != null && rng() < params.glideProbability ? state.prevPitchHz : undefined;

  // Phrase tracking.
  next.phrasePosition = state.phrasePosition + 1;
  if (next.phrasePosition >= state.phraseLength) {
    next.pendingPhraseEnd = true; // the next rest closes the phrase
  }
  const phraseStart = state.phrasePosition === 0;

  next.degreeIndex = degreeIndex;
  next.octave = octave;
  next.prevPitchHz = pitchHz;

  const baseVel = 0.55 + rng() * 0.25;
  const velocity = Math.min(1, baseVel + (phraseStart ? 0.15 : 0) + resting * 0.1);
  const ioiSec = sampleIoi(params, rng);

  return {
    event: {
      kind: "note",
      pitchHz,
      glideFromHz,
      velocity,
      ioiSec,
      durationHint: Math.min(6, ioiSec * dwellMult * 1.5),
      degreeIndex,
      octave,
    },
    state: next,
  };
}

// Convenience for non-test callers that want a fresh seeded generator.
export function makeEngine(seed: number) {
  return { rng: makeRng(seed), state: initState() };
}
