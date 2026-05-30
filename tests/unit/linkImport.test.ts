import { describe, it, expect } from "vitest";
import { importTuningFromUrl, sceneToTuning, DEFAULT_TUNING } from "../../src/linkImport";
import { encodeScene } from "../../src/shareCodec";

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
