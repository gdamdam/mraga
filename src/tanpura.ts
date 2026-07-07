// src/tanpura.ts
// Built-in tanpura drone: the classic four-string pluck cycle — Pa (fifth
// below the tonic), Sa, Sa, Sa (octave below) — rendered on a dedicated KS
// worklet pool with a jawari-heavy preset, so mraga is self-contained (no
// mdrone tab required). The cycle is free-timed (never quantized): a tanpura
// breathes independently of the melodic grid.
import { Scheduler } from "./scheduler";
import type { Voice } from "./voice";
import type { KSParams } from "./voicePresets";

// Long, buzzing, resonant strings.
export const TANPURA_PRESET: KSParams = {
  brightness: 0.55,
  damping: 0.4985,
  decay: 0.99998,
  jawari: 0.55,
};

// Seconds between plucks; a full 4-string cycle is ~4.6s (a typical unhurried
// tanpura pace, deliberately unrelated to the melody's tempo).
const PLUCK_IOI_SEC = 1.15;

// Nearest scale degree (cents) to `target` within `tol`, or null.
function pickNear(scaleCents: number[], target: number, tol: number): number | null {
  let best: number | null = null;
  let bestErr = tol;
  for (const c of scaleCents) {
    const err = Math.abs(c - target);
    if (err <= bestErr) {
      bestErr = err;
      best = c;
    }
  }
  return best;
}

// Pure: the four pluck frequencies for a tonic + scale. Uses the scale's own
// fifth (so a microtonal fifth stays microtonal); falls back to the fourth,
// then to the low octave, when the scale lacks one.
export function tanpuraCycle(tonicHz: number, scaleCents: number[]): number[] {
  const fifth = pickNear(scaleCents, 702, 40) ?? pickNear(scaleCents, 498, 40);
  const paHz = fifth != null ? tonicHz * Math.pow(2, (fifth - 1200) / 1200) : tonicHz / 2;
  return [paHz, tonicHz, tonicHz, tonicHz / 2];
}

export class Tanpura {
  private sched: Scheduler | null = null;
  private idx = 0;

  get running(): boolean {
    return this.sched != null;
  }

  // getTuning is read on every pluck so a tuning change retunes the drone live.
  start(voice: Voice, getTuning: () => { tonicHz: number; scaleCents: number[] }) {
    if (this.sched) return;
    voice.setDronePreset(TANPURA_PRESET);
    this.idx = 0;
    const sched = new Scheduler({
      now: () => voice.ctx.currentTime,
      lookaheadSec: 0.15,
      pull: () => {
        const t = getTuning();
        const cycle = tanpuraCycle(t.tonicHz, t.scaleCents);
        const pitchHz = cycle[this.idx % cycle.length];
        this.idx++;
        return {
          kind: "note",
          pitchHz,
          velocity: 0.5,
          ioiSec: PLUCK_IOI_SEC,
          durationHint: PLUCK_IOI_SEC * 4,
          degreeIndex: 0,
          octave: 0,
        };
      },
      onNote: (e) => voice.pluckDrone(e.pitchHz, e.velocity),
      onRest: () => {},
    });
    sched.run(50);
    this.sched = sched;
  }

  stop() {
    this.sched?.stop();
    this.sched = null;
  }
}
