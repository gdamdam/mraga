import { describe, it, expect } from "vitest";
import { initState, nextEvent, type EngineParams, type NoteEvent } from "../../src/engine";
import { knobsToParams } from "../../src/conducting";
import { ragaMasks, ragaBoost, RAGAS } from "../../src/ragas";
import { makeRng } from "../../src/rng";

const scale = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100];
const tonicHz = 261.6256;

function runNotes(params: EngineParams, seed: number, n: number): NoteEvent[] {
  const rng = makeRng(seed);
  let state = initState();
  const notes: NoteEvent[] = [];
  for (let i = 0; i < n; i++) {
    const r = nextEvent(state, scale, tonicHz, params, rng);
    if (r.event.kind === "note") notes.push(r.event);
    state = r.state;
  }
  return notes;
}

const base = knobsToParams(
  { density: 0.5, register: 0.5, restlessness: 0.4, silence: 0.1, theme: 0.3, focus: 0 },
  tonicHz,
);

describe("raga masks in the engine", () => {
  it("with Malkauns masks every emitted degree is in the raga", () => {
    const m = ragaMasks(RAGAS.malkauns, 12, 0);
    const params: EngineParams = {
      ...base,
      arohaMask: m.aroha,
      avarohaMask: m.avaroha,
      degreeBoost: ragaBoost(RAGAS.malkauns, 12),
    };
    const allowed = new Set([0, 3, 5, 8, 10]);
    const notes = runNotes(params, 42, 600);
    expect(notes.length).toBeGreaterThan(100);
    for (const n of notes) expect(allowed.has(n.degreeIndex)).toBe(true);
  });

  it("vadi/samvadi boost makes the vadi more frequent than without it", () => {
    const m = ragaMasks(RAGAS.malkauns, 12, 0);
    const withBoost: EngineParams = {
      ...base,
      arohaMask: m.aroha,
      avarohaMask: m.avaroha,
      degreeBoost: ragaBoost(RAGAS.malkauns, 12),
    };
    const noBoost: EngineParams = { ...base, arohaMask: m.aroha, avarohaMask: m.avaroha };
    // Average across seeds: a single stream diverges chaotically after the
    // first different resolution target, so one seed is not a fair readout.
    const freq = (params: EngineParams) => {
      let hit = 0;
      let total = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const notes = runNotes(params, seed, 400);
        hit += notes.filter((n) => n.degreeIndex === RAGAS.malkauns.vadi).length;
        total += notes.length;
      }
      return hit / total;
    };
    expect(freq(withBoost)).toBeGreaterThan(freq(noBoost));
  });
});

describe("pakad injection", () => {
  it("pakadProb=1 with repeatProb=0 emits the pakad's degree sequence", () => {
    const params: EngineParams = {
      ...base,
      repeatProb: 0,
      pRest: 0,
      pakadSteps: [0, 2, 4],
      pakadProb: 1,
    };
    const notes = runNotes(params, 11, 3);
    expect(notes.map((n) => n.degreeIndex)).toEqual([0, 2, 4]);
  });
});

describe("conducted pull", () => {
  it("pullDegree makes that degree far more frequent", () => {
    const pulled: EngineParams = { ...base, repeatProb: 0, pullDegree: 7 };
    const free: EngineParams = { ...base, repeatProb: 0 };
    const freq = (params: EngineParams) => {
      const notes = runNotes(params, 21, 600);
      return notes.filter((n) => n.degreeIndex === 7).length / notes.length;
    };
    expect(freq(pulled)).toBeGreaterThan(freq(free) * 1.5);
  });
});
