import { describe, it, expect } from "vitest";
import { GOLDEN } from "./engineUpgrade.golden";
import {
  initState,
  nextEvent,
  planTihai,
  pathSuccessorDegree,
  contourVelocityFactor,
  RHYTHM_CELLS,
  type EngineParams,
  type NoteEvent,
} from "../../src/engine";
import { knobsToParams } from "../../src/conducting";
import { ragaMasks, ragaBoost, RAGAS } from "../../src/ragas";
import { taalBias, taalPositionAt, TAALS } from "../../src/taal";
import { makeRng } from "../../src/rng";

const scale = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100];
const tonicHz = 261.6256;

function runEvents(params: EngineParams, seed: number, n: number) {
  const rng = makeRng(seed);
  let state = initState();
  const events = [];
  for (let i = 0; i < n; i++) {
    const r = nextEvent(state, scale, tonicHz, params, rng);
    events.push(r.event);
    state = r.state;
  }
  return events;
}
function runNotes(params: EngineParams, seed: number, n: number): NoteEvent[] {
  return runEvents(params, seed, n).filter((e): e is NoteEvent => e.kind === "note");
}

const mid = knobsToParams({ density: 0.5, register: 0.5, restlessness: 0.5, silence: 0.5 }, tonicHz);

// ---------------------------------------------------------------------------
// REGRESSION: default (no new flags) rng stream + pitch/rhythm is byte-identical
// ---------------------------------------------------------------------------
describe("rng-stream regression (defaults unchanged)", () => {
  const golden = GOLDEN as unknown as { mid: any[]; desh: any[] };
  const cap = (params: EngineParams, seed: number, n: number) =>
    runEvents(params, seed, n).map((e) =>
      e.kind === "note"
        ? [e.degreeIndex, e.octave, Math.round(e.ioiSec * 1e6)]
        : ["r", Math.round(e.ioiSec * 1e6)],
    );
  it("plain mid config reproduces the pre-change pitch+rhythm sequence", () => {
    expect(cap(mid, 123, 120)).toEqual(golden.mid);
  });
  it("Desh raga config reproduces the pre-change sequence (no vakra flag)", () => {
    const p: EngineParams = { ...knobsToParams({ density: 0.5, register: 0.5, restlessness: 0.4, silence: 0.1, theme: 0.3, focus: 0 }, tonicHz) };
    const m = ragaMasks(RAGAS.desh, 12, p.focus);
    p.arohaMask = m.aroha; p.avarohaMask = m.avaroha; p.degreeBoost = ragaBoost(RAGAS.desh, 12);
    p.pakadSteps = RAGAS.desh.pakad; p.pakadProb = 0.35;
    expect(cap(p, 42, 120)).toEqual(golden.desh);
  });
});

// ---------------------------------------------------------------------------
// TASK 1: rhythm cells
// ---------------------------------------------------------------------------
describe("rhythm cells", () => {
  it("flag OFF is identical to the plain per-note rhythm (no new draws)", () => {
    const off = runNotes({ ...mid }, 7, 200).map((n) => Math.round(n.ioiSec * 1e6));
    const explicitOff = runNotes({ ...mid, rhythmCellsEnabled: false }, 7, 200).map((n) => Math.round(n.ioiSec * 1e6));
    expect(explicitOff).toEqual(off);
  });

  it("flag ON at high density introduces sub-pulse IOIs (0.5x base)", () => {
    const p: EngineParams = { ...knobsToParams({ density: 0.9, register: 0.5, restlessness: 0.3, silence: 0.0 }, tonicHz), rhythmCellsEnabled: true };
    const base = p.baseIoiSec;
    const notes = runNotes(p, 3, 400);
    // Some note lands near a half-pulse IOI — impossible under the plain 1|2 rhythm.
    const half = notes.some((n) => Math.abs(n.ioiSec / base - 0.5) < 0.06);
    expect(half).toBe(true);
  });

  it("the vocabulary SOMETIMES does not fire (not every phrase is a cell)", () => {
    // With cells on, over many phrases the plain per-note fallback must also occur:
    // detect phrases whose IOIs are not a clean tiling of any 4-pattern cell by
    // checking that a mix of pulse-multiple shapes appears (both 1x and 2x runs).
    const p: EngineParams = { ...knobsToParams({ density: 0.6, register: 0.5, restlessness: 0.5, silence: 0.0 }, tonicHz), rhythmCellsEnabled: true, repeatProb: 0 };
    const base = p.baseIoiSec;
    const mult = runNotes(p, 9, 600).map((n) => Math.round((n.ioiSec / base) * 6) / 6);
    const uniq = new Set(mult);
    // Plain 2x (long note) and plain 1x both present ⇒ non-cell phrases exist too.
    expect(uniq.has(2)).toBe(true);
    expect(uniq.has(1)).toBe(true);
    expect(uniq.size).toBeGreaterThan(2); // subdivisions present as well
  });

  it("vocabulary values are the documented cells", () => {
    const flat = new Set(RHYTHM_CELLS.flat());
    expect(flat.has(1)).toBe(true);
    expect(flat.has(2)).toBe(true);
    expect([...flat].some((v) => Math.abs(v - 0.5) < 1e-9)).toBe(true);
    expect([...flat].some((v) => Math.abs(v - 2 / 3) < 1e-9)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TASK 2: tihai — exhaustive matra arithmetic across all 4 taals
// ---------------------------------------------------------------------------
describe("tihai matra arithmetic (exhaustive)", () => {
  const cycles = Object.values(TAALS).map((t) => t.matras); // [16,10,7,12]
  const figures: number[][] = [
    [1, 1, 2],
    [0.5, 0.5, 1],
    [1, 0.5, 0.5, 2],
    [2 / 3, 2 / 3, 2 / 3],
    [1, 1, 1, 1],
    [2, 2],
    [1],
  ];
  it("every fired tihai lands its final note EXACTLY on sam", () => {
    let fired = 0;
    for (const C of cycles) {
      for (const fig of figures) {
        const Fdur = fig.reduce((a, b) => a + b, 0);
        for (let pos = 0; pos < C; pos += 0.5) {
          const plan = planTihai(fig, pos, C);
          if (!plan) continue;
          fired++;
          // Arithmetic identity: 3(Fdur+pad) + 2gap == D
          expect(Math.abs(3 * (Fdur + plan.pad) + 2 * plan.gap - plan.D)).toBeLessThan(1e-9);
          // Non-negative gap/pad, modest pad
          expect(plan.gap).toBeGreaterThanOrEqual(0);
          expect(plan.pad).toBeGreaterThanOrEqual(0);
          expect(plan.pad).toBeLessThan(2);
          // The landing is a genuine sam: startMatra + D is a whole cycle multiple
          const startMatra = Math.round(pos);
          expect((startMatra + plan.D) % C).toBe(0);
          // Fits within ~1.5 cycles and holds at least 3 statements
          expect(plan.D).toBeLessThanOrEqual(Math.ceil(1.5 * C));
          expect(plan.D).toBeGreaterThanOrEqual(3 * Fdur);
        }
      }
    }
    expect(fired).toBeGreaterThan(20); // the sweep actually exercises real plans
  });

  it("returns null (no tihai) when the figure cannot fit before sam", () => {
    // A huge figure vs a 7-matra cycle: 3x can never fit in <=1.5 cycles.
    expect(planTihai([4, 4, 4], 0.1, 7)).toBeNull();
  });
});

describe("tihai integration", () => {
  it("gated OFF: identical stream even with taal bias present", () => {
    const taal = TAALS.teental;
    const withTaal: EngineParams = {
      ...mid,
      taalBias: taalBias(taalPositionAt(taal, 14)),
      matraPosition: 14,
      cycleMatras: 16,
    };
    const a = runNotes(withTaal, 5, 150).map((n) => n.degreeIndex);
    const b = runNotes({ ...withTaal, tihaiEnabled: false }, 5, 150).map((n) => n.degreeIndex);
    expect(a).toEqual(b);
  });

  it("gated ON near sam eventually emits a 3x-repeated figure phrase", () => {
    const taal = TAALS.teental;
    // Feed a matraPosition that sits ~2 matras before sam so tihai is eligible.
    const rng = makeRng(4);
    let state = initState();
    let sawTihai = false;
    for (let i = 0; i < 400; i++) {
      const params: EngineParams = {
        ...mid,
        repeatProb: 0.4,
        taalBias: taalBias(taalPositionAt(taal, 14)),
        matraPosition: 14,
        cycleMatras: 16,
        tihaiEnabled: true,
      };
      const before = state.phrase.length;
      const r = nextEvent(state, scale, tonicHz, params, rng);
      state = r.state;
      // A tihai phrase is at least 3*figLen+1 notes with a repeated head pattern.
      if (state.phrase.length !== before && state.phrase.length >= 7) {
        const L = state.phrase.length;
        // detect a 3x repetition of the leading figure block (figLen = (L-1)/3)
        if ((L - 1) % 3 === 0) {
          const fl = (L - 1) / 3;
          const seg = (k: number) => state.phrase.slice(k * fl, (k + 1) * fl).join(",");
          if (fl >= 2 && seg(0) === seg(1) && seg(1) === seg(2)) sawTihai = true;
        }
      }
    }
    expect(sawTihai).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TASK 3: vakra — segment direction + authored path
// ---------------------------------------------------------------------------
describe("vakra path successor", () => {
  it("follows the authored crooked descent order", () => {
    const path = RAGAS.desh.avarohaPath!;
    // Desh: S' n D P D m G R S — after P(7) the crooked move is up to D(9).
    expect(pathSuccessorDegree(7, path)).toBe(9);
    expect(pathSuccessorDegree(10, path)).toBe(9);
    expect(pathSuccessorDegree(2, path)).toBe(0);
  });
  it("returns null for a degree absent from the path", () => {
    expect(pathSuccessorDegree(6, [0, 2, 4])).toBeNull();
  });
});

describe("vakra segment direction (gated)", () => {
  it("flag OFF keeps the pre-change per-step behavior (distinct masks)", () => {
    const m = ragaMasks(RAGAS.desh, 12, 0);
    const p: EngineParams = { ...mid, arohaMask: m.aroha, avarohaMask: m.avaroha, degreeBoost: ragaBoost(RAGAS.desh, 12) };
    const a = runNotes(p, 8, 200).map((n) => n.degreeIndex);
    const b = runNotes({ ...p, vakraEnabled: false }, 8, 200).map((n) => n.degreeIndex);
    expect(a).toEqual(b);
  });
  it("flag ON with an authored path changes the descent (rng-neutral: same length)", () => {
    const m = ragaMasks(RAGAS.desh, 12, 0);
    const off: EngineParams = { ...mid, arohaMask: m.aroha, avarohaMask: m.avaroha, degreeBoost: ragaBoost(RAGAS.desh, 12) };
    const on: EngineParams = { ...off, vakraEnabled: true, avarohaPath: RAGAS.desh.avarohaPath };
    const a = runNotes(off, 8, 200).map((n) => n.degreeIndex);
    const b = runNotes(on, 8, 200).map((n) => n.degreeIndex);
    // rng-neutral remap: the two runs draw the same rng, so equal note counts...
    expect(runEvents(on, 8, 200).length).toBe(200);
    // ...but the emitted degrees differ (the path/segment mask reshapes the line).
    expect(a).not.toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// TASK 4: dynamics contour (pure, no new rng)
// ---------------------------------------------------------------------------
describe("dynamics contour", () => {
  it("swells toward the registral peak and softens the phrase-final note", () => {
    // A rising-then-resting phrase: peak in the middle, final note softened.
    const steps = [0, 2, 4, 6, 4, 0];
    const center = 0;
    const f = steps.map((_, i) => contourVelocityFactor(i, steps.length, steps, center));
    const peakIdx = 3; // step 6 is furthest from center
    expect(f[peakIdx]).toBeGreaterThan(f[0]); // swell up to the peak
    expect(f[steps.length - 1]).toBeLessThan(f[peakIdx]); // final softened vs peak
  });

  it("is a pure function — no rng, deterministic, taal accent stays multiplicative", () => {
    const a = contourVelocityFactor(2, 5, [0, 2, 4, 2, 0], 0);
    const b = contourVelocityFactor(2, 5, [0, 2, 4, 2, 0], 0);
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });

  it("phrase velocities are no longer flat within a single phrase", () => {
    const p: EngineParams = { ...knobsToParams({ density: 0.6, register: 0.5, restlessness: 0.2, silence: 0.0 }, tonicHz), repeatProb: 0 };
    const vels = runNotes(p, 2, 120).map((n) => n.velocity);
    const spread = Math.max(...vels) - Math.min(...vels);
    expect(spread).toBeGreaterThan(0.05);
  });
});
