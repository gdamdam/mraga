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
      // Advance the cursor BEFORE dispatching: if a callback throws, the
      // timeline still moves on, instead of re-scheduling against a frozen
      // nextTime on every subsequent tick (an event storm).
      const rawTime = this.nextTime;
      this.nextTime += Math.max(0.001, e.ioiSec);
      if (e.kind === "note") {
        const onset = this.computeOnset(rawTime, this.lastOnset);
        this.lastOnset = onset;
        this.opts.onNote(e, onset);
      } else {
        this.opts.onRest(e, rawTime);
      }
    }
  }

  // Pure onset math shared by tick() and previewOnset(): apply the grid snap,
  // then the monotonic guard relative to a given previous onset. Side-effect
  // free (takes lastOnset as an arg) so previewOnset can predict an onset
  // without touching scheduler state.
  private computeOnset(rawTime: number, lastOnset: number): number {
    let onset = this.opts.quantize ? this.opts.quantize(rawTime) : rawTime;
    // Monotonic guard: never schedule at/before the previous onset. When
    // quantizing, push to the next grid line; otherwise nudge forward.
    if (onset <= lastOnset) {
      onset = this.opts.quantize ? this.opts.quantize(lastOnset + 1e-6) : lastOnset + 1e-6;
    }
    return onset;
  }

  // Predict the quantized onset for a raw time WITHOUT mutating scheduler state
  // or advancing the cursor. taalBias is read at pull time but onsets snap to
  // the grid afterward (see tick()), so a note pulled just before a matra
  // boundary can land past it; callers preview the snapped onset to derive the
  // bias/taal position from where the note will actually sound.
  previewOnset(rawTime: number): number {
    return this.computeOnset(rawTime, this.lastOnset);
  }

  // Density nudge: when a knob turn sharply RAISES density mid-wait, the engine
  // has often already handed us a long rest, so nextTime sits far in the future
  // and the new, busier rate isn't heard until that rest finishes (reads as a
  // "screensaver" — a beat's worth of change arriving many seconds late). Pull
  // the cursor forward so the pending pull fires within maxRemainSec instead.
  //
  // Only ever moves the cursor EARLIER, never later (Math.min), so a due/near
  // pull is left untouched and a pull is never delayed; and never before now
  // (target = now + maxRemainSec, maxRemainSec >= 0), so nothing is scheduled in
  // the past. RNG-safety: this touches only nextTime — it never calls pull(),
  // the sole rng() consumer — so it changes *when* the next pull fires, never
  // what it draws. No pull is inserted, dropped, or duplicated (tick() still
  // pulls exactly once when the cursor crosses the horizon).
  nudge(maxRemainSec: number) {
    if (!this.running) return;
    const target = this.opts.now() + Math.max(0, maxRemainSec);
    this.nextTime = Math.min(this.nextTime, target);
  }

  stop() {
    this.running = false;
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
