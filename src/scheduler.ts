// src/scheduler.ts
// Web Audio lookahead scheduler (the standard "a-tale-of-two-clocks" pattern).
// tick() is called on a ~25ms timer; it schedules every event whose time falls
// within the lookahead window, advancing a running nextTime cursor.
//
// Optional `quantize` hook: when Ableton Link is engaged, note ONSETS are
// snapped to a beat grid via quantize(rawTime), while the raw timeline still
// advances by each event's ioiSec (so the engine's density/breathing is
// preserved). A monotonic guard keeps onsets strictly increasing.
import type { EngineEvent, NoteEvent, RestEvent } from "./engine";

export type SchedulerOpts = {
  now: () => number;             // AudioContext.currentTime (seconds), injectable for tests
  lookaheadSec: number;          // schedule-ahead window, e.g. 0.1
  pull: () => EngineEvent;       // next event from the engine
  onNote: (e: NoteEvent, time: number) => void;
  onRest: (e: RestEvent, time: number) => void;
  quantize?: (rawTime: number) => number; // optional onset grid-snap
};

export class Scheduler {
  private running = false;
  private nextTime = 0;
  private lastOnset = -Infinity;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private opts: SchedulerOpts) {}

  start() {
    this.running = true;
    this.nextTime = this.opts.now();
    this.lastOnset = -Infinity;
  }

  // Drives scheduling from a real timer (browser). Tests call tick() directly.
  run(intervalMs = 25) {
    this.start();
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  tick() {
    if (!this.running) return;
    const horizon = this.opts.now() + this.opts.lookaheadSec;
    // Schedule everything due within the window. Cap iterations to avoid a
    // runaway loop if ioiSec is ever 0.
    let guard = 0;
    while (this.nextTime < horizon && guard++ < 1000) {
      const e = this.opts.pull();
      if (e.kind === "note") {
        let onset = this.opts.quantize ? this.opts.quantize(this.nextTime) : this.nextTime;
        // Monotonic guard: never schedule at/before the previous onset. When
        // quantizing, push to the next grid line; otherwise nudge forward.
        if (onset <= this.lastOnset) {
          onset = this.opts.quantize ? this.opts.quantize(this.lastOnset + 1e-6) : this.lastOnset + 1e-6;
        }
        this.lastOnset = onset;
        this.opts.onNote(e, onset);
      } else {
        this.opts.onRest(e, this.nextTime);
      }
      this.nextTime += Math.max(0.001, e.ioiSec);
    }
  }

  stop() {
    this.running = false;
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
