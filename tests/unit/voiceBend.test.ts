import { describe, it, expect } from "vitest";
// KSVoice lives in a plain worklet source (no exports — it's concatenated into
// the AudioWorklet bundle). It's self-contained (sampleRate is a ctor arg), so
// we eval the source here to smoke-test the DSP without a Web Audio context.
// Load it via Vite's `?raw` import (typed by vite/client) so the test needs no
// node:fs / @types/node — the repo intentionally has neither.
import src from "../../src/engine/voices/shared.js?raw";

const KSVoice: any = new Function(src + "\nreturn KSVoice;")();

const SR = 44100;
const render = (v: any, n: number) => {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(v.render());
  return out;
};
const allFinite = (xs: number[]) => xs.every((x) => Number.isFinite(x));

describe("KSVoice.bend", () => {
  it("stays finite (no NaN/Inf) bending up and down", () => {
    const v = new KSVoice(SR);
    v.pluck(220, 0.8);
    expect(allFinite(render(v, 256))).toBe(true);
    v.bend(196, 0.2); // ~whole step down (longer delay -> buffer must grow)
    expect(allFinite(render(v, 4096))).toBe(true);
    v.bend(330, 0.1); // up
    expect(allFinite(render(v, 4096))).toBe(true);
  });

  it("retargets the delay length to the new pitch", () => {
    const v = new KSVoice(SR);
    v.pluck(220, 0.8);
    v.bend(110, 0.05); // octave down
    // curLen glides toward targetLen == sr/freq over the given time.
    expect(v.targetLen).toBeCloseTo(SR / 110, 3);
    render(v, Math.round(SR * 0.05) + 16);
    expect(v.curLen).toBeCloseTo(SR / 110, 0);
  });

  it("grows the delay line for a lower target without a click", () => {
    const v = new KSVoice(SR);
    v.pluck(440, 0.8); // small buffer (~102 samples)
    const before = v.buf.length;
    v.bend(110, 0.1); // two octaves down needs a much longer delay
    expect(v.buf.length).toBeGreaterThan(before);
    // First rendered sample after the grow must not jump (state preserved).
    const first = v.render();
    expect(Number.isFinite(first)).toBe(true);
    expect(Math.abs(first)).toBeLessThan(1);
  });

  it("adds no excitation: bend never raises gain and no-ops when silent", () => {
    const v = new KSVoice(SR);
    v.pluck(220, 0.8);
    render(v, 1000); // let gain decay below the initial velocity
    const gainBefore = v.gain;
    v.bend(210, 0.1);
    expect(v.gain).toBeLessThanOrEqual(gainBefore); // no re-pluck spike

    // A bend on an idle voice does nothing (no phantom note appears).
    const idle = new KSVoice(SR);
    idle.bend(300, 0.1);
    expect(idle.active).toBe(false);
    expect(idle.render()).toBe(0);
  });
});
