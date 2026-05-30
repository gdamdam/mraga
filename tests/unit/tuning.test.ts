import { describe, it, expect } from "vitest";
import { degreeToHz, stepPosToDegree, degreeToStepPos, restingNotes, hzToNearestStepPos } from "../../src/tuning";

const equal = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100]; // 12 degrees
const tonicHz = 261.6256; // C4

describe("degreeToHz", () => {
  it("degree 0 octave 0 is the tonic", () => {
    expect(degreeToHz(equal, tonicHz, 0, 0)).toBeCloseTo(tonicHz, 5);
  });
  it("degree 0 octave 1 is one octave up", () => {
    expect(degreeToHz(equal, tonicHz, 0, 1)).toBeCloseTo(tonicHz * 2, 5);
  });
  it("a 700c degree is a tempered fifth above the tonic", () => {
    expect(degreeToHz(equal, tonicHz, 7, 0)).toBeCloseTo(tonicHz * Math.pow(2, 700 / 1200), 5);
  });
});

describe("step-position <-> degree", () => {
  it("round-trips", () => {
    for (const [d, o] of [[0, 0], [7, 0], [3, 1], [11, -1]] as const) {
      const sp = degreeToStepPos(d, o, equal.length);
      expect(stepPosToDegree(sp, equal.length)).toEqual({ degreeIndex: d, octave: o });
    }
  });
  it("wraps degree index across octave boundaries", () => {
    expect(stepPosToDegree(12, 12)).toEqual({ degreeIndex: 0, octave: 1 });
    expect(stepPosToDegree(-1, 12)).toEqual({ degreeIndex: 11, octave: -1 });
  });
});

describe("restingNotes", () => {
  it("flags the tonic (0c) and the ~702c fifth as strongest", () => {
    const just = [0, 111.73, 203.91, 315.64, 386.31, 498.04, 582.51, 701.96, 813.69, 884.36, 996.09, 1088.27];
    const r = restingNotes(just);
    expect(r[0]).toBeGreaterThan(0); // tonic
    expect(r[7]).toBeGreaterThan(0); // fifth
    expect(r[1]).toBe(0); // m2 is not a resting note
    expect(r[0]).toBeGreaterThanOrEqual(r[7]); // tonic at least as strong as fifth
    expect(r[0]).toBeCloseTo(1.0, 5); // spec §4.3: tonic strength
    expect(r[7]).toBeCloseTo(0.8, 5); // spec §4.3: fifth strength
  });
});

describe("hzToNearestStepPos", () => {
  it("maps a frequency back to the closest lattice step", () => {
    const sp = hzToNearestStepPos(tonicHz * 2, equal, tonicHz); // octave up
    expect(stepPosToDegree(sp, equal.length)).toEqual({ degreeIndex: 0, octave: 1 });
  });
  it("throws on non-positive hz", () => {
    expect(() => hzToNearestStepPos(0, equal, tonicHz)).toThrow();
    expect(() => hzToNearestStepPos(-5, equal, tonicHz)).toThrow();
  });
  it("maps a frequency a fifth above the tonic to degree 7 octave 0", () => {
    const sp = hzToNearestStepPos(tonicHz * Math.pow(2, 700 / 1200), equal, tonicHz);
    expect(stepPosToDegree(sp, equal.length)).toEqual({ degreeIndex: 7, octave: 0 });
  });
});
