import { describe, it, expect } from "vitest";
import { TAALS } from "../../src/taal";
import {
  thekaTickAt,
  thekaCycle,
  THEKA_SAM_VELOCITY,
  THEKA_TALI_VELOCITY,
} from "../../src/theka";

describe("theka stroke decision", () => {
  it("sam gets the strongest stroke", () => {
    const t = thekaTickAt(TAALS.teental, 0);
    expect(t.play).toBe(true);
    expect(t.accent).toBe("sam");
    expect(t.velocity).toBe(THEKA_SAM_VELOCITY);
    // sam is strictly louder than a tali stroke
    expect(t.velocity).toBeGreaterThan(THEKA_TALI_VELOCITY);
  });

  it("a tali (clap) beat gets a normal stroke", () => {
    const t = thekaTickAt(TAALS.teental, 4); // teental tali
    expect(t.play).toBe(true);
    expect(t.accent).toBe("tali");
    expect(t.velocity).toBe(THEKA_TALI_VELOCITY);
  });

  it("a khali (wave) beat is silent", () => {
    const t = thekaTickAt(TAALS.teental, 8); // teental khali
    expect(t.play).toBe(false);
    expect(t.velocity).toBe(0);
    expect(t.accent).toBe("none");
  });

  it("an interior matra (neither sam/tali/khali) is silent", () => {
    const t = thekaTickAt(TAALS.teental, 5);
    expect(t.play).toBe(false);
    expect(t.velocity).toBe(0);
  });

  it("positions between beats do not spuriously tick", () => {
    for (const frac of [0.25, 0.5, 0.75, 3.5, 11.9]) {
      const t = thekaTickAt(TAALS.teental, frac);
      expect(t.play).toBe(false);
      expect(t.velocity).toBe(0);
    }
  });

  it("normalizes beats outside one cycle (wraps mod matras)", () => {
    // beat 16 === matra 0 === sam for teental (16 matras)
    expect(thekaTickAt(TAALS.teental, 16)).toEqual(thekaTickAt(TAALS.teental, 0));
    // negative beats wrap too
    expect(thekaTickAt(TAALS.teental, -12)).toEqual(thekaTickAt(TAALS.teental, 4));
  });

  it("sam sounds strongest even in rupak where the sam is a khali", () => {
    // rupak: khaliBeats=[0], samIsKhali — the downbeat still gets the loud stroke.
    const t = thekaTickAt(TAALS.rupak, 0);
    expect(t.play).toBe(true);
    expect(t.accent).toBe("sam");
    expect(t.velocity).toBe(THEKA_SAM_VELOCITY);
  });
});

describe("theka cycle patterns", () => {
  // Expected sounding matras per taal: sam + tali, minus any khali, minus interior.
  const cases: { taal: keyof typeof TAALS; sounding: number[] }[] = [
    { taal: "teental", sounding: [0, 4, 12] }, // khali 8 silent
    { taal: "jhaptal", sounding: [0, 2, 7] }, // khali 5 silent
    { taal: "rupak", sounding: [0, 3, 5] }, // sam(0) sounds despite being khali
    { taal: "ektaal", sounding: [0, 4, 8, 10] }, // khali 2,6 silent
  ];

  for (const { taal, sounding } of cases) {
    it(`${taal} strokes exactly on ${sounding.join(", ")}`, () => {
      const cycle = thekaCycle(TAALS[taal]);
      const played = cycle.map((t, i) => (t.play ? i : -1)).filter((i) => i >= 0);
      expect(played).toEqual(sounding);
    });

    it(`${taal} khali beats are all silent`, () => {
      for (const k of TAALS[taal].khaliBeats) {
        if (k === 0) continue; // sam-khali (rupak) is the deliberate exception
        expect(thekaTickAt(TAALS[taal], k).play).toBe(false);
      }
    });

    it(`${taal} sam is the loudest stroke in the cycle`, () => {
      const cycle = thekaCycle(TAALS[taal]);
      const maxVel = Math.max(...cycle.map((t) => t.velocity));
      expect(cycle[0].velocity).toBe(maxVel);
      expect(cycle[0].accent).toBe("sam");
    });
  }
});
