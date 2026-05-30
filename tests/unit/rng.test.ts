import { describe, it, expect } from "vitest";
import { makeRng, gaussian } from "../../src/rng";

describe("makeRng", () => {
  it("is deterministic for a fixed seed", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces values in [0,1)", () => {
    const r = makeRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("different seeds diverge", () => {
    expect(makeRng(1)()).not.toEqual(makeRng(2)());
  });

  it("seed=0 produces valid output in [0,1)", () => {
    const r = makeRng(0);
    const v = r();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});

describe("gaussian", () => {
  it("is roughly zero-mean over many samples", () => {
    const r = makeRng(7);
    let sum = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) sum += gaussian(r);
    expect(Math.abs(sum / n)).toBeLessThan(0.05);
  });
});
