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

describe("weak-degree resting attenuation", () => {
  it("degreeAttenuate makes the line resolve onto that degree less often", () => {
    // Target Pa (degree 7): a strong intrinsic resting note that sits AWAY from
    // the register center, so the measured drop reflects the resting-strength
    // damping rather than being masked by positional gravity toward center.
    // (Attenuating degree 0/Sa — the center — is dominated by that gravity and
    // wouldn't isolate the effect.)
    const DEG = 7;
    const freqDeg = (params: EngineParams) => {
      let hit = 0;
      let total = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const notes = runNotes(params, seed, 400);
        hit += notes.filter((n) => n.degreeIndex === DEG).length;
        total += notes.length;
      }
      return hit / total;
    };
    const attenuated: EngineParams = { ...base, repeatProb: 0, degreeAttenuate: [DEG] };
    const plain: EngineParams = { ...base, repeatProb: 0 };
    expect(freqDeg(attenuated)).toBeLessThan(freqDeg(plain));
  });
});

describe("pakad register fit", () => {
  it("transposes the whole pakad as a block — never reflects onto out-of-raga degrees", () => {
    const pakad = [0, 2, 4, 5, 7];
    const set = new Set(pakad.map((p) => ((p % 12) + 12) % 12));
    // Sweep the register across octaves; every pakad note must keep its degree.
    for (let oct = -2; oct <= 2; oct++) {
      const params: EngineParams = {
        ...base,
        repeatProb: 0,
        pRest: 0,
        registerHalfSpanSteps: 12, // wide enough that a whole-octave fit exists
        centerPitchHz: tonicHz * Math.pow(2, oct),
        pakadSteps: pakad,
        pakadProb: 1,
      };
      for (const n of runNotes(params, 5, 80)) {
        expect(set.has(n.degreeIndex)).toBe(true);
      }
    }
  });
});

describe("FOCUS palette follows consonance (not a hardcoded pentatonic)", () => {
  it("focus=1 with no raga masks keeps fifth/fourth (5,7), not major-pentatonic 2 & 9", () => {
    // In 12-EDO the strongest resting notes are Sa/Pa/Ma/Ga (0,7,5,4) plus one
    // filler (1); the old code hardcoded a diatonic pentatonic incl. 2 & 9.
    const params: EngineParams = { ...base, focus: 1, repeatProb: 0 };
    const degs = new Set(runNotes(params, 7, 800).map((n) => n.degreeIndex));
    for (const d of degs) expect([0, 1, 4, 5, 7]).toContain(d);
    expect(degs.has(2)).toBe(false);
    expect(degs.has(9)).toBe(false);
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
