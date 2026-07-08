import { describe, it, expect } from "vitest";
import {
  TAALS,
  TAAL_IDS,
  getTaal,
  vibhagStarts,
  taalPositionAt,
  taalBias,
} from "../../src/taal";

describe("taal definitions", () => {
  it("every taal's vibhags sum to its matra count", () => {
    for (const t of Object.values(TAALS)) {
      const sum = t.vibhags.reduce((a, b) => a + b, 0);
      expect(sum).toBe(t.matras);
    }
  });

  it("tali/khali beats are in range and disjoint", () => {
    for (const t of Object.values(TAALS)) {
      for (const b of [...t.taliBeats, ...t.khaliBeats]) {
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(t.matras);
      }
      // a matra cannot be both clap and wave
      for (const b of t.taliBeats) expect(t.khaliBeats).not.toContain(b);
    }
  });

  it("has the expected canonical structures", () => {
    expect(TAALS.teental.matras).toBe(16);
    expect(TAALS.teental.khaliBeats).toEqual([8]); // classic khali on beat 9
    expect(TAALS.jhaptal.matras).toBe(10);
    expect(TAALS.jhaptal.vibhags).toEqual([2, 3, 2, 3]);
    expect(TAALS.rupak.matras).toBe(7);
    expect(TAALS.rupak.samIsKhali).toBe(true); // rupak opens on the wave
    expect(TAALS.ektaal.matras).toBe(12);
  });

  it("getTaal resolves ids, treats off/null as no taal", () => {
    expect(getTaal("teental")?.label).toBe("Teental");
    expect(getTaal("off")).toBeNull();
    expect(getTaal(null)).toBeNull();
    expect(getTaal(undefined)).toBeNull();
    expect(TAAL_IDS[0]).toBe("off");
  });
});

describe("vibhagStarts", () => {
  it("teental starts every 4 matras", () => {
    expect(vibhagStarts(TAALS.teental)).toEqual([0, 4, 8, 12]);
  });
  it("jhaptal starts at 0,2,5,7", () => {
    expect(vibhagStarts(TAALS.jhaptal)).toEqual([0, 2, 5, 7]);
  });
});

describe("taalPositionAt", () => {
  it("matra 0 is sam", () => {
    const p = taalPositionAt(TAALS.teental, 0);
    expect(p.isSam).toBe(true);
    expect(p.isTali).toBe(true);
    expect(p.vibhagIndex).toBe(0);
  });

  it("wraps cyclically and handles negatives", () => {
    expect(taalPositionAt(TAALS.teental, 16).matra).toBe(0);
    expect(taalPositionAt(TAALS.teental, 17).matra).toBe(1);
    expect(taalPositionAt(TAALS.teental, -1).matra).toBe(15);
    expect(taalPositionAt(TAALS.teental, 32.9).matra).toBe(0);
  });

  it("identifies khali in teental (matra 8) and jhaptal (matra 5)", () => {
    expect(taalPositionAt(TAALS.teental, 8).isKhali).toBe(true);
    expect(taalPositionAt(TAALS.teental, 8).isSam).toBe(false);
    expect(taalPositionAt(TAALS.jhaptal, 5).isKhali).toBe(true);
  });

  it("computes vibhag index and matra-in-vibhag for jhaptal", () => {
    // jhaptal vibhags [2,3,2,3] start at [0,2,5,7]
    const p = taalPositionAt(TAALS.jhaptal, 6); // in vibhag 2 (start 5)
    expect(p.vibhagIndex).toBe(2);
    expect(p.matraInVibhag).toBe(1);
    expect(p.isVibhagStart).toBe(false);
  });
});

describe("taalBias", () => {
  it("sam has the strongest resolution pull and lowest rest", () => {
    const sam = taalBias(taalPositionAt(TAALS.teental, 0));
    const interior = taalBias(taalPositionAt(TAALS.teental, 1));
    expect(sam.resolution).toBeGreaterThan(interior.resolution);
    expect(sam.rest).toBeLessThan(interior.rest);
    expect(sam.accent).toBeGreaterThan(1);
  });

  it("khali favours rest / breathing", () => {
    const khali = taalBias(taalPositionAt(TAALS.teental, 8));
    expect(khali.rest).toBeGreaterThan(1);
  });

  it("all weights are non-negative and finite", () => {
    for (const t of Object.values(TAALS)) {
      for (let m = 0; m < t.matras; m++) {
        const b = taalBias(taalPositionAt(t, m));
        for (const w of [b.accent, b.phraseStart, b.resolution, b.rest]) {
          expect(Number.isFinite(w)).toBe(true);
          expect(w).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
