import { describe, it, expect } from "vitest";
import { arcKnobs, arcPhaseAt, arcCeilingStep, ARC_DURATIONS_MIN } from "../../src/arc";

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

describe("arc register ceiling", () => {
  const HALF = 7; // default registerHalfSpanSteps

  it("alap starts ~a fifth above center (below full span)", () => {
    const c0 = arcCeilingStep(0, HALF);
    expect(c0).toBeGreaterThan(0);
    expect(c0).toBeLessThan(HALF); // register is not yet fully open
    // ~0.6 of the half-span ("a fifth up")
    expect(c0).toBe(Math.floor(0.6 * HALF));
  });

  it("opens to the full span by the jor phase and stays open", () => {
    expect(arcCeilingStep(0.42, HALF)).toBe(HALF); // JOR_AT
    expect(arcCeilingStep(0.6, HALF)).toBe(HALF);
    expect(arcCeilingStep(1, HALF)).toBe(HALF);
  });

  it("is monotonic non-decreasing across the arc", () => {
    let prev = -1;
    for (let t = 0; t <= 1.001; t += 0.02) {
      const c = arcCeilingStep(t, HALF);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it("clamps t outside 0..1", () => {
    expect(arcCeilingStep(-1, HALF)).toBe(arcCeilingStep(0, HALF));
    expect(arcCeilingStep(2, HALF)).toBe(arcCeilingStep(1, HALF));
  });

  it("no-op semantics: never exceeds the half-span (>= means don't clamp)", () => {
    for (let t = 0; t <= 1.001; t += 0.05) {
      expect(arcCeilingStep(t, HALF)).toBeLessThanOrEqual(HALF);
    }
    // At/after jor the offset equals the half-span, so the engine clamp is a no-op.
    expect(arcCeilingStep(1, HALF)).toBe(HALF);
  });

  it("small spans still open up to the full span by jor", () => {
    // A 1-step half-span: starts restricted (0) and opens to the full span.
    expect(arcCeilingStep(0, 1)).toBeLessThanOrEqual(1);
    expect(arcCeilingStep(0.42, 1)).toBe(1);
    expect(arcCeilingStep(1, 1)).toBe(1);
  });
});
