# mraga — Ableton Link tempo lock — design spec

_Date: 2026-05-30 · Status: design approved, pre-planning · Depends on: mraga MVP (branch `feat/mvp`)_

> **For the planning session:** This is the approved output of a brainstorming session. Read it, then
> invoke **superpowers:writing-plans** to turn it into a test-first implementation plan. The crown-jewel
> unit here is `linkClock` (pure beat↔time math) — test it thoroughly, like the engine in the MVP.

---

## 1. What this adds

An **optional Ableton Link tempo lock** for mraga. When engaged, mraga **quantizes its note onsets to a
slow grid** derived from the shared m-family tempo, so the improviser locks to the same pulse as mdrone /
mpump / Ableton — while keeping its free/ametric *character* (the engine still decides which notes play
and when it breathes/rests). When disengaged or when the bridge isn't running, mraga plays in free time
exactly as it does in the MVP.

mraga reuses the **existing** Ableton Link bridge that mdrone and mpump already use (the Tauri/`rusty_link`
app in `mpump/link-bridge`, a WebSocket server on `ws://localhost:19876`). **The bridge is used as-is and
is NOT modified by this work.**

## 2. Locked decisions

These were each chosen explicitly during brainstorming:

1. **Timing model:** *quantize onsets to a slow grid*. The engine's event stream (which note, rest-or-not,
   density, breathing) is unchanged; only each note's **scheduled onset time** is snapped to the grid.
2. **Direction:** *follow-only*. mraga reads `tempo`/`beat`/`phase`; it never sends `set_tempo` or
   `set_playing`. It joins the shared pulse without contesting transport control.
3. **Grid:** *fixed nearest ½-beat* (eighth-note grid). No subdivision UI this iteration (a subdivision
   control is a possible later enhancement).
4. **Fallback:** Link is optional. Enabled-but-not-connected or a mid-session disconnect ⇒ silently fall
   back to free timing (mirrors mdrone).

## 3. Explicitly out of scope (non-goals)

- **Live tuning sync is NOT included.** "Change tuning on mdrone → mraga retunes" was considered and
  dropped: the bridge as-is carries only Link timing (no tuning field) and will not be modified, and
  mdrone/mraga are **different origins** so `BroadcastChannel`/`localStorage` cannot bridge them either.
  There is no channel to carry tuning without modifying the bridge, so a mraga-side subscriber would be
  permanent dead code. Tuning continues to come from the **pasted mdrone share link** (MVP behavior).
- **No bridge or mdrone changes.** This work touches the mraga repo only.
- **mraga does not own/drive tempo or transport.** Follow-only.
- **No e2e/integration test for Link** (it requires the running native bridge). Verified by unit tests on
  the pure math + scheduler hook, and by manual testing with the bridge running.

## 4. The bridge contract (existing — for reference only)

From `mdrone/src/engine/linkBridge.ts` and `mpump/link-bridge`:

- **Transport:** WebSocket. The client tries, in order, `ws://127.0.0.1:19876`, `ws://[::1]:19876`,
  `ws://localhost:19876`. Broadcasts at ~20 Hz (50 ms).
- **Inbound message (bridge → client):**
  ```json
  { "type": "link", "tempo": 120.0, "beat": 2.5, "phase": 0.575,
    "playing": true, "peers": 1, "clients": 2 }
  ```
  `phase` is within a bar of quantum 4 (0..3.999). `beat` is the running beat position (float).
- **Outbound (client → bridge):** `{"type":"set_tempo","tempo":N}`, `{"type":"set_playing","playing":B}`.
  **mraga sends neither** (follow-only).
- **Reusable client** (`mdrone/src/engine/linkBridge.ts`, 157 lines, copy verbatim into
  `mraga/src/engine/linkBridge.ts`). Public interface:
  ```ts
  interface LinkState { tempo: number; beat: number; phase: number; playing: boolean;
                        peers: number; clients: number; connected: boolean; }
  function enableLinkBridge(on: boolean): void;
  function onLinkState(fn: (s: LinkState) => void): () => void; // returns unsubscribe
  function sendLinkTempo(tempo: number): void;   // unused by mraga
  function sendLinkPlaying(playing: boolean): void; // unused by mraga
  function getLinkState(): LinkState;
  function autoDetectLinkBridge(): void; // try once on load, give up silently
  ```
  Behavior: optional, auto-detect on load, retry every 5 s when explicitly enabled, app runs fine without
  the bridge. The only mraga-specific change vs the mdrone copy: the persistence/storage key, namespaced
  `mraga-link-enabled` (see §7). If the storage key lives outside `linkBridge.ts` in mdrone (in
  `config.ts`), keep `linkBridge.ts` verbatim and own the key in mraga's app/config layer.

## 5. Architecture (units, one purpose each)

1. **`linkBridge`** — `src/engine/linkBridge.ts`, copied verbatim from mdrone. WebSocket transport +
   connection lifecycle. Not unit-tested (proven m-family code; no logic added).
2. **`linkClock`** *(new, pure — the crown jewel)* — `src/linkClock.ts`. Maintains a local linear
   beat↔audio-time model and snaps a time to the grid. No WebSocket, no `AudioContext` inside it.
3. **`scheduler`** — `src/scheduler.ts` (existing) gains one optional hook: `quantize?(rawTime) => time`.
   Free mode: omitted (identity). Link mode: the linkClock's grid-snapper.
4. **`App` + footer** — `src/App.tsx` and the footer `free ○ link` toggle. Wires `enableLinkBridge`,
   subscribes via `onLinkState`, feeds `linkClock`, supplies `quantize` to the scheduler when engaged,
   shows tempo/peer status, persists the setting.

### Data flow
```
                          (20 Hz)
link bridge ──{type:"link", tempo, beat}──▶ onLinkState ─▶ linkClock.update(tempo, beat, ctx.currentTime)
                                                                     │
engine ─▶ events(ioiSec) ─▶ scheduler.rawTime += ioiSec             │ linkClock.nextGridTime(rawTime, 0.5)
                                  │                                  ▼
                                  └────────── onset = quantize(rawTime) ──▶ voice.pluck @ onset
```

## 6. `linkClock` — the timing math

### State
`{ tempo: number; beatRef: number; timeRef: number; valid: boolean }` — `valid` is false until the first
`update` (before that, callers must not quantize; App only enables quantize when connected).

### API (all pure given current state)
- `update(tempo: number, beat: number, audioNow: number): void` — store `tempo`, `beatRef = beat`,
  `timeRef = audioNow`, `valid = true`. Called from the `onLinkState` subscription with
  `audioNow = voice.ctx.currentTime` captured at message arrival.
- `beatAt(t: number): number` → `beatRef + (t - timeRef) * tempo / 60`.
- `timeAtBeat(b: number): number` → `timeRef + (b - beatRef) * 60 / tempo`.
- `nextGridTime(t: number, subdivBeats = 0.5): number` → `timeAtBeat(ceil(beatAt(t) / subdivBeats) *
  subdivBeats)`. The next grid line **at or after** `t`. (Uses a tiny epsilon so a `t` already exactly on
  a line returns that line, not the next one.)
- `reset(): void` — set `valid = false` (on disconnect).

### Notes / known tuning items
- The model assumes the message's `beat` is current as of `audioNow`. Real latency (WebSocket + 20 Hz
  polling ≈ 50–100 ms) means a small fixed offset vs absolute Link time. All m-family clients share the
  bridge and similar latency, so they stay aligned **with each other**; absolute alignment to Ableton may
  carry a constant offset. A latency-compensation constant is a possible later refinement — out of scope.
- Continuous re-`update` every 50 ms keeps tempo drift negligible between updates.

## 7. Scheduler integration

`SchedulerOpts` gains: `quantize?: (rawTime: number) => number`.

In `tick()`, the **raw timeline advances by `ioiSec` exactly as today** (preserving the engine's intended
density/breathing). For **note** events only, the scheduled onset is:

```
let onset = this.opts.quantize ? this.opts.quantize(this.nextTime) : this.nextTime;
// monotonic guard: never schedule a note before/at the previous note's onset, and never in the past
if (onset <= this.lastOnset) onset = this.opts.quantize ? this.opts.quantize(this.lastOnset + EPS) : onset;
this.lastOnset = onset;
```
Then `onNote(e, onset)`. Rest events do not produce sound and are not quantized; they still advance the
raw timeline by their `ioiSec`. `lastOnset` is reset in `start()`.

Design intent: quantizing snaps onsets to the ½-beat grid while the *spacing between* onsets continues to
follow the engine (a long rest pushes `rawTime` far ahead, so the next note lands on a later grid line —
the breathing survives). Quantization naturally caps effective density at the grid rate; collisions push
to the next line via the monotonic guard.

## 8. UI & state

- **Footer toggle:** the existing `TIMING ● free ○ link` becomes interactive. Clicking `link` calls
  `enableLinkBridge(true)` and persists `localStorage["mraga-link-enabled"] = "1"`; clicking `free` calls
  `enableLinkBridge(false)`. On load, read the key and `autoDetectLinkBridge()` / `enableLinkBridge`
  accordingly (mirror mdrone's auto-detect-on-load behavior).
- **Status text:**
  - Link off → `free`.
  - Link on, not connected → `link — searching…`.
  - Link on, connected → `link · {tempo.toFixed(1)} BPM · {peers} peer{s}`.
- **Behavior:** App holds the `linkClock` and a live `LinkState`. The `quantize` hook handed to the
  scheduler is active only when `linkEnabled && linkState.connected`; otherwise omitted (free timing). On
  disconnect, `linkClock.reset()` and the scheduler returns to free timing on the next tick without
  interrupting playback.
- Storage key namespaced `mraga-link-enabled` (consistent with the MVP's `mraga-*` convention).

## 9. Testing (test-first)

- **`linkClock`** (most important): `beatAt`/`timeAtBeat` are inverses; a known model
  (`tempo=120, beatRef=0, timeRef=0`) maps grid lines correctly; `nextGridTime` returns the next ½-beat
  at-or-after `t` (including the on-line/epsilon case); changing tempo via `update` shifts the mapping;
  `nextGridTime` is monotonic non-decreasing for increasing `t`; `valid` gating.
- **`scheduler`**: with an injected `quantize` that snaps to a fixed grid, note onsets land on grid lines,
  onsets are strictly increasing (monotonic guard), the raw timeline still advances by `ioiSec`, and rest
  events are not quantized; with no `quantize`, behavior is identical to the existing free tests.
- **`linkBridge`**: not re-tested (verbatim copy; transport only).
- **Manual**: with the bridge running and Ableton/mdrone setting a tempo, toggling `link` audibly locks
  mraga's onsets to the ½-beat grid; stopping the bridge falls back to free timing.

## 10. How to continue

1. Review this spec.
2. Invoke **superpowers:writing-plans** for a test-first plan: copy `linkBridge.ts`; build `linkClock`
   (+ tests) first; add the scheduler `quantize` hook (+ tests); then wire `App`/footer; manual-verify
   with the bridge.
