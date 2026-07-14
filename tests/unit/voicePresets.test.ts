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

  it("santoor preserves the MVP baseline core params", () => {
    // The four core KS params still define the MVP santoor timbre; extended
    // fields add physical realism on top without changing this baseline.
    const p = VOICE_PRESETS.santoor;
    expect(p.brightness).toBe(1.0);
    expect(p.damping).toBe(0.4975);
    expect(p.decay).toBe(0.99995);
    expect(p.jawari).toBe(0);
  });

  it("every preset carries valid extended timbre fields", () => {
    for (const id of VOICE_IDS) {
      const p = VOICE_PRESETS[id];
      expect(p.courseDetune).toBeGreaterThanOrEqual(0);
      expect(p.courseCount).toBeGreaterThanOrEqual(1);
      expect(p.courseCount).toBeLessThanOrEqual(4);
      expect(p.pickPos).toBeGreaterThanOrEqual(0);
      expect(p.pickPos).toBeLessThanOrEqual(1);
      expect(p.velTrack).toBeGreaterThanOrEqual(0);
      expect(p.velTrack).toBeLessThanOrEqual(1);
      expect(p.tarafSend).toBeGreaterThanOrEqual(0);
      expect(p.tarafSend).toBeLessThanOrEqual(1);
      expect(Array.isArray(p.body)).toBe(true);
      for (const r of p.body) {
        expect(r.freq).toBeGreaterThan(0);
        expect(r.q).toBeGreaterThan(0);
        expect(r.gain).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("mallet and kalimba keep the taraf bank off (percussive, no sympathy)", () => {
    expect(VOICE_PRESETS.mallet.tarafSend).toBe(0);
    expect(VOICE_PRESETS.kalimba.tarafSend).toBe(0);
  });

  it("zeroing the extended fields yields a preset the engine treats as the old sound", () => {
    // Documents the A/B-safety contract: extended fields zeroed/empty == the
    // original single-string timbre (the DSP no-ops each stage).
    const baseline = { ...VOICE_PRESETS.santoor, courseDetune: 0, courseCount: 1, pickPos: 0, velTrack: 0, tarafSend: 0, body: [] };
    expect(baseline.courseDetune).toBe(0);
    expect(baseline.body).toEqual([]);
  });

  it("getPreset falls back to santoor for an unknown id", () => {
    expect(getPreset("nope")).toEqual(VOICE_PRESETS.santoor);
    expect(getPreset("koto")).toEqual(VOICE_PRESETS.koto);
  });
});
