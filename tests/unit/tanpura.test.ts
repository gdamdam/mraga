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

  it("honours a raga's preferred drone degree (Malkauns → ma)", () => {
    // Malkauns tunes the first tanpura string to ma (498c), not Pa.
    const MALKAUNS = [0, 315.64, 498.04, 813.69, 996.09]; // Sa ga ma dha ni
    const c = tanpuraCycle(220, MALKAUNS, 498.04);
    expect(c[0]).toBeCloseTo(220 * Math.pow(2, (498.04 - 1200) / 1200), 6);
    // Sa Sa Sa(low) tail unchanged.
    expect(c[1]).toBe(220);
    expect(c[2]).toBe(220);
    expect(c[3]).toBe(110);
  });

  it("avoids Pa when the raga prefers a non-Pa degree (Marwa)", () => {
    // Marwa drops Pa entirely; its scale has no fifth, so the fallback would
    // reach for the fourth — the preferred degree overrides that.
    const MARWA = [0, 111.73, 386.31, 582.51, 884.36, 1088.27]; // Sa re Ga Ma Dha Ni
    const preferred = 1088.27; // Ni
    const c = tanpuraCycle(220, MARWA, preferred);
    const paLow = 220 * Math.pow(2, (701.96 - 1200) / 1200);
    expect(c[0]).toBeCloseTo(220 * Math.pow(2, (preferred - 1200) / 1200), 6);
    expect(c[0]).not.toBeCloseTo(paLow, 3);
  });

  it("ignores an undefined preferred degree (unchanged fallback)", () => {
    const scale = [0, 200, 400, 500, 700, 900, 1100];
    const withUndef = tanpuraCycle(200, scale, undefined);
    const plain = tanpuraCycle(200, scale);
    expect(withUndef).toEqual(plain);
  });
});
