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

describe("taal phraseStart bias pulls phrase launches", () => {
  it("high phraseStart bias launches phrases more often when a launch is pending", () => {
    const base = knobsToParams({ density: 0.5, register: 0.5, restlessness: 0.5, silence: 0.5 }, tonicHz);
    // Isolate phraseStart (all other bias weights neutral) and measure the
    // fraction of launch-pending events that actually start a phrase (a note)
    // instead of breathing (a rest).
    const launchRate = (phraseStart: number) => {
      const p = { ...base, taalBias: { accent: 1, phraseStart, resolution: 1, rest: 1 } };
      const rng = makeRng(42);
      let state = initState();
      let pending = 0, launched = 0;
      for (let i = 0; i < 1500; i++) {
        const launchPending =
          state.pending.length === 0 &&
          (state.pendingPhraseEnd || state.phraseIdx >= state.phrase.length);
        const r = nextEvent(state, scale, tonicHz, p, rng);
        if (launchPending) {
          pending++;
          if (r.event.kind === "note") launched++;
        }
        state = r.state;
      }
      expect(pending).toBeGreaterThan(20);
      return launched / pending;
    };
    expect(launchRate(2)).toBeGreaterThan(launchRate(1));
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

describe("arc ceilingStep clamps the upper register", () => {
  const base = knobsToParams({ density: 0.6, register: 0.5, restlessness: 1.0, silence: 0.1 }, tonicHz);
  const centerSp = hzToNearestStepPos(base.centerPitchHz, scale, tonicHz);

  it("no note exceeds centerStep + ceilingStep", () => {
    const p = { ...base, ceilingStep: 2 };
    const notes = run(p, 13, 600).filter((e) => e.kind === "note") as any[];
    for (const e of notes) {
      const sp = degreeToStepPos(e.degreeIndex, e.octave, scale.length);
      expect(sp).toBeLessThanOrEqual(centerSp + 2);
    }
  });

  // Note: a live clamp reshapes the register, which changes which pitch is chosen
  // and hence (via the engine's melodic-state-dependent branches) the downstream
  // stream — that's expected for a live-only feature. Share-link replay is safe
  // because arc state is NOT serialized in the scene, so ceilingStep is never set
  // during replay; the guarantee that matters is "absent ceilingStep = baseline":
  it("absent ceilingStep reproduces baseline exactly", () => {
    expect(run(base, 13, 300)).toEqual(run({ ...base, ceilingStep: undefined }, 13, 300));
  });
});

describe("immediate pull response (freshPull truncation)", () => {
  it("a newly-tapped pullDegree steers the line within a few notes", () => {
    const p = knobsToParams({ density: 0.9, register: 0.5, restlessness: 0.5, silence: 0.05 }, tonicHz);
    const rng = makeRng(9);
    let state = initState();
    for (let i = 0; i < 20; i++) state = nextEvent(state, scale, tonicHz, p, rng).state;
    const target = 7;
    const pulled = { ...p, pullDegree: target };
    const degs: number[] = [];
    for (let i = 0; i < 16 && degs.length < 10; i++) {
      const r = nextEvent(state, scale, tonicHz, pulled, rng);
      if (r.event.kind === "note") degs.push((r.event as any).degreeIndex);
      state = r.state;
    }
    expect(degs).toContain(target);
  });

  it("pullDegree null keeps the stream identical (seeded replay unaffected)", () => {
    const p = knobsToParams({ density: 0.7, register: 0.5, restlessness: 0.5, silence: 0.2 }, tonicHz);
    expect(run({ ...p, pullDegree: null }, 5, 200)).toEqual(run(p, 5, 200));
  });
});
