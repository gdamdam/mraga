# Architecture

## Layering (strict)

```
┌───────────────────────────────────────────────────────────────┐
│ UI (React)          src/App.tsx, src/components/*             │
│   state ↔ localStorage; refs bridge into the timing layer     │
├───────────────────────────────────────────────────────────────┤
│ Timing              src/scheduler.ts, src/linkClock.ts        │
│   lookahead scheduler ("two clocks"); never touches React     │
├───────────────────────────────────────────────────────────────┤
│ Pure musical core   src/engine.ts, src/ragas.ts, src/arc.ts,  │
│   src/tuning.ts, src/conducting.ts, src/rng.ts,               │
│   src/tanpura.ts (cycle fn), src/recorder.ts (WAV encode),    │
│   src/mragaScene.ts, src/shareCodec.ts, src/midi.ts (hzToMidi)│
│   → deterministic, no audio/DOM/Date/Math.random; unit-tested │
├───────────────────────────────────────────────────────────────┤
│ Audio               src/voice.ts (graph) +                    │
│   src/engine/voices/*.js → built into voiceProcessor.js       │
├───────────────────────────────────────────────────────────────┤
│ Transport           src/engine/linkBridge.ts (Ableton Link),  │
│   src/transport/mbus/ (vendored WebRTC patchbay client)       │
└───────────────────────────────────────────────────────────────┘
```

## The engine (src/engine.ts)

`nextEvent(state, scaleCents, tonicHz, params, rng) → {event, state}` — a
pure step function. Events are notes (pitch, velocity, IOI, glide) or rests.

Key internals:
- **Step lattice**: a pitch is an integer `stepPos = octave * scaleLen +
  degreeIndex` (src/tuning.ts). All contour math is on step positions.
- **Phrases**: each phrase is precomputed — a directed contour toward a
  *resting* target, or a repeat of the previous motif (deltas + rhythm), or
  (with a raga) the **pakad**. Rhythm is integer multiples of the base pulse.
- **Resting notes** (src/tuning.ts `restingNotes`): consonance against the
  drone by cents proximity (tonic 1.0, fifth 0.8, fourth 0.5, third 0.45).
  `nearestRestingStep` discounts distance by strength, so stronger resting
  notes (and a raga's boosted vadi/samvadi) attract resolutions.
- **Direction masks**: `params.arohaMask` / `avarohaMask` gate which degrees
  are usable while moving up / down (raga ascent/descent). Without them the
  FOCUS palette (`focusedDegrees`) applies both ways. `allowed` = union.
- **Anti-stuck guard**: max two identical pitches in a row, then a nudge.
- **Conducting**: `params.pullDegree` overrides the fresh-contour target with
  the nearest lattice occurrence of that degree.

## Scheduler (src/scheduler.ts)

Standard tale-of-two-clocks: a 25 ms `setInterval` tick schedules every event
whose time falls in the lookahead window against `AudioContext.currentTime`.
Invariants:
- The time cursor advances **before** callbacks run (a throwing `onNote` must
  not stall the timeline — that caused an event-storm bug once; test covers it).
- Onsets are strictly monotonic; the optional `quantize` hook snaps onsets to
  a grid (internal BPM or Ableton Link) without changing how many events the
  engine produces.
- The tanpura runs its own Scheduler instance, free-timed, never quantized.

## Audio graph (src/voice.ts)

```
melody worklet ──► dry (0.85) ──► master ──► destination
      └────────► convolver ─► wet (0.35) ─► master ─► analyser (logo pulse)
drone worklet ──► droneGain ──► dry & convolver        master ─► recorder tap
                                                       master = mbus publish tap
```

- One `AudioWorkletNode("mraga-voice")` per role (melody / tanpura): each is a
  pool of 8 Karplus–Strong voices (round-robin, so rings overlap).
- KS voice: variable-length delay line with fractional read (enables glide /
  meend), one-pole loop lowpass (`brightness` shapes the sustained tone),
  per-sample `decay`, `jawari` tanh waveshaper (sitar buzz). Presets in
  src/voicePresets.ts — parameter sets, select-one, no blending.
- Recorder worklet ("mraga-recorder"): copies stereo quanta while armed,
  posts ~0.75 s batches as transferables; main thread concatenates and
  encodes WAV (src/recorder.ts, pure).

## Worklet build

AudioWorklet modules can't use ES imports portably, so
`scripts/build-worklet.mjs` concatenates `src/engine/voices/{shared,karplus,recorder}.js`
into `src/engine/voiceProcessor.js` (GENERATED — never edit it; edit the
parts). It runs automatically before `dev` and `build`. The generated file is
loaded via `import url from "./engine/voiceProcessor.js?url"`.

## Data flow for one note

UI knobs → refs → scheduler `pull()`:
1. effective knobs = user knobs, overridden by the arc trajectory if engaged
2. `knobsToParams(knobs, tonicHz)` (src/conducting.ts) → EngineParams
3. raga masks/boost/pakad merged in (src/ragas.ts), `pullDegree` from the ladder
4. `nextEvent(...)` → note/rest; scheduler assigns onset (maybe quantized)
5. `onNote`: worklet pluck + MIDI out + ladder light (playing-guarded timeout)
