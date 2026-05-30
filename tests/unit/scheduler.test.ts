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
});
