import { describe, it, expect } from "vitest";
import { upsertPreset, deletePreset, type Preset } from "../../src/presets";
import type { MragaScene } from "../../src/mragaScene";

const scene = (seed: number): MragaScene => ({
  v: 1,
  knobs: { density: 0.5, register: 0.5, restlessness: 0.2, silence: 0.25, rhythm: 0.8, theme: 0.55, focus: 0.5 },
  voice: "santoor",
  octave: -1,
  volume: 0.8,
  timing: "free",
  bpm: 80,
  theme: "saffron",
  seed,
  tuning: { tonicHz: 261.63, scaleCents: [0, 200, 400, 700, 900], label: "C" },
});

describe("presets", () => {
  it("upsert adds a new preset, sorted by name", () => {
    let list: Preset[] = [];
    list = upsertPreset(list, "Beta", scene(1));
    list = upsertPreset(list, "Alpha", scene(2));
    expect(list.map((p) => p.name)).toEqual(["Alpha", "Beta"]);
  });

  it("upsert replaces an existing preset of the same name", () => {
    let list = upsertPreset([], "X", scene(1));
    list = upsertPreset(list, "X", scene(99));
    expect(list).toHaveLength(1);
    expect(list[0].scene.seed).toBe(99);
  });

  it("delete removes by name", () => {
    let list = upsertPreset(upsertPreset([], "A", scene(1)), "B", scene(2));
    list = deletePreset(list, "A");
    expect(list.map((p) => p.name)).toEqual(["B"]);
  });
});
