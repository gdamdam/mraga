import { describe, it, expect } from "vitest";
import { tanpuraCycle } from "../../src/tanpura";

const JUST = [0, 111.73, 203.91, 315.64, 386.31, 498.04, 582.51, 701.96, 813.69, 884.36, 996.09, 1088.27];

describe("tanpuraCycle", () => {
  it("is the classic Pa(low) Sa Sa Sa(low) cycle", () => {
    const c = tanpuraCycle(200, [0, 200, 400, 500, 700, 900, 1100]);
    expect(c).toHaveLength(4);
    const paLow = 200 * Math.pow(2, (700 - 1200) / 1200);
    expect(c[0]).toBeCloseTo(paLow, 6);
    expect(c[1]).toBe(200);
    expect(c[2]).toBe(200);
    expect(c[3]).toBe(100);
  });

  it("uses the tuning's own (just) fifth, not 12-TET", () => {
    const c = tanpuraCycle(240, JUST);
    expect(c[0]).toBeCloseTo(240 * Math.pow(2, (701.96 - 1200) / 1200), 6);
  });

  it("falls back to the fourth when the scale has no fifth", () => {
    const scale = [0, 200, 498, 900];
    const c = tanpuraCycle(200, scale);
    expect(c[0]).toBeCloseTo(200 * Math.pow(2, (498 - 1200) / 1200), 6);
  });

  it("falls back to the low octave when there is no fifth or fourth", () => {
    const c = tanpuraCycle(200, [0, 300, 600]);
    expect(c[0]).toBe(100);
  });
});
