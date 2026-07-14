import { describe, it, expect } from "vitest";
// The KS DSP lives in a plain worklet source (no exports — it's concatenated
// into the AudioWorklet bundle). It's self-contained, so we eval the source and
// smoke-test the new stages (courses, pick comb, body biquad, taraf coupling)
// without a Web Audio context. Loaded via Vite's `?raw` import so no node:fs /
// @types/node is needed (the repo intentionally has neither).
import src from "../../src/engine/voices/shared.js?raw";

const M: any = new Function(src + "\nreturn { KSVoice, KSString, Biquad };")();
const { KSVoice, KSString, Biquad } = M;

const SR = 44100;
const render = (v: any, n: number) => {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(v.render());
  return out;
};
const finite = (xs: number[]) => xs.every((x) => Number.isFinite(x));
// Base (zeroed) extended params == the original single-string sound.
const base = {
  brightness: 1.0, damping: 0.4975, decay: 0.99995, jawari: 0,
  courseDetune: 0, courseCount: 1, pickPos: 0, velTrack: 0, tarafSend: 0, body: [],
};

describe("KSVoice courses / comb / velocity", () => {
  it("courseDetune=0 stays a single ringing string (old behavior)", () => {
    const v = new KSVoice(SR);
    v.setParams(base);
    v.pluck(220, 0.8);
    expect(v._nActive).toBe(1);
    expect(finite(render(v, 4096))).toBe(true);
  });

  it("a 3-string detuned course stays finite and grows the string pool", () => {
    const v = new KSVoice(SR);
    v.setParams({ ...base, courseDetune: 6, courseCount: 3 });
    v.pluck(220, 0.8);
    expect(v._nActive).toBe(3);
    expect(v.strings.length).toBeGreaterThanOrEqual(3);
    expect(finite(render(v, 8192))).toBe(true);
    // Bending the course keeps every string finite (each keeps its detune ratio).
    v.bend(196, 0.1);
    expect(finite(render(v, 8192))).toBe(true);
  });

  it("pick-position comb keeps the burst finite and bounded", () => {
    const v = new KSVoice(SR);
    v.setParams({ ...base, pickPos: 0.25 });
    v.pluck(330, 1.0);
    const out = render(v, 4096);
    expect(finite(out)).toBe(true);
    expect(Math.max(...out.map(Math.abs))).toBeLessThan(2);
  });

  it("velTrack darkens soft strikes without breaking hard ones", () => {
    // Both remain finite; the coupling only reshapes the excitation lowpass.
    const soft = new KSVoice(SR); soft.setParams({ ...base, velTrack: 0.6 });
    soft.pluck(220, 0.1);
    const hard = new KSVoice(SR); hard.setParams({ ...base, velTrack: 0.6 });
    hard.pluck(220, 1.0);
    expect(finite(render(soft, 2048))).toBe(true);
    expect(finite(render(hard, 2048))).toBe(true);
  });
});

describe("Biquad body resonance", () => {
  it("bandpass is stable (finite, bounded) on an impulse", () => {
    const bq = new Biquad();
    bq.setBandpass(SR, 1600, 5);
    const out: number[] = [];
    out.push(bq.process(1));
    for (let i = 0; i < 8192; i++) out.push(bq.process(0));
    expect(finite(out)).toBe(true);
    expect(Math.max(...out.map(Math.abs))).toBeLessThan(2);
  });
});

describe("KSString taraf (sympathetic) coupling", () => {
  it("an undamped tuned string rings from injection alone, no pluck", () => {
    const s = new KSString(SR);
    s.tune(330);
    // Drive it with a short noise burst via inject, then let it ring.
    const out: number[] = [];
    for (let i = 0; i < 64; i++) out.push(s.render(0.4995, 0.5, (Math.random() * 2 - 1) * 0.05));
    for (let i = 0; i < 8192; i++) out.push(s.render(0.4995, 0.5, 0));
    expect(finite(out)).toBe(true);
    expect(Math.max(...out.map(Math.abs))).toBeLessThan(2);
    // It actually resonates (non-silent tail well after the drive stops).
    const tail = out.slice(-2048).reduce((a, x) => a + x * x, 0);
    expect(tail).toBeGreaterThan(0);
  });

  it("inject defaults to a no-op: render(damp,bright) == render(damp,bright,0)", () => {
    const a = new KSString(SR); a.tune(220);
    const b = new KSString(SR); b.tune(220);
    // Prime both identically so state matches, then compare a driveless step.
    for (let i = 0; i < 10; i++) { a.render(0.4995, 0.5, 0.1); b.render(0.4995, 0.5, 0.1); }
    expect(a.render(0.4995, 0.5)).toBeCloseTo(b.render(0.4995, 0.5, 0), 12);
  });
});
