import { describe, it, expect } from "vitest";
import { knobsToParams } from "../../src/conducting";

const tonicHz = 261.6256;
const base = { density: 0.5, register: 0.5, restlessness: 0.5, silence: 0.5 };

describe("knobsToParams", () => {
  it("DENSITY: higher density => lower mean IOI (busier)", () => {
    const sparse = knobsToParams({ ...base, density: 0 }, tonicHz);
    const busy = knobsToParams({ ...base, density: 1 }, tonicHz);
    expect(sparse.meanIoiSec).toBeGreaterThan(busy.meanIoiSec);
    expect(sparse.meanIoiSec).toBeCloseTo(4.0, 5);
    expect(busy.meanIoiSec).toBeCloseTo(0.4, 5);
  });

  it("REGISTER: higher register => higher center pitch", () => {
    const lo = knobsToParams({ ...base, register: 0 }, tonicHz);
    const hi = knobsToParams({ ...base, register: 1 }, tonicHz);
    expect(hi.centerPitchHz).toBeGreaterThan(lo.centerPitchHz);
    expect(lo.centerPitchHz).toBeCloseTo(tonicHz, 5);
    expect(hi.centerPitchHz).toBeCloseTo(tonicHz * 4, 5);
  });

  it("RESTLESSNESS: higher => more leaps & variance, weaker gravity & dwell", () => {
    const calm = knobsToParams({ ...base, restlessness: 0 }, tonicHz);
    const roam = knobsToParams({ ...base, restlessness: 1 }, tonicHz);
    expect(roam.leapProbability).toBeGreaterThan(calm.leapProbability);
    expect(roam.stepVariance).toBeGreaterThan(calm.stepVariance);
    expect(roam.tonicGravity).toBeLessThan(calm.tonicGravity);
    expect(roam.restingDwell).toBeLessThan(calm.restingDwell);
  });

  it("SILENCE: higher => more rests, longer phrase pauses", () => {
    const full = knobsToParams({ ...base, silence: 0 }, tonicHz);
    const spacious = knobsToParams({ ...base, silence: 1 }, tonicHz);
    expect(spacious.pRest).toBeGreaterThan(full.pRest);
    expect(spacious.phrasePauseFactor).toBeGreaterThan(full.phrasePauseFactor);
  });

  it("clamps knob values outside 0..1", () => {
    const p = knobsToParams({ density: 2, register: -1, restlessness: 5, silence: -3 }, tonicHz);
    expect(p.meanIoiSec).toBeCloseTo(0.4, 5); // density clamped to 1
    expect(p.centerPitchHz).toBeCloseTo(tonicHz, 5); // register clamped to 0
  });
});
