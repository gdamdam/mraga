import { describe, it, expect } from "vitest";
import { RAGAS, RAGA_IDS, getRaga, ragaMasks, ragaBoost } from "../../src/ragas";

describe("raga definitions", () => {
  it("every raga is well-formed (degrees 0..11, pakad ≥ 2 notes, Sa in both directions)", () => {
    for (const id of RAGA_IDS) {
      const r = RAGAS[id];
      expect(r.id).toBe(id);
      for (const d of [...r.aroha, ...r.avaroha]) {
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThan(12);
      }
      expect(r.aroha).toContain(0);
      expect(r.avaroha).toContain(0);
      expect(r.pakad.length).toBeGreaterThanOrEqual(2);
      expect(r.vadi).not.toBe(r.samvadi);
    }
  });

  it("getRaga resolves ids and rejects unknowns", () => {
    expect(getRaga("yaman")?.label).toBe("Yaman");
    expect(getRaga("nope")).toBeNull();
    expect(getRaga(null)).toBeNull();
  });
});

describe("ragaMasks", () => {
  it("focus=0 keeps exactly the raga's degree sets (plus Sa)", () => {
    const m = ragaMasks(RAGAS.malkauns, 12, 0);
    const on = (mask: boolean[]) => mask.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    expect(on(m.aroha)).toEqual([0, 3, 5, 8, 10]);
    expect(on(m.avaroha)).toEqual([0, 3, 5, 8, 10]);
  });

  it("aroha and avaroha differ for Desh (dual Ni)", () => {
    const m = ragaMasks(RAGAS.desh, 12, 0);
    expect(m.aroha[11]).toBe(true);  // shuddha Ni ascending
    expect(m.aroha[10]).toBe(false);
    expect(m.avaroha[10]).toBe(true); // komal ni descending
    expect(m.avaroha[11]).toBe(false);
  });

  it("focus=1 trims to ≤5 degrees but always keeps Sa, vadi, samvadi", () => {
    const r = RAGAS.yaman;
    const m = ragaMasks(r, 12, 1);
    const count = m.avaroha.filter(Boolean).length;
    expect(count).toBeLessThanOrEqual(5);
    expect(m.avaroha[0]).toBe(true);
    expect(m.avaroha[r.vadi]).toBe(true);
    expect(m.avaroha[r.samvadi]).toBe(true);
  });

  it("Sa is always allowed even if a mask set omitted it", () => {
    const fake = { ...RAGAS.yaman, aroha: [2, 4] };
    const m = ragaMasks(fake, 12, 0);
    expect(m.aroha[0]).toBe(true);
  });
});

describe("ragaBoost", () => {
  it("boosts vadi 0.9 and samvadi 0.7, zero elsewhere", () => {
    const b = ragaBoost(RAGAS.bhairav, 12);
    expect(b[8]).toBe(0.9);
    expect(b[1]).toBe(0.7);
    expect(b[0]).toBe(0);
    expect(b.length).toBe(12);
  });
});
