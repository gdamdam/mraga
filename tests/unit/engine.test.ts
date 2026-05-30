import { describe, it, expect } from "vitest";
import { initState, nextEvent, type EngineParams } from "../../src/engine";
import { knobsToParams } from "../../src/conducting";
import { makeRng } from "../../src/rng";
import { hzToNearestStepPos, degreeToStepPos } from "../../src/tuning";

const scale = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100];
const tonicHz = 261.6256;

function run(params: EngineParams, seed: number, n: number) {
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

const mid = knobsToParams({ density: 0.5, register: 0.5, restlessness: 0.5, silence: 0.5 }, tonicHz);

describe("engine determinism", () => {
  it("same seed => identical event stream", () => {
    expect(run(mid, 123, 50)).toEqual(run(mid, 123, 50));
  });
  it("different seeds diverge", () => {
    expect(run(mid, 1, 50)).not.toEqual(run(mid, 2, 50));
  });
});

describe("SILENCE raises the rest fraction", () => {
  it("more rests at high silence than low", () => {
    const lo = knobsToParams({ density: 0.5, register: 0.5, restlessness: 0.5, silence: 0.05 }, tonicHz);
    const hi = knobsToParams({ density: 0.5, register: 0.5, restlessness: 0.5, silence: 0.95 }, tonicHz);
    const frac = (p: EngineParams) =>
      run(p, 5, 400).filter((e) => e.kind === "rest").length / 400;
    expect(frac(hi)).toBeGreaterThan(frac(lo));
  });
});

describe("DENSITY changes mean IOI", () => {
  it("busy has a smaller mean IOI than sparse", () => {
    const sparse = knobsToParams({ density: 0.1, register: 0.5, restlessness: 0.5, silence: 0.2 }, tonicHz);
    const busy = knobsToParams({ density: 0.9, register: 0.5, restlessness: 0.5, silence: 0.2 }, tonicHz);
    const meanIoi = (p: EngineParams) => {
      const es = run(p, 9, 400);
      return es.reduce((s, e) => s + e.ioiSec, 0) / es.length;
    };
    expect(meanIoi(busy)).toBeLessThan(meanIoi(sparse));
  });
});

describe("RESTLESSNESS widens step-size variance", () => {
  it("roaming has larger mean absolute step than calm", () => {
    const calm = knobsToParams({ density: 0.5, register: 0.5, restlessness: 0.0, silence: 0.0 }, tonicHz);
    const roam = knobsToParams({ density: 0.5, register: 0.5, restlessness: 1.0, silence: 0.0 }, tonicHz);
    const meanStep = (p: EngineParams) => {
      const notes = run(p, 11, 500).filter((e) => e.kind === "note") as any[];
      let total = 0, count = 0;
      for (let i = 1; i < notes.length; i++) {
        const a = degreeToStepPos(notes[i - 1].degreeIndex, notes[i - 1].octave, scale.length);
        const b = degreeToStepPos(notes[i].degreeIndex, notes[i].octave, scale.length);
        total += Math.abs(b - a); count++;
      }
      return total / count;
    };
    expect(meanStep(roam)).toBeGreaterThan(meanStep(calm));
  });
});

describe("register bounds are respected", () => {
  it("all notes stay within the allowed span around the center", () => {
    const p = knobsToParams({ density: 0.6, register: 0.5, restlessness: 1.0, silence: 0.1 }, tonicHz);
    const centerSp = hzToNearestStepPos(p.centerPitchHz, scale, tonicHz);
    const notes = run(p, 13, 600).filter((e) => e.kind === "note") as any[];
    for (const e of notes) {
      const sp = degreeToStepPos(e.degreeIndex, e.octave, scale.length);
      expect(Math.abs(sp - centerSp)).toBeLessThanOrEqual(p.registerHalfSpanSteps);
    }
  });
});

describe("tonic gravity returns the line home", () => {
  it("with strong gravity, the average position drifts toward center", () => {
    const p = knobsToParams({ density: 0.8, register: 0.5, restlessness: 0.0, silence: 0.0 }, tonicHz);
    const centerSp = hzToNearestStepPos(p.centerPitchHz, scale, tonicHz);
    // Start far above center.
    const rng = makeRng(21);
    let state = initState();
    state.octave = 3; state.degreeIndex = 0; // high
    const positions: number[] = [];
    for (let i = 0; i < 400; i++) {
      const r = nextEvent(state, scale, tonicHz, p, rng);
      if (r.event.kind === "note") {
        positions.push(degreeToStepPos((r.event as any).degreeIndex, (r.event as any).octave, scale.length));
      }
      state = r.state;
    }
    const tail = positions.slice(-100);
    const meanTail = tail.reduce((s, x) => s + x, 0) / tail.length;
    expect(Math.abs(meanTail - centerSp)).toBeLessThan(p.registerHalfSpanSteps);
  });
});

describe("phrases breathe", () => {
  it("emits phrase-end rests", () => {
    const p = knobsToParams({ density: 0.7, register: 0.5, restlessness: 0.4, silence: 0.5 }, tonicHz);
    const rests = run(p, 33, 600).filter((e) => e.kind === "rest") as any[];
    expect(rests.some((r) => r.phraseEnd)).toBe(true);
  });
});

describe("phrases resolve onto resting notes", () => {
  it("the note before a phrase-end rest is usually a resting degree", () => {
    const p = knobsToParams({ density: 0.7, register: 0.5, restlessness: 0.3, silence: 0.5 }, tonicHz);
    const restingStrength = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100]
      .map((c) => {
        // tonic(0), fourth(~500), fifth(~700) are resting in equal temperament within tolerance
        return c === 0 || Math.abs(c - 498) <= 35 || Math.abs(c - 702) <= 35 || Math.abs(c - 386) <= 35 ? 1 : 0;
      });
    const rng = makeRng(77);
    let state = initState();
    let prevNote: any = null;
    let restingEndings = 0;
    let totalEndings = 0;
    for (let i = 0; i < 1500; i++) {
      const r = nextEvent(state, scale, tonicHz, p, rng);
      if (r.event.kind === "rest" && (r.event as any).phraseEnd && prevNote) {
        totalEndings++;
        if (restingStrength[prevNote.degreeIndex] > 0) restingEndings++;
      }
      if (r.event.kind === "note") prevNote = r.event;
      state = r.state;
    }
    expect(totalEndings).toBeGreaterThan(5);
    expect(restingEndings / totalEndings).toBeGreaterThan(0.5);
  });
});
