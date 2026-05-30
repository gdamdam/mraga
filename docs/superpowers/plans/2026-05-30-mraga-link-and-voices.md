# mraga — Ableton Link + Voice Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two orthogonal post-MVP features to mraga: (1) an optional **Ableton Link tempo lock** that quantizes note onsets to a ½-beat grid (follow-only, reusing the existing m-family bridge), and (2) a **voice palette** of six selectable struck/plucked flavours from one parameterized Karplus–Strong voice.

**Architecture:** Two new pure, tested units — `linkClock` (beat↔audio-time math + grid snapping) and `voicePresets` (KS parameter sets). The existing `scheduler` gains one optional `quantize` hook; the existing KS worklet gains per-voice params + a `preset` message; the existing `voice` host gains `setPreset`; `App`/footer wires both (a live `free ○ link` toggle and a voice selector). The Ableton Link bridge client (`linkBridge.ts`) is copied verbatim from mdrone.

**Tech Stack:** React 19 + Vite + TypeScript, Web Audio AudioWorklet, vitest. Builds on the mraga MVP (branch `feat/mvp`); this plan runs on `feat/link-and-voices`.

**Specs:** `docs/superpowers/specs/2026-05-30-mraga-ableton-link-design.md`, `docs/superpowers/specs/2026-05-30-mraga-voice-palette-design.md`.

---

## File structure

| File | Responsibility | New/Modified |
|---|---|---|
| `src/voicePresets.ts` | Pure: VoiceId/KSParams types, the six presets, `getPreset` | **New** |
| `src/linkClock.ts` | Pure: beat↔audio-time model + ½-beat grid snapping | **New** |
| `src/engine/linkBridge.ts` | WebSocket client to the Link bridge (verbatim from mdrone) | **New (copied)** |
| `src/scheduler.ts` | Add optional `quantize(rawTime)` hook + monotonic onset guard | Modified |
| `src/engine/voices/shared.js` | `KSVoice` honors brightness/damping/decay/jawari params | Modified |
| `src/engine/voices/karplus.js` | Handle `{type:"preset"}` message | Modified |
| `src/voice.ts` | Add `setPreset(params)` | Modified |
| `src/App.tsx` | Voice selector + live Link toggle wiring | Modified |
| `tests/unit/voicePresets.test.ts` | Tests for presets | **New** |
| `tests/unit/linkClock.test.ts` | Tests for the clock math | **New** |
| `tests/unit/scheduler.test.ts` | + tests for the quantize hook | Modified |

Build order: pure units first (Tasks 1–2), then scheduler hook (3), then bridge copy (4), then worklet/voice audio (5–6), then App wiring (7), then final verification (8).

---

### Task 1: Voice presets (`voicePresets`)

Pure data + lookup. The crown-jewel-testable unit of the palette feature.

**Files:**
- Create: `src/voicePresets.ts`
- Test: `tests/unit/voicePresets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { VOICE_IDS, VOICE_LABELS, VOICE_PRESETS, getPreset } from "../../src/voicePresets";

describe("voicePresets", () => {
  it("has all six flavours, ordered", () => {
    expect(VOICE_IDS).toEqual(["santoor", "koto", "sitar", "mallet", "qanun", "kalimba"]);
  });

  it("every id has a label and a preset", () => {
    for (const id of VOICE_IDS) {
      expect(typeof VOICE_LABELS[id]).toBe("string");
      expect(VOICE_PRESETS[id]).toBeDefined();
    }
  });

  it("every preset is within the safe KS parameter ranges", () => {
    for (const id of VOICE_IDS) {
      const p = VOICE_PRESETS[id];
      expect(p.brightness).toBeGreaterThanOrEqual(0);
      expect(p.brightness).toBeLessThanOrEqual(1);
      expect(p.jawari).toBeGreaterThanOrEqual(0);
      expect(p.jawari).toBeLessThanOrEqual(1);
      // damping must stay below 0.5 for KS loop stability, and be a real filter
      expect(p.damping).toBeGreaterThan(0.49);
      expect(p.damping).toBeLessThan(0.5);
      // per-sample gain decay must be < 1 (so the voice actually decays)
      expect(p.decay).toBeGreaterThan(0.999);
      expect(p.decay).toBeLessThan(1);
    }
  });

  it("santoor preserves the MVP baseline character", () => {
    expect(VOICE_PRESETS.santoor).toEqual({
      brightness: 1.0,
      damping: 0.4975,
      decay: 0.99995,
      jawari: 0,
    });
  });

  it("getPreset falls back to santoor for an unknown id", () => {
    expect(getPreset("nope")).toEqual(VOICE_PRESETS.santoor);
    expect(getPreset("koto")).toEqual(VOICE_PRESETS.koto);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/voicePresets.test.ts`
Expected: FAIL — cannot find module `../../src/voicePresets`.

- [ ] **Step 3: Write the implementation**

```ts
// src/voicePresets.ts
// Six struck/plucked flavours, each a parameter set over the one Karplus–Strong
// voice (src/engine/voices/shared.js). Select-one (no blending). Numbers are
// tasteful starting points to tune by ear; the RELATIVE design is what matters.
export type VoiceId = "santoor" | "koto" | "sitar" | "mallet" | "qanun" | "kalimba";

export type KSParams = {
  brightness: number; // 0..1 lowpass on the excitation burst (1 = bright)
  damping: number;    // KS loop coefficient, <0.5 for stability
  decay: number;      // per-sample gain falloff, <1
  jawari: number;     // 0..1 output waveshaper buzz (sitar)
};

export const VOICE_IDS: VoiceId[] = ["santoor", "koto", "sitar", "mallet", "qanun", "kalimba"];

export const VOICE_LABELS: Record<VoiceId, string> = {
  santoor: "santoor",
  koto: "koto",
  sitar: "sitar",
  mallet: "mallet",
  qanun: "qanun",
  kalimba: "kalimba",
};

export const VOICE_PRESETS: Record<VoiceId, KSParams> = {
  // santoor == MVP baseline voice.
  santoor: { brightness: 1.0, damping: 0.4975, decay: 0.99995, jawari: 0 },
  koto: { brightness: 0.6, damping: 0.499, decay: 0.99997, jawari: 0 },
  sitar: { brightness: 0.8, damping: 0.499, decay: 0.99997, jawari: 0.7 },
  mallet: { brightness: 0.35, damping: 0.494, decay: 0.9999, jawari: 0 },
  qanun: { brightness: 0.95, damping: 0.4965, decay: 0.99993, jawari: 0.15 },
  kalimba: { brightness: 0.7, damping: 0.495, decay: 0.99991, jawari: 0.2 },
};

export function getPreset(id: string): KSParams {
  return (VOICE_PRESETS as Record<string, KSParams>)[id] ?? VOICE_PRESETS.santoor;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/voicePresets.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/voicePresets.ts tests/unit/voicePresets.test.ts
git commit -m "feat: voice palette presets (6 flavours over parameterized KS)"
```

---

### Task 2: Link clock (`linkClock`)

Pure beat↔audio-time model + ½-beat grid snapping. The crown-jewel-testable unit of the Link feature. No WebSocket, no AudioContext inside.

**Files:**
- Create: `src/linkClock.ts`
- Test: `tests/unit/linkClock.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { LinkClock } from "../../src/linkClock";

describe("LinkClock", () => {
  it("is invalid until updated; nextGridTime is identity while invalid", () => {
    const c = new LinkClock();
    expect(c.valid).toBe(false);
    expect(c.nextGridTime(1.234, 0.5)).toBe(1.234);
  });

  it("beatAt and timeAtBeat are inverses", () => {
    const c = new LinkClock();
    c.update(120, 0, 0); // 120 BPM => 0.5 s/beat, beatRef 0 at time 0
    expect(c.beatAt(1.0)).toBeCloseTo(2.0, 9); // 1 s = 2 beats at 120 BPM
    expect(c.timeAtBeat(2.0)).toBeCloseTo(1.0, 9);
    expect(c.timeAtBeat(c.beatAt(0.37))).toBeCloseTo(0.37, 9);
  });

  it("snaps to the next half-beat at or after t (120 BPM => half-beat = 0.25 s)", () => {
    const c = new LinkClock();
    c.update(120, 0, 0);
    expect(c.nextGridTime(0, 0.5)).toBeCloseTo(0, 9);       // exactly on a line
    expect(c.nextGridTime(0.1, 0.5)).toBeCloseTo(0.25, 9);  // → next half-beat
    expect(c.nextGridTime(0.25, 0.5)).toBeCloseTo(0.25, 9); // on a line, stays
    expect(c.nextGridTime(0.26, 0.5)).toBeCloseTo(0.5, 9);
  });

  it("tempo change via update shifts the mapping", () => {
    const c = new LinkClock();
    c.update(60, 0, 0); // 1 s/beat, half-beat = 0.5 s
    expect(c.nextGridTime(0.1, 0.5)).toBeCloseTo(0.5, 9);
  });

  it("nextGridTime is monotonic non-decreasing for increasing t", () => {
    const c = new LinkClock();
    c.update(135, 3.2, 0.4); // arbitrary model
    let prev = -Infinity;
    for (let t = 0; t < 3; t += 0.013) {
      const g = c.nextGridTime(t, 0.5);
      expect(g).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = g;
    }
  });

  it("reset() makes it invalid again", () => {
    const c = new LinkClock();
    c.update(120, 0, 0);
    c.reset();
    expect(c.valid).toBe(false);
    expect(c.nextGridTime(0.1, 0.5)).toBe(0.1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/linkClock.test.ts`
Expected: FAIL — cannot find module `../../src/linkClock`.

- [ ] **Step 3: Write the implementation**

```ts
// src/linkClock.ts
// A local linear model of the shared Link beat clock in terms of the audio
// clock. Fed from the link bridge's 20 Hz messages (tempo + beat), timestamped
// with AudioContext.currentTime at arrival. Pure given its state; used by the
// scheduler to snap note onsets to a beat grid.
const EPS = 1e-9;

export class LinkClock {
  private tempo = 120;
  private beatRef = 0;
  private timeRef = 0;
  private _valid = false;

  get valid(): boolean {
    return this._valid;
  }

  // beat: the Link beat position as of audioNow (AudioContext.currentTime).
  update(tempo: number, beat: number, audioNow: number): void {
    this.tempo = tempo;
    this.beatRef = beat;
    this.timeRef = audioNow;
    this._valid = true;
  }

  reset(): void {
    this._valid = false;
  }

  beatAt(t: number): number {
    return this.beatRef + (t - this.timeRef) * (this.tempo / 60);
  }

  timeAtBeat(b: number): number {
    return this.timeRef + (b - this.beatRef) * (60 / this.tempo);
  }

  // The next grid line (in seconds, audio clock) at or after t. subdivBeats=0.5
  // is a half-beat (eighth-note) grid. Identity passthrough while invalid.
  nextGridTime(t: number, subdivBeats = 0.5): number {
    if (!this._valid) return t;
    const beat = this.beatAt(t);
    const gridBeat = Math.ceil(beat / subdivBeats - EPS) * subdivBeats;
    return this.timeAtBeat(gridBeat);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/linkClock.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/linkClock.ts tests/unit/linkClock.test.ts
git commit -m "feat: link clock — beat<->audio-time model + grid snapping"
```

---

### Task 3: Scheduler `quantize` hook

Add an optional onset-quantization hook with a monotonic guard. Free mode (no hook, or identity hook) keeps the existing behavior bit-for-bit.

**Files:**
- Modify: `src/scheduler.ts`
- Test: `tests/unit/scheduler.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append these two `it` blocks inside the existing `describe("Scheduler", ...)` block in `tests/unit/scheduler.test.ts`)

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/scheduler.test.ts`
Expected: FAIL — `quantize` is not a valid `SchedulerOpts` field (type error) / onsets not on grid.

- [ ] **Step 3: Implement the hook** — replace the full contents of `src/scheduler.ts` with:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/scheduler.test.ts`
Expected: PASS (4 tests — the 2 original free-mode tests still pass, plus the 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/scheduler.ts tests/unit/scheduler.test.ts
git commit -m "feat: scheduler onset-quantize hook (for Link grid lock)"
```

---

### Task 4: Copy the Link bridge client

Verbatim copy from mdrone (proven m-family transport; no logic added → not unit-tested).

**Files:**
- Create: `src/engine/linkBridge.ts`

- [ ] **Step 1: Copy the file**

Run: `cp ../mdrone/src/engine/linkBridge.ts src/engine/linkBridge.ts`

- [ ] **Step 2: Verify it is verbatim and typechecks**

Run: `diff ../mdrone/src/engine/linkBridge.ts src/engine/linkBridge.ts && echo IDENTICAL`
Expected: prints `IDENTICAL`.

Run: `npx tsc -b --noEmit`
Expected: clean (the module is self-contained; it exports `LinkState`, `enableLinkBridge`, `onLinkState`, `sendLinkTempo`, `sendLinkPlaying`, `getLinkState`, `autoDetectLinkBridge`). The persistence key is NOT inside this file — mraga owns `mraga-link-enabled` in App (Task 7). Do not edit the file.

- [ ] **Step 3: Commit**

```bash
git add src/engine/linkBridge.ts
git commit -m "feat: vendor mdrone link-bridge client (verbatim)"
```

---

### Task 5: Parameterize the KS voice + preset message

Make the worklet voice honor brightness/damping/decay/jawari, and accept a `{type:"preset"}` message. Audio-thread code → verified by build + symbol checks (no unit test).

**Files:**
- Modify: `src/engine/voices/shared.js`
- Modify: `src/engine/voices/karplus.js`
- Generated (gitignored): `src/engine/voiceProcessor.js`

- [ ] **Step 1: Replace `src/engine/voices/shared.js` with the parameterized voice**

```js
// One Karplus–Strong plucked string voice. Bright noise excitation through a
// one-pole lowpass feedback loop => a struck/decaying tone. The voice palette
// (src/voicePresets.ts) drives brightness/damping/decay/jawari; the defaults
// below are the santoor baseline == the MVP voice.
class KSVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.buf = new Float32Array(1);
    this.idx = 0;
    this.len = 1;
    this.active = false;
    this.damp = 0.4975;
    this.gain = 0;
    this.last = 0;
    // Glide state (declared; portamento rendering is a future enhancement).
    this.glideSamples = 0;
    this.glideFromLen = 0;
    // Voice-palette params (santoor baseline).
    this.brightness = 1.0; // excitation lowpass amount (1 = bright/unfiltered)
    this.damping = 0.4975; // KS loop coefficient (< 0.5 for stability)
    this.decay = 0.99995;  // per-sample gain falloff
    this.jawari = 0;       // output waveshaper buzz (0..1)
  }

  setParams(p) {
    this.brightness = p.brightness;
    this.damping = p.damping;
    this.decay = p.decay;
    this.jawari = p.jawari;
  }

  pluck(freq, velocity, glideFromFreq) {
    this.len = Math.max(2, Math.round(this.sr / freq));
    this.buf = new Float32Array(this.len);
    // Excitation: white noise one-pole-lowpassed by brightness (warm <-> bright).
    let prev = 0;
    const a = this.brightness;
    for (let i = 0; i < this.len; i++) {
      const white = Math.random() * 2 - 1;
      prev = a * white + (1 - a) * prev;
      this.buf[i] = prev;
    }
    this.idx = 0;
    this.active = true;
    this.gain = velocity;
    this.damp = this.damping;
    this.last = 0;
    if (glideFromFreq && glideFromFreq > 0) {
      this.glideFromLen = Math.max(2, Math.round(this.sr / glideFromFreq));
      this.glideSamples = Math.round(this.sr * 0.08); // 80ms portamento
    } else {
      this.glideSamples = 0;
    }
  }

  render() {
    if (!this.active) return 0;
    const cur = this.buf[this.idx];
    const nextIdx = (this.idx + 1) % this.len;
    const avg = this.damp * (cur + this.last);
    this.last = cur;
    this.buf[this.idx] = avg;
    this.idx = nextIdx;
    this.gain *= this.decay; // overall decay
    if (this.gain < 0.0001) this.active = false;
    // Jawari: tanh drive adds metallic harmonics (sitar). 0 => clean passthrough.
    const out = this.jawari > 0 ? Math.tanh(cur * (1 + this.jawari * 6)) : cur;
    return out * this.gain;
  }
}
```

- [ ] **Step 2: Replace `src/engine/voices/karplus.js` to handle the preset message**

```js
// mraga voice processor. Holds a pool of KS voices so rings overlap (spec §7).
// Messages:
//   { type: "pluck", freq, velocity, glideFromFreq } — round-robin a voice
//   { type: "preset", params: {brightness,damping,decay,jawari} } — set the active voice flavour
class MragaVoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const POOL = 8;
    this.voices = [];
    for (let i = 0; i < POOL; i++) this.voices.push(new KSVoice(sampleRate));
    this.rr = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === "pluck") {
        const v = this.voices[this.rr];
        this.rr = (this.rr + 1) % this.voices.length;
        // Clamp velocity at the audio boundary: the KS loop filter is only
        // conditionally stable (DC gain slightly >1), so a stray velocity >1
        // could spike before the gain envelope pulls it down.
        const vel = Math.max(0, Math.min(1, m.velocity));
        v.pluck(m.freq, vel, m.glideFromFreq);
      } else if (m.type === "preset" && m.params) {
        // Select-one: apply the flavour to all pooled voices so currently
        // ringing and future plucks share the active timbre.
        for (const v of this.voices) v.setParams(m.params);
      }
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const ch0 = out[0];
    for (let i = 0; i < ch0.length; i++) {
      let s = 0;
      for (const v of this.voices) s += v.render();
      s *= 0.35; // headroom for the pool
      for (let c = 0; c < out.length; c++) out[c][i] = s;
    }
    return true;
  }
}

registerProcessor("mraga-voice", MragaVoiceProcessor);
```

- [ ] **Step 3: Rebuild the worklet and verify symbols**

Run: `node scripts/build-worklet.mjs`
Expected: prints `built src/engine/voiceProcessor.js`.

Run: `grep -c "setParams" src/engine/voiceProcessor.js && grep -c 'type === "preset"' src/engine/voiceProcessor.js`
Expected: both ≥ 1.

- [ ] **Step 4: Confirm nothing else broke**

Run: `npx tsc -b --noEmit && npx vitest run`
Expected: typecheck clean; full unit suite green (count unchanged from before this task — these are JS worklet files, no unit tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/voices/shared.js src/engine/voices/karplus.js
git commit -m "feat: parameterize KS voice (brightness/damping/decay/jawari) + preset message"
```

---

### Task 6: `voice` host — `setPreset`

Expose preset selection on the voice host.

**Files:**
- Modify: `src/voice.ts`

- [ ] **Step 1: Edit `src/voice.ts`** — add the `KSParams` import, extend the `Voice` type, and add `setPreset` to the returned object.

Add the import near the top (after the worklet url import):
```ts
import type { KSParams } from "./voicePresets";
```

Add to the `Voice` type (after the `pluck` line):
```ts
  setPreset: (params: KSParams) => void;
```

Add to the returned object in `createVoice` (after the `pluck:` entry):
```ts
    setPreset: (params) => node.port.postMessage({ type: "preset", params }),
```

For reference, the resulting `Voice` type and return block should read:
```ts
export type Voice = {
  ctx: AudioContext;
  resume: () => Promise<void>;
  pluck: (freq: number, velocity: number, glideFromFreq?: number) => void;
  setPreset: (params: KSParams) => void;
  dispose: () => void;
};
```
```ts
  return {
    ctx,
    resume: () => ctx.resume(),
    pluck: (freq, velocity, glideFromFreq) =>
      node.port.postMessage({ type: "pluck", freq, velocity, glideFromFreq }),
    setPreset: (params) => node.port.postMessage({ type: "preset", params }),
    dispose: () => void ctx.close(),
  };
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/voice.ts
git commit -m "feat: voice host setPreset()"
```

---

### Task 7: App + footer — voice selector & live Link toggle

Wire both features into `App.tsx`: a clickable voice selector (cycles the six flavours, persisted), and a live `free ○ link` toggle that connects the bridge, drives the `linkClock`, quantizes onsets when connected, and shows tempo/peers.

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace the full contents of `src/App.tsx` with:**

```tsx
import { useEffect, useRef, useState } from "react";
import { Knob } from "./components/Knob";
import { PitchLadder } from "./components/PitchLadder";
import { importTuningFromUrl, DEFAULT_TUNING, type PortableTuning } from "./linkImport";
import { knobsToParams, type Knobs } from "./conducting";
import { initState, nextEvent, type EngineState } from "./engine";
import { makeRng } from "./rng";
import { Scheduler } from "./scheduler";
import { createVoice, type Voice } from "./voice";
import { VOICE_IDS, VOICE_LABELS, getPreset, type VoiceId } from "./voicePresets";
import { LinkClock } from "./linkClock";
import { enableLinkBridge, autoDetectLinkBridge, onLinkState, type LinkState } from "./engine/linkBridge";

const VOICE_KEY = "mraga-voice";
const LINK_KEY = "mraga-link-enabled";

function loadVoiceId(): VoiceId {
  const stored = localStorage.getItem(VOICE_KEY);
  return (VOICE_IDS as string[]).includes(stored ?? "") ? (stored as VoiceId) : "santoor";
}

export function App() {
  const [tuning, setTuning] = useState<PortableTuning>(DEFAULT_TUNING);
  const [linkInput, setLinkInput] = useState("");
  const [playing, setPlaying] = useState(false);
  const [activeDegree, setActiveDegree] = useState<number | null>(null);
  const [knobs, setKnobs] = useState<Knobs>({ density: 0.5, register: 0.5, restlessness: 0.4, silence: 0.4 });
  const [voiceId, setVoiceId] = useState<VoiceId>(loadVoiceId);
  const [linkEnabled, setLinkEnabled] = useState<boolean>(() => localStorage.getItem(LINK_KEY) === "1");
  const [linkState, setLinkState] = useState<LinkState>({
    tempo: 120, beat: 0, phase: 0, playing: false, peers: 0, clients: 0, connected: false,
  });

  const voiceRef = useRef<Voice | null>(null);
  const schedRef = useRef<Scheduler | null>(null);
  const stateRef = useRef<EngineState>(initState());
  const rngRef = useRef<() => number>(makeRng(Date.now() & 0xffff));
  const knobsRef = useRef(knobs);
  const tuningRef = useRef(tuning);
  const clockRef = useRef(new LinkClock());
  // Link is "active" (quantizing) only when enabled AND connected.
  const linkActiveRef = useRef(false);
  knobsRef.current = knobs;
  tuningRef.current = tuning;
  linkActiveRef.current = linkEnabled && linkState.connected;

  // Subscribe to the bridge once; feed the clock and mirror state into React.
  useEffect(() => {
    const unsub = onLinkState((s) => {
      if (s.connected) {
        const now = voiceRef.current ? voiceRef.current.ctx.currentTime : 0;
        clockRef.current.update(s.tempo, s.beat, now);
      } else {
        clockRef.current.reset();
      }
      setLinkState(s);
    });
    // On load: persistent connect if the user previously enabled it, else a
    // silent one-shot auto-detect (mirrors mdrone).
    if (localStorage.getItem(LINK_KEY) === "1") enableLinkBridge(true);
    else autoDetectLinkBridge();
    return unsub;
  }, []);

  async function loadLink() {
    setTuning(await importTuningFromUrl(linkInput));
  }

  function cycleVoice() {
    const next = VOICE_IDS[(VOICE_IDS.indexOf(voiceId) + 1) % VOICE_IDS.length];
    setVoiceId(next);
    localStorage.setItem(VOICE_KEY, next);
    voiceRef.current?.setPreset(getPreset(next));
  }

  function toggleLink() {
    const next = !linkEnabled;
    setLinkEnabled(next);
    localStorage.setItem(LINK_KEY, next ? "1" : "0");
    enableLinkBridge(next);
  }

  async function togglePlay() {
    if (playing) {
      schedRef.current?.stop();
      setPlaying(false);
      setActiveDegree(null);
      return;
    }
    if (!voiceRef.current) voiceRef.current = await createVoice();
    await voiceRef.current.resume();
    voiceRef.current.setPreset(getPreset(voiceId));
    stateRef.current = initState();
    const sched = new Scheduler({
      now: () => voiceRef.current!.ctx.currentTime,
      lookaheadSec: 0.12,
      pull: () => {
        const params = knobsToParams(knobsRef.current, tuningRef.current.tonicHz);
        const r = nextEvent(stateRef.current, tuningRef.current.scaleCents, tuningRef.current.tonicHz, params, rngRef.current);
        stateRef.current = r.state;
        return r.event;
      },
      onNote: (e, time) => {
        voiceRef.current!.pluck(e.pitchHz, e.velocity, e.glideFromHz);
        const delayMs = Math.max(0, (time - voiceRef.current!.ctx.currentTime) * 1000);
        setTimeout(() => setActiveDegree(e.degreeIndex), delayMs);
      },
      onRest: () => {},
      // Snap onsets to the half-beat grid only while Link is engaged+connected;
      // identity otherwise, so free timing is unchanged.
      quantize: (rawTime) =>
        linkActiveRef.current ? clockRef.current.nextGridTime(rawTime, 0.5) : rawTime,
    });
    schedRef.current = sched;
    sched.run(25);
    setPlaying(true);
  }

  const linkLabel = !linkEnabled
    ? "● free  ○ link"
    : linkState.connected
      ? `○ free  ● link · ${linkState.tempo.toFixed(1)} BPM · ${linkState.peers} peer${linkState.peers === 1 ? "" : "s"}`
      : "○ free  ● link — searching…";

  return (
    <main className="mraga">
      <div className="row">
        <h1 style={{ margin: 0, letterSpacing: 2 }}>mraga</h1>
        <span className="chip">◈ linked: {tuning.label}</span>
      </div>

      <div className="row" style={{ margin: "16px 0" }}>
        <input
          className="link-field"
          placeholder="paste mdrone link …"
          value={linkInput}
          aria-label="mdrone link"
          onChange={(e) => setLinkInput(e.target.value)}
          onBlur={loadLink}
        />
        <button className="play" onClick={togglePlay}>{playing ? "■ STOP" : "▶ PLAY"}</button>
      </div>

      <PitchLadder scaleCents={tuning.scaleCents} activeDegree={activeDegree} />

      <div className="knobs">
        <Knob label="DENSITY" lowPole="sparse" highPole="busy" value={knobs.density} onChange={(v) => setKnobs({ ...knobs, density: v })} />
        <Knob label="REGISTER" lowPole="low" highPole="high" value={knobs.register} onChange={(v) => setKnobs({ ...knobs, register: v })} />
        <Knob label="RESTLESS" lowPole="calm" highPole="roam" value={knobs.restlessness} onChange={(v) => setKnobs({ ...knobs, restlessness: v })} />
        <Knob label="SILENCE" lowPole="full" highPole="spacious" value={knobs.silence} onChange={(v) => setKnobs({ ...knobs, silence: v })} />
      </div>

      <div className="row chip">
        <button
          onClick={cycleVoice}
          aria-label="voice"
          style={{ background: "none", border: "none", color: "inherit", font: "inherit", cursor: "pointer", padding: 0 }}
        >
          VOICE {VOICE_LABELS[voiceId]}
        </button>
        <button
          onClick={toggleLink}
          aria-label="timing mode"
          style={{ background: "none", border: "none", color: "inherit", font: "inherit", cursor: "pointer", padding: 0 }}
        >
          TIMING {linkLabel}
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck and run the unit suite**

Run: `npx tsc -b --noEmit && npx vitest run`
Expected: typecheck clean; full unit suite green (unchanged count — App has no unit tests).

- [ ] **Step 3: Build to confirm the app bundles**

Run: `npm run build`
Expected: build succeeds. Then `rm -rf dist`.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: voice selector + live Ableton Link toggle in the footer"
```

---

### Task 8: Final verification + README note

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a short section to `README.md`** documenting the two features. Append before the License line:

```markdown
## Ableton Link (optional)

mraga can lock its note onsets to the shared m-family tempo via the **mpump Link Bridge**
companion app (`ws://localhost:19876`). Toggle `link` in the footer; with the bridge running,
onsets snap to a ½-beat grid. mraga only follows the tempo (it never drives it), and falls back
to free timing when the bridge isn't running.

## Voices

Six struck/plucked flavours (santoor · koto · sitar · mallet · qanun · kalimba), one parameterized
Karplus–Strong voice. Click the `VOICE` label in the footer to cycle; the choice is remembered.
```

- [ ] **Step 2: Full verification pass**

Run: `npm run build:worklet && npx tsc -b --noEmit && npx vitest run && npm run build`
Expected: worklet builds; typecheck clean; all unit tests pass (MVP 45 + voicePresets 5 + linkClock 6 + scheduler's 2 new = 58); production build succeeds. Then `rm -rf dist`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document Ableton Link + voice palette"
```

- [ ] **Step 4: Manual verification (no automated coverage)** — note for the human reviewer:
  - With the Link bridge running and Ableton/mdrone setting a tempo, toggle `link`: mraga's onsets audibly lock to the ½-beat grid; stopping the bridge falls back to free timing.
  - Cycle the `VOICE` label through all six flavours: each is audibly distinct; **santoor** matches the MVP voice.

---

## Self-review notes

- **Spec coverage — Ableton Link:** copy `linkBridge.ts` (T4) ✓; `linkClock` beat↔time + ½-beat snap (T2) ✓; scheduler `quantize` hook with raw-timeline-preserved + monotonic guard (T3) ✓; follow-only — `sendLinkTempo`/`sendLinkPlaying` never called (T7) ✓; footer toggle, `mraga-link-enabled`, tempo/peer status, auto-detect-on-load, disconnect→free fallback via `linkActiveRef`/`reset` (T7) ✓. Non-goals (no tuning sync, no bridge edits, no Link e2e) respected.
- **Spec coverage — voice palette:** six flavours as KS param sets (T1) ✓; parameterized `KSVoice` brightness/damping/decay/jawari (T5) ✓; `preset` message (T5) ✓; `setPreset` host (T6) ✓; footer selector + `mraga-voice` persistence + santoor default == MVP (T1 baseline + T7) ✓. Non-goals (no blend, no additive synth, no FX change) respected.
- **Type consistency:** `KSParams` defined in `voicePresets.ts` (T1), imported by `voice.ts` (T6) and flowing as the `preset` message `params` to `KSVoice.setParams` (T5) — field names brightness/damping/decay/jawari consistent across all three. `LinkClock.nextGridTime(t, 0.5)` signature consistent between T2 and the T7 `quantize` closure. `SchedulerOpts.quantize?: (rawTime:number)=>number` (T3) matches the T7 call site. `LinkState` shape (T4 import) matches the T7 initial state literal.
- **Placeholder scan:** preset numbers and jawari/excitation formulas are concrete (flagged tune-by-ear, but real values given); no TBD/TODO.
- **Known soft spots flagged inline:** jawari uses a stable output-only `tanh` shaper (not in the feedback loop) to avoid destabilizing KS; santoor params are chosen to match the MVP rather than being bit-identical; the linkClock carries a small fixed latency offset vs absolute Link time (all clients share it) — documented as a future refinement in the spec.
```
