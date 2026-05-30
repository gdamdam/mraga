// src/conducting.ts
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
    // DENSITY: log interpolation between 4.0s (sparse) and 0.4s (busy).
    meanIoiSec: 4.0 * Math.pow(0.4 / 4.0, density),
    ioiJitter: 0.3,
    // REGISTER: center pitch from tonic (0) to two octaves up (1).
    centerPitchHz: tonicHz * Math.pow(2, register * 2),
    registerHalfSpanSteps: 7,
    // RESTLESSNESS.
    stepVariance: lerp(0.3, 2.0, restless),
    leapProbability: lerp(0.05, 0.4, restless),
    tonicGravity: lerp(0.9, 0.1, restless),
    restingDwell: lerp(3.0, 1.0, restless),
    // SILENCE.
    pRest: lerp(0.05, 0.5, silence),
    phrasePauseFactor: lerp(1.5, 4.0, silence),
    // Idiomatic touch, always on at a tasteful default.
    glideProbability: 0.15,
  };
}
