import { describe, it, expect } from "vitest";
import { initState, nextEvent, type EngineParams, type EngineEvent } from "../../src/engine";
import { knobsToParams } from "../../src/conducting";
import { makeRng } from "../../src/rng";
import type { GamakaRules } from "../../src/gamaka";
import type { TaalBias } from "../../src/taal";

const scale = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100];
const tonicHz = 261.6256;

const base = knobsToParams(
  { density: 0.6, register: 0.5, restlessness: 0.3, silence: 0.1, theme: 0.2, focus: 0 },
  tonicHz,
);

function run(params: EngineParams, seed: number, n: number): EngineEvent[] {
  const rng = makeRng(seed);
  let state = initState();
  const events: EngineEvent[] = [];
  for (let i = 0; i < n; i++) {
    const r = nextEvent(state, scale, tonicHz, params, rng);
    events.push(r.event);
    state = r.state;
  }
  return events;
}

type Note = Extract<EngineEvent, { kind: "note" }>;
const notes = (evs: EngineEvent[]) => evs.filter((e): e is Note => e.kind === "note");
const noteHz = (evs: EngineEvent[]) => notes(evs).map((e) => e.pitchHz);

describe("gamaka in the engine — disabled == backward compatible", () => {
  const rules: GamakaRules = { kan: { degrees: [4], prob: 1 }, andolan: { degrees: [0], cents: 20, prob: 1 } };

  it("gamakaEnabled=false consumes no rng (identical to no gamaka)", () => {
    const off = run({ ...base }, 7, 300);
    const explicitOff = run({ ...base, gamaka: rules, gamakaEnabled: false }, 7, 300);
    expect(noteHz(explicitOff)).toEqual(noteHz(off));
  });
});

describe("gamaka in the engine — enabled", () => {
  const rules: GamakaRules = { kan: { degrees: [4], prob: 1 } };
  const params: EngineParams = { ...base, gamaka: rules, gamakaEnabled: true };

  it("is deterministic given a seed", () => {
    expect(noteHz(run(params, 11, 200))).toEqual(noteHz(run(params, 11, 200)));
  });

  it("introduces grace-length micro-notes the base engine never produces", () => {
    // Grace notes carry a very short IOI (<0.15s); the un-ornamented line's
    // base pulse here is ~1s, so short-IOI notes are the ornament signature.
    const short = (evs: EngineEvent[]) => notes(evs).filter((e) => e.ioiSec < 0.15).length;
    expect(short(run(params, 11, 200))).toBeGreaterThan(0);
    expect(short(run({ ...base, gamaka: rules, gamakaEnabled: false }, 11, 200))).toBe(0);
  });

  it("all emitted pitches stay finite and positive", () => {
    for (const hz of noteHz(run(params, 3, 300))) {
      expect(Number.isFinite(hz)).toBe(true);
      expect(hz).toBeGreaterThan(0);
    }
  });
});

describe("taal bias in the engine", () => {
  it("a rest-heavy bias (khali) yields more rests than a rest-suppressing bias (sam)", () => {
    const khali: TaalBias = { accent: 0.8, phraseStart: 0.7, resolution: 0.7, rest: 1.6 };
    const sam: TaalBias = { accent: 1.35, phraseStart: 1, resolution: 2.2, rest: 0.4 };
    const restCount = (bias: TaalBias) =>
      run({ ...base, taalBias: bias }, 5, 500).filter((e) => e.kind === "rest").length;
    expect(restCount(khali)).toBeGreaterThan(restCount(sam));
  });

  it("is deterministic and leaves pitches finite", () => {
    const sam: TaalBias = { accent: 1.35, phraseStart: 1, resolution: 2.2, rest: 0.4 };
    const a = noteHz(run({ ...base, taalBias: sam }, 9, 200));
    const b = noteHz(run({ ...base, taalBias: sam }, 9, 200));
    expect(a).toEqual(b);
    for (const hz of a) expect(Number.isFinite(hz)).toBe(true);
  });

  it("no taalBias reproduces the un-biased stream exactly", () => {
    expect(noteHz(run({ ...base, taalBias: null }, 42, 300))).toEqual(noteHz(run({ ...base }, 42, 300)));
  });
});
