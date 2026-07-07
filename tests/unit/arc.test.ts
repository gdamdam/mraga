import { describe, it, expect } from "vitest";
import { arcKnobs, arcPhaseAt, ARC_DURATIONS_MIN } from "../../src/arc";

describe("performance arc", () => {
  it("phases: alap → jor → jhala", () => {
    expect(arcPhaseAt(0)).toBe("alap");
    expect(arcPhaseAt(0.3)).toBe("alap");
    expect(arcPhaseAt(0.5)).toBe("jor");
    expect(arcPhaseAt(0.8)).toBe("jhala");
    expect(arcPhaseAt(1)).toBe("jhala");
  });

  it("starts sparse/spacious and ends dense/tight", () => {
    const start = arcKnobs(0);
    const end = arcKnobs(1);
    expect(start.density).toBeLessThan(0.15);
    expect(start.silence).toBeGreaterThan(0.4);
    expect(end.density).toBeGreaterThan(0.9);
    expect(end.rhythm).toBeGreaterThan(0.9);
    expect(end.silence).toBeLessThan(0.1);
  });

  it("density rises monotonically across the arc", () => {
    let prev = -1;
    for (let t = 0; t <= 1.001; t += 0.05) {
      const d = arcKnobs(t).density;
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });

  it("clamps t outside 0..1", () => {
    expect(arcKnobs(-1)).toEqual(arcKnobs(0));
    expect(arcKnobs(2)).toEqual(arcKnobs(1));
  });

  it("all knob values stay in 0..1 everywhere", () => {
    for (let t = 0; t <= 1.001; t += 0.01) {
      for (const v of Object.values(arcKnobs(t))) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("offers sensible durations", () => {
    expect(ARC_DURATIONS_MIN).toEqual([6, 12, 24]);
  });
});
