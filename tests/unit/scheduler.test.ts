import { describe, it, expect } from "vitest";
import { Scheduler } from "../../src/scheduler";

describe("Scheduler", () => {
  it("fires due events as the clock advances and never schedules in the past", () => {
    let now = 0;
    const fired: { time: number; freq: number }[] = [];
    // Engine stub: a steady stream of notes 0.5s apart.
    const engine = {
      next: () => ({
        event: { kind: "note" as const, pitchHz: 220, velocity: 0.7, ioiSec: 0.5, durationHint: 1, degreeIndex: 0, octave: 0 },
      }),
    };
    const sched = new Scheduler({
      now: () => now,
      lookaheadSec: 0.1,
      pull: () => engine.next().event,
      onNote: (e, time) => fired.push({ time, freq: e.pitchHz }),
      onRest: () => {},
    });
    sched.start();
    // Advance the clock in 25ms ticks for 1 second.
    for (let i = 0; i < 40; i++) {
      now += 0.025;
      sched.tick();
    }
    expect(fired.length).toBeGreaterThanOrEqual(1);
    // All scheduled times are >= the now at which they were scheduled.
    for (const f of fired) expect(f.time).toBeGreaterThanOrEqual(0);
    // Times are monotonically increasing and ~0.5s apart.
    for (let i = 1; i < fired.length; i++) {
      expect(fired[i].time).toBeGreaterThan(fired[i - 1].time);
      expect(fired[i].time - fired[i - 1].time).toBeCloseTo(0.5, 5);
    }
  });

  it("stops firing after stop()", () => {
    let now = 0;
    let count = 0;
    const sched = new Scheduler({
      now: () => now,
      lookaheadSec: 0.1,
      pull: () => ({ kind: "note" as const, pitchHz: 220, velocity: 0.7, ioiSec: 0.3, durationHint: 1, degreeIndex: 0, octave: 0 }),
      onNote: () => { count++; },
      onRest: () => {},
    });
    sched.start();
    now += 0.05; sched.tick();
    const after = count;
    sched.stop();
    now += 1; sched.tick();
    expect(count).toBe(after);
  });

  it("quantizes note onsets to the grid, strictly increasing (monotonic guard)", () => {
    let now = 0;
    const grid = 0.25;
    const q = (t: number) => Math.ceil(t / grid - 1e-9) * grid;
    const fired: number[] = [];
    const sched = new Scheduler({
      now: () => now,
      lookaheadSec: 0.1,
      // notes every 0.1s (denser than the grid → forces collisions)
      pull: () => ({ kind: "note", pitchHz: 220, velocity: 0.7, ioiSec: 0.1, durationHint: 1, degreeIndex: 0, octave: 0 }),
      onNote: (_e, time) => fired.push(time),
      onRest: () => {},
      quantize: q,
    });
    sched.start();
    for (let i = 0; i < 60; i++) { now += 0.025; sched.tick(); }
    expect(fired.length).toBeGreaterThan(3);
    for (const t of fired) expect(Math.abs(t / grid - Math.round(t / grid))).toBeLessThan(1e-6); // on a grid line
    for (let i = 1; i < fired.length; i++) expect(fired[i]).toBeGreaterThan(fired[i - 1]); // strictly increasing
  });

  it("the quantize hook does not change how many events are pulled (raw timeline unaffected)", () => {
    const makeOpts = (quantize?: (t: number) => number) => {
      let count = 0;
      let now = 0;
      const sched = new Scheduler({
        now: () => now,
        lookaheadSec: 0.1,
        pull: () => ({ kind: "note", pitchHz: 220, velocity: 0.7, ioiSec: 0.13, durationHint: 1, degreeIndex: 0, octave: 0 }),
        onNote: () => { count++; },
        onRest: () => {},
        quantize,
      });
      sched.start();
      for (let i = 0; i < 40; i++) { now += 0.025; sched.tick(); }
      return count;
    };
    const free = makeOpts(undefined);
    const quantized = makeOpts((t) => Math.ceil(t / 0.25 - 1e-9) * 0.25);
    expect(quantized).toBe(free);
  });

  it("previewOnset snaps a raw time past a matra boundary to the LATER matra (stateless)", () => {
    let now = 0;
    const matra = 0.5; // one matra = 0.5s on the grid
    // Grid snap = ceil to the next matra line (same shape as App's nextGridTime).
    const q = (t: number) => Math.ceil(t / matra - 1e-9) * matra;
    const fired: number[] = [];
    const sched = new Scheduler({
      now: () => now,
      lookaheadSec: 0.1,
      pull: () => ({ kind: "note", pitchHz: 220, velocity: 0.7, ioiSec: 0.5, durationHint: 1, degreeIndex: 0, octave: 0 }),
      onNote: (_e, time) => fired.push(time),
      onRest: () => {},
      quantize: q,
    });
    sched.start();
    // A raw time just BEFORE the matra-2 boundary (2 * 0.5 = 1.0). The raw time
    // sits in matra 1 (floor(0.98/0.5) = 1) but the onset snaps forward to 1.0,
    // which belongs to matra 2 (floor(1.0/0.5) = 2).
    const raw = 0.98;
    const matraOfRaw = Math.floor(raw / matra);
    const predicted = sched.previewOnset(raw);
    const matraOfOnset = Math.floor((predicted + 1e-9) / matra);
    expect(predicted).toBeCloseTo(1.0, 9);
    expect(matraOfOnset).toBe(matraOfRaw + 1); // later matra → later matra's bias

    // Stateless: previewOnset neither advances the cursor nor pulls events, so
    // real scheduling is identical to never having previewed.
    for (let i = 0; i < 4; i++) { now += 0.025; sched.tick(); }
    const firstReal = fired[0];
    sched.previewOnset(0.98);
    sched.previewOnset(5.0);
    for (let i = 0; i < 4; i++) { now += 0.025; sched.tick(); }
    expect(fired[0]).toBe(firstReal); // unchanged by the intervening previews
  });

  it("previewOnset matches the onset tick() actually schedules for the same raw time", () => {
    let now = 0;
    const grid = 0.25;
    const q = (t: number) => Math.ceil(t / grid - 1e-9) * grid;
    const fired: number[] = [];
    const sched = new Scheduler({
      now: () => now,
      lookaheadSec: 0.1,
      pull: () => ({ kind: "note", pitchHz: 220, velocity: 0.7, ioiSec: 0.5, durationHint: 1, degreeIndex: 0, octave: 0 }),
      onNote: (_e, time) => fired.push(time),
      onRest: () => {},
      quantize: q,
    });
    sched.start(); // nextTime = 0, so the first event's raw time is 0
    const predicted = sched.previewOnset(0);
    now += 0.05; sched.tick();
    expect(fired[0]).toBe(predicted);
  });

  // A note factory with a chosen IOI, so tests can force a long pending wait.
  const note = (ioiSec: number) => ({
    kind: "note" as const, pitchHz: 220, velocity: 0.7, ioiSec, durationHint: 1, degreeIndex: 0, octave: 0,
  });

  it("nudge shortens a pending long wait to <= maxRemainSec (and pulls no extra events)", () => {
    let now = 0;
    let pulls = 0;
    const fired: number[] = [];
    const sched = new Scheduler({
      now: () => now,
      lookaheadSec: 0.1,
      pull: () => { pulls++; return note(8); }, // 8s IOI → a long rest-like wait
      onNote: (_e, t) => fired.push(t),
      onRest: () => {},
    });
    sched.start(); // nextTime = 0
    now = 0.05; sched.tick(); // first note at raw 0; cursor jumps to 8
    expect(fired.length).toBe(1);
    const pullsAfterFirst = pulls;

    sched.nudge(1.0); // density spiked: hear the new rate within ~1s, not at t≈8
    expect(pulls).toBe(pullsAfterFirst); // nudge itself pulls nothing (no rng draw)

    for (let i = 0; i < 60 && fired.length < 2; i++) { now += 0.025; sched.tick(); }
    expect(fired.length).toBe(2);
    // Second onset lands no later than (now-at-nudge) + maxRemainSec = 0.05 + 1.0.
    expect(fired[1]).toBeLessThanOrEqual(1.05 + 1e-9);
    expect(fired[1]).toBeGreaterThan(fired[0]); // still strictly after the first
  });

  it("nudge leaves an already-near pull untouched", () => {
    let now = 0;
    const fired: number[] = [];
    const sched = new Scheduler({
      now: () => now,
      lookaheadSec: 0.1,
      pull: () => note(0.3),
      onNote: (_e, t) => fired.push(t),
      onRest: () => {},
    });
    sched.start();
    now = 0.05; sched.tick(); // first note at raw 0; cursor at 0.3
    sched.nudge(1.0); // target 0.05+1.0=1.05 > 0.3 → min() keeps 0.3, no change
    for (let i = 0; i < 20 && fired.length < 2; i++) { now += 0.025; sched.tick(); }
    expect(fired[1]).toBeCloseTo(0.3, 9);
  });

  it("nudge never moves the cursor earlier than now (no scheduling in the past)", () => {
    let now = 0;
    const fired: number[] = [];
    const sched = new Scheduler({
      now: () => now,
      lookaheadSec: 0.1,
      pull: () => note(8),
      onNote: (_e, t) => fired.push(t),
      onRest: () => {},
    });
    sched.start();
    now = 0.05; sched.tick(); // first note at raw 0; cursor at 8
    const nudgeNow = now;
    sched.nudge(-5); // negative clamps to 0 → target === now, never before it
    for (let i = 0; i < 10 && fired.length < 2; i++) { now += 0.025; sched.tick(); }
    expect(fired.length).toBe(2);
    expect(fired[1]).toBeGreaterThanOrEqual(nudgeNow); // not in the past
  });

  it("nudge on a stopped scheduler is a no-op", () => {
    const now = 5;
    const sched = new Scheduler({
      now: () => now,
      lookaheadSec: 0.1,
      pull: () => note(0.3),
      onNote: () => {},
      onRest: () => {},
    });
    // never started → running=false; nudge must not throw or arm the timeline
    expect(() => sched.nudge(0.1)).not.toThrow();
  });

  it("a throwing onNote does not stall the timeline (no event storm)", () => {
    let now = 0;
    let pulls = 0;
    const sched = new Scheduler({
      now: () => now,
      lookaheadSec: 0.1,
      pull: () => {
        pulls++;
        return { kind: "note", pitchHz: 220, velocity: 0.7, ioiSec: 0.5, durationHint: 1, degreeIndex: 0, octave: 0 };
      },
      onNote: () => { throw new Error("boom"); },
      onRest: () => {},
    });
    sched.start();
    // Each tick aborts at the throwing callback, but nextTime must still have
    // advanced past the event — so ~2 events/sec are pulled, not 1000/tick.
    for (let i = 0; i < 40; i++) {
      now += 0.025;
      try { sched.tick(); } catch { /* the throw escapes tick; setInterval would swallow it */ }
    }
    expect(pulls).toBeLessThanOrEqual(4); // 1s of clock at 0.5s IOI ≈ 2–3 pulls
  });
});
