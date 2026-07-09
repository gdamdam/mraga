import { describe, it, expect } from "vitest";
import { importTuningFromUrl, sceneToTuning, DEFAULT_TUNING } from "../../src/linkImport";
import { encodeScene } from "../../src/shareCodec";
import { degreeToHz } from "../../src/tuning";

describe("sceneToTuning", () => {
  it("computes tonicHz from root + octave (A4=440)", () => {
    const t = sceneToTuning({ drone: { root: "A", octave: 4, tuningId: "equal" } });
    expect(t.tonicHz).toBeCloseTo(440, 5);
    const c4 = sceneToTuning({ drone: { root: "C", octave: 4, tuningId: "equal" } });
    expect(c4.tonicHz).toBeCloseTo(261.6256, 3);
  });

  it("builds 12-degree scaleCents from a builtin tuningId (drops the 1200 octave)", () => {
    const t = sceneToTuning({ drone: { root: "C", octave: 4, tuningId: "just5" } });
    expect(t.scaleCents).toHaveLength(12);
    expect(t.scaleCents[0]).toBe(0);
    expect(t.scaleCents[7]).toBeCloseTo(701.96, 2);
    expect(t.scaleCents).not.toContain(1200);
  });

  it("prefers customTuning.degrees when present", () => {
    const degrees = [0, 90, 190, 290, 390, 490, 590, 690, 790, 890, 990, 1090, 1200];
    const t = sceneToTuning({
      drone: { root: "C", octave: 4, tuningId: "custom:foo" },
      customTuning: { id: "custom:foo", label: "Foo", degrees },
    });
    expect(t.scaleCents).toEqual(degrees.slice(0, 12));
    expect(t.label).toContain("Foo");
  });

  it("imports a non-12 custom tuning at full length (no slice(0,12) truncation)", () => {
    // 19 sounding degrees (19-EDO) + a trailing 1200¢ period = 20 entries.
    const degrees = [
      0, 63.16, 126.32, 189.47, 252.63, 315.79, 378.95, 442.11, 505.26, 568.42,
      631.58, 694.74, 757.89, 821.05, 884.21, 947.37, 1010.53, 1073.68, 1136.84, 1200,
    ];
    const t = sceneToTuning({
      drone: { root: "C", octave: 4, tuningId: "custom:19edo" },
      customTuning: { id: "custom:19edo", label: "19-EDO", degrees },
    });
    // Full scale survives: 19 degrees, not silently truncated to 12.
    expect(t.scaleCents).toHaveLength(19);
    expect(t.scaleCents).toEqual(degrees.slice(0, -1));
    expect(t.scaleCents[18]).toBeCloseTo(1136.84, 2);
    expect(t.label).toContain("19-EDO");
  });

  it("plays a non-12 OCTAVE tuning carried by an mdrone share link (round-trip)", async () => {
    // 17 sounding degrees spanning >1 octave, closed by a redundant 1200
    // period. The octave lattice reproduces the 1200, so it is dropped.
    const degrees = [
      0, 70.6, 141.2, 211.8, 282.4, 352.9, 423.5, 494.1, 564.7, 635.3,
      705.9, 776.5, 847.1, 917.6, 988.2, 1058.8, 1129.4, 1200,
    ];
    const scene = {
      version: 1,
      name: "x",
      drone: { root: "C", octave: 4, tuningId: "custom:17" },
      customTuning: { id: "custom:17", label: "17-TET wide", degrees },
    };
    const { key, value } = await encodeScene(scene);
    const url = `https://app.mdrone.org/?${key}=${encodeURIComponent(value)}`;
    const t = await importTuningFromUrl(url);
    expect(t.scaleCents).toHaveLength(degrees.length - 1); // trailing 1200 dropped
    expect(t.scaleCents.length).toBeGreaterThan(12);
    expect(t.period).toBe(1200);
    expect(t.label).not.toContain("non-octave");
  });

  it("preserves a NON-OCTAVE period (Bohlen-Pierce) and labels the octave mapping (§2-A)", () => {
    // Bohlen-Pierce repeats at the tritave 3/1 = 1901.955¢. mdrone's legacy
    // degrees array carries the period as its trailing entry.
    const tritave = 1901.955;
    const degrees = [
      0, 133.238, 301.847, 435.084, 546.815, 736.931, 848.663,
      1017.272, 1150.510, 1319.119, 1466.871, 1600.108, tritave,
    ];
    const t = sceneToTuning({
      drone: { root: "A", octave: 4, tuningId: "custom:bp" },
      customTuning: { id: "custom:bp", label: "Bohlen-Pierce", degrees },
    });
    // Period preserved, NOT coerced to 1200; the trailing tritave is a real
    // pitch the octave lattice never reaches, so it is kept as a sounding degree.
    expect(t.period).toBeCloseTo(tritave, 3);
    expect(t.scaleCents).toEqual(degrees);
    expect(t.scaleCents[0]).toBe(0);
    // §2-A: the non-octave nature is surfaced, not silently mapped.
    expect(t.label).toContain("non-octave: octave mapping");
  });

  it("resolves a non-octave register at its real period, not re-stacked at 1200 (§1)", () => {
    const tritave = 1901.955;
    const degrees = [0, 133.238, 301.847, 435.084, 546.815, 736.931, tritave];
    const t = sceneToTuning({
      drone: { root: "A", octave: 4, tuningId: "custom:bp" },
      customTuning: { id: "custom:bp", label: "BP", degrees },
    });
    // Resolving degree 0 one register up uses the real tritave period when the
    // period-aware resolver is given `t.period` — the drone stays beat-locked
    // to 3/1, not a 2/1 octave.
    const withPeriod = degreeToHz(t.scaleCents, t.tonicHz, 0, 1, t.period);
    const reStacked = degreeToHz(t.scaleCents, t.tonicHz, 0, 1); // legacy octave path
    expect(withPeriod).toBeCloseTo(t.tonicHz * Math.pow(2, tritave / 1200), 4);
    expect(reStacked).toBeCloseTo(t.tonicHz * 2, 4);
    expect(withPeriod).not.toBeCloseTo(reStacked, 1);
  });

  it("falls back to DEFAULT_TUNING for an unparseable scene", () => {
    expect(sceneToTuning(null)).toEqual(DEFAULT_TUNING);
    expect(sceneToTuning({ drone: { root: "ZZ", octave: 99 } })).toEqual(
      expect.objectContaining({ scaleCents: DEFAULT_TUNING.scaleCents }),
    );
  });
});

describe("importTuningFromUrl", () => {
  it("round-trips a scene encoded as a ?z= link", async () => {
    const scene = { version: 1, name: "x", drone: { root: "D", octave: 3, tuningId: "maqam-rast" } };
    const { key, value } = await encodeScene(scene);
    const url = `https://app.mdrone.org/?${key}=${encodeURIComponent(value)}`;
    const t = await importTuningFromUrl(url);
    expect(t.tonicHz).toBeCloseTo(146.832, 2); // D3
    expect(t.scaleCents[3]).toBe(350); // maqam-rast raised 3rd
    expect(t.label).toContain("D");
  });

  it("never throws on garbage input — returns the default", async () => {
    const t = await importTuningFromUrl("not a url");
    expect(t).toEqual(DEFAULT_TUNING);
  });
});
