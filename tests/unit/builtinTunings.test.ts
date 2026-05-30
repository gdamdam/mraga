import { describe, it, expect } from "vitest";
import { BUILTIN_TUNINGS, getBuiltinDegrees } from "../../src/builtinTunings";

describe("builtin tunings", () => {
  it("equal temperament is 13 degrees, 0..1200 in 100c steps", () => {
    expect(BUILTIN_TUNINGS.equal.degrees).toEqual([
      0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200,
    ]);
  });

  it("every table has 13 ascending degrees starting at 0 ending at 1200", () => {
    for (const t of Object.values(BUILTIN_TUNINGS)) {
      expect(t.degrees).toHaveLength(13);
      expect(t.degrees[0]).toBe(0);
      expect(t.degrees[12]).toBe(1200);
      for (let i = 1; i < t.degrees.length; i++) {
        expect(t.degrees[i]).toBeGreaterThan(t.degrees[i - 1]);
      }
    }
  });

  it("getBuiltinDegrees falls back to equal for unknown ids", () => {
    expect(getBuiltinDegrees("nope")).toEqual(BUILTIN_TUNINGS.equal.degrees);
  });

  it("just5 has a ~702c fifth", () => {
    expect(getBuiltinDegrees("just5")[7]).toBeCloseTo(701.96, 2);
  });
});
