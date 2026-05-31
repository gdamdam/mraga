import { describe, it, expect } from "vitest";
import { hzToMidi } from "../../src/midi";

describe("hzToMidi", () => {
  it("A4 = 440Hz -> note 69, centre bend 8192", () => {
    expect(hzToMidi(440)).toEqual({ note: 69, bend: 8192 });
  });

  it("C4 -> note 60, centre bend", () => {
    const r = hzToMidi(261.6256);
    expect(r.note).toBe(60);
    expect(r.bend).toBe(8192);
  });

  it("+40 cents stays on the note and bends up", () => {
    const hz = 440 * Math.pow(2, 0.4 / 12); // A4 + 40 cents (unambiguous nearest note)
    const r = hzToMidi(hz);
    expect(r.note).toBe(69);
    expect(r.bend).toBe(8192 + Math.round((40 / 200) * 8192));
  });

  it("-40 cents bends down symmetrically", () => {
    const hz = 440 * Math.pow(2, -0.4 / 12);
    const r = hzToMidi(hz);
    expect(r.note).toBe(69);
    expect(r.bend).toBe(8192 - Math.round((40 / 200) * 8192));
  });

  it("bend stays within 14-bit range", () => {
    for (const hz of [20, 80, 440, 2000, 8000]) {
      const { bend } = hzToMidi(hz);
      expect(bend).toBeGreaterThanOrEqual(0);
      expect(bend).toBeLessThanOrEqual(16383);
    }
  });
});
