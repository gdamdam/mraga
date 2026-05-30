import { describe, it, expect } from "vitest";
import { VOICE_IDS, VOICE_LABELS, VOICE_PRESETS, getPreset } from "../../src/voicePresets";

describe("voicePresets", () => {
  it("has all six flavours, ordered", () => {
    expect(VOICE_IDS).toEqual(["santoor", "koto", "sitar", "mallet", "qanun", "kalimba"]);
  });

  it("every id has a label and a preset", () => {
    for (const id of VOICE_IDS) {
      expect(typeof VOICE_LABELS[id]).toBe("string");
      expect(VOICE_PRESETS[id]).toBeDefined();
    }
  });

  it("every preset is within the safe KS parameter ranges", () => {
    for (const id of VOICE_IDS) {
      const p = VOICE_PRESETS[id];
      expect(p.brightness).toBeGreaterThanOrEqual(0);
      expect(p.brightness).toBeLessThanOrEqual(1);
      expect(p.jawari).toBeGreaterThanOrEqual(0);
      expect(p.jawari).toBeLessThanOrEqual(1);
      // damping must stay below 0.5 for KS loop stability, and be a real filter
      expect(p.damping).toBeGreaterThan(0.49);
      expect(p.damping).toBeLessThan(0.5);
      // per-sample gain decay must be < 1 (so the voice actually decays)
      expect(p.decay).toBeGreaterThan(0.999);
      expect(p.decay).toBeLessThan(1);
    }
  });

  it("santoor preserves the MVP baseline character", () => {
    expect(VOICE_PRESETS.santoor).toEqual({
      brightness: 1.0,
      damping: 0.4975,
      decay: 0.99995,
      jawari: 0,
    });
  });

  it("getPreset falls back to santoor for an unknown id", () => {
    expect(getPreset("nope")).toEqual(VOICE_PRESETS.santoor);
    expect(getPreset("koto")).toEqual(VOICE_PRESETS.koto);
  });
});
