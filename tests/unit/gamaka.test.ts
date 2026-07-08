import { describe, it, expect } from "vitest";
import { planGamaka, type GamakaContext, type GamakaRules } from "../../src/gamaka";
import { degreeToHz } from "../../src/tuning";
import { makeRng } from "../../src/rng";

const scale = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100];
const tonicHz = 261.6256;

function ctx(over: Partial<GamakaContext> = {}): GamakaContext {
  const degreeIndex = over.degreeIndex ?? 4;
  const octave = over.octave ?? 0;
  return {
    degreeIndex,
    octave,
    scaleCents: scale,
    tonicHz,
    pitchHz: degreeToHz(scale, tonicHz, degreeIndex, octave),
    prevPitchHz: tonicHz,
    ascending: true,
    isPhraseStart: false,
    restingStrength: 0.5,
    baseIoiSec: 0.5,
    ...over,
  };
}

const always = (kind: keyof GamakaRules, extra: object = {}): GamakaRules =>
  ({ [kind]: { degrees: [4], prob: 1, ...extra } }) as GamakaRules;

describe("planGamaka — disabled / ruleless", () => {
  it("returns an empty plan when disabled", () => {
    const p = planGamaka(ctx(), always("kan"), false, makeRng(1));
    expect(p.kind).toBeNull();
    expect(p.graces).toEqual([]);
    expect(p.tail).toEqual([]);
    expect(p.glideFromHz).toBeUndefined();
  });

  it("returns an empty plan with no rules", () => {
    expect(planGamaka(ctx(), null, true, makeRng(1)).kind).toBeNull();
    expect(planGamaka(ctx(), {}, true, makeRng(1)).kind).toBeNull();
  });

  it("does not fire on a degree not listed in the rule", () => {
    const p = planGamaka(ctx({ degreeIndex: 7 }), always("kan"), true, makeRng(1));
    expect(p.kind).toBeNull();
  });

  it("prob 0 never fires", () => {
    const p = planGamaka(ctx(), { kan: { degrees: [4], prob: 0 } }, true, makeRng(5));
    expect(p.kind).toBeNull();
  });
});

describe("planGamaka — determinism", () => {
  it("same seed + same context => identical plan", () => {
    const a = planGamaka(ctx(), always("murki"), true, makeRng(123));
    const b = planGamaka(ctx(), always("murki"), true, makeRng(123));
    expect(a).toEqual(b);
  });
});

describe("kan — grace approach + direction", () => {
  it("ascending approaches from below (grace pitch < main), main glides off grace", () => {
    const c = ctx({ ascending: true, degreeIndex: 4 });
    const p = planGamaka(c, always("kan"), true, makeRng(1));
    expect(p.kind).toBe("kan");
    expect(p.graces).toHaveLength(1);
    expect(p.graces[0].pitchHz).toBeLessThan(c.pitchHz);
    expect(p.glideFromHz).toBe(p.graces[0].pitchHz);
  });

  it("descending approaches from above (grace pitch > main)", () => {
    const c = ctx({ ascending: false, degreeIndex: 4 });
    const p = planGamaka(c, always("kan"), true, makeRng(1));
    expect(p.kind).toBe("kan");
    expect(p.graces[0].pitchHz).toBeGreaterThan(c.pitchHz);
  });

  it("respects an allowed mask (grace lands on an allowed degree)", () => {
    // Only degrees 0 and 4 allowed: ascending from 4, nearest allowed below is 0.
    const allowed = new Array(12).fill(false);
    allowed[0] = true;
    allowed[4] = true;
    const c = ctx({ ascending: true, degreeIndex: 4, octave: 0 });
    const p = planGamaka(c, always("kan"), true, makeRng(1), allowed);
    expect(p.graces[0].pitchHz).toBeCloseTo(degreeToHz(scale, tonicHz, 0, 0), 3);
  });
});

describe("meend — slide into the note", () => {
  it("sets glideFromHz to the previous pitch, no extra notes", () => {
    const c = ctx({ prevPitchHz: 200 });
    const p = planGamaka(c, always("meend"), true, makeRng(2));
    expect(p.kind).toBe("meend");
    expect(p.glideFromHz).toBe(200);
    expect(p.graces).toEqual([]);
  });

  it("never fires without a previous pitch", () => {
    const p = planGamaka(ctx({ prevPitchHz: null }), always("meend"), true, makeRng(2));
    expect(p.kind).toBeNull();
  });
});

describe("andolan — waver on a held resting note", () => {
  it("emits a tail oscillation only when resting strength is high enough", () => {
    const rules = always("andolan", { cents: 20 });
    expect(planGamaka(ctx({ restingStrength: 0.2 }), rules, true, makeRng(3)).kind).toBeNull();
    const p = planGamaka(ctx({ restingStrength: 0.9 }), rules, true, makeRng(3));
    expect(p.kind).toBe("andolan");
    expect(p.tail.length).toBeGreaterThanOrEqual(2);
  });

  it("wavers within the authored cents bound", () => {
    const c = ctx({ restingStrength: 0.9 });
    const p = planGamaka(c, always("andolan", { cents: 20 }), true, makeRng(3));
    const maxHz = c.pitchHz * Math.pow(2, 20 / 1200);
    for (const n of p.tail) {
      expect(n.pitchHz).toBeGreaterThanOrEqual(c.pitchHz - 1e-6);
      expect(n.pitchHz).toBeLessThanOrEqual(maxHz + 1e-6);
    }
  });
});

describe("pitch bounds", () => {
  it("all micro-note pitches stay positive and near the main note", () => {
    for (const kind of ["kan", "murki", "andolan"] as const) {
      const rules = kind === "andolan" ? always(kind, { cents: 30 }) : always(kind);
      const c = ctx({ restingStrength: 0.9 });
      const p = planGamaka(c, rules, true, makeRng(7));
      for (const n of [...p.graces, ...p.tail]) {
        expect(n.pitchHz).toBeGreaterThan(0);
        // within two octaves of the main note — no runaway pitches
        expect(Math.abs(1200 * Math.log2(n.pitchHz / c.pitchHz))).toBeLessThan(2400);
      }
    }
  });
});
