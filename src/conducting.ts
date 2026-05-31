import type { EngineParams } from "./engine";

export type Knobs = {
  density: number;
  register: number;
  restlessness: number;
  silence: number;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function knobsToParams(knobs: Knobs, tonicHz: number): EngineParams {
  const density = clamp01(knobs.density);
  const register = clamp01(knobs.register);
  const restless = clamp01(knobs.restlessness);
  const silence = clamp01(knobs.silence);

  return {
    // DENSITY: steady pulse unit, 4.0s (sparse) -> 0.4s (busy), log interp.
    baseIoiSec: 4.0 * Math.pow(0.4 / 4.0, density),
    // RESTLESSNESS: timing humanise (≈0 = dead steady) and rhythmic variety.
    ioiJitter: lerp(0.02, 0.35, restless),
    longNoteProb: lerp(0.35, 0.12, restless),
    // REGISTER: centre pitch from tonic (0) to two octaves up (1).
    centerPitchHz: tonicHz * Math.pow(2, register * 2),
    registerHalfSpanSteps: 7,
    // RESTLESSNESS: low = clean directed contour, strong gravity/dwell;
    // high = loose, more leaps, weaker pull.
    contourStrength: lerp(0.92, 0.45, restless),
    leapProbability: lerp(0.04, 0.35, restless),
    tonicGravity: lerp(0.9, 0.2, restless),
    restingDwell: lerp(2.5, 1.0, restless),
    // RESTLESSNESS: low = strong motif repetition (melodic); high = fresh/wandering.
    repeatProb: lerp(0.6, 0.15, restless),
    // SILENCE: rest probability + phrase-pause length.
    pRest: lerp(0.05, 0.45, silence),
    phrasePauseFactor: lerp(1.5, 4.0, silence),
    // Idiomatic glide, always on at a tasteful default.
    glideProbability: 0.12,
  };
}
