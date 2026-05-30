# mraga — design spec

_Date: 2026-05-30 · Status: design approved, pre-implementation · License target: AGPL-3.0-or-later_

> **For the build session:** This document is the complete, self-contained output of a
> brainstorming session. Open a Claude Code session with this repo (`../mraga`) as the
> working directory, read this spec, then proceed to the **superpowers:writing-plans**
> skill to turn it into an implementation plan. Do not start coding before the plan exists.
> A test-first culture is expected (mirror mdrone: vitest unit + Playwright e2e).

---

## 1. What mraga is

**mraga** is a self-contained, browser-native instrument: a **conductable generative foreground
voice** that plays a struck-and-ringing melodic line **in the exact tonic and microtonal scale of
an [mdrone](../mdrone) drone**. The drone is the ground; mraga is the line over it.

You don't pick notes — you **conduct**: four controls shape *how* an autonomous improviser moves
(how often it speaks, where it sits, how restless it is, how much it breathes). It already "knows
the raga" because it derives its behaviour from the scale it is handed.

It is the melodic/foreground companion to mdrone (a sustained drone instrument). It is a **separate,
independent tool** in the same "m-family" (cf. mpump, mloop), not a feature inside mdrone — mdrone is
already large, and a sibling that couples loosely keeps both instruments focused.

### Musical rationale
A drone is a *ground* that does not move. Across the traditions that use drones, the companion is
whatever moves against that stillness — and the deepest, oldest relationship is a **melodic foreground
voice locked to the drone's tonic**: *tanpura → sitar/voice*, *sruti box → raga*, La Monte Young's
sine drones under sung lines, bagpipe chanter over drones. mdrone is the bed; nothing yet plays *over*
it in the same tuning. mraga is that missing half. Because mdrone supports **arbitrary microtonal
tables**, mraga's value is being **tuning-aware** in a way no generic looper/arpeggiator can be — it
plays in the drone's exact cents, so the two never beat against each other.

---

## 2. Locked design decisions

These were each chosen explicitly during brainstorming:

1. **Role:** foreground melodic voice over the drone (not texture/processor/motion).
2. **Playing model:** *steerable generative* — you conduct an autonomous voice; you do not hand-play notes.
3. **Coupling to mdrone:** **adopt a scene link** — paste an mdrone share URL; mraga reads the tonic
   + microtonal cents out of it. (Ableton Link for tempo and live cross-tab sync are *later* enhancements.)
4. **Voice timbre:** **struck / plucked / decaying** at its core (santoor / koto / sitar / mallet family) —
   transient-over-sustain is how a foreground reads against a drone. Grows into a small palette of
   decaying flavours later (D).
5. **Timing:** **free / ametric by default** (notes fall by probability and breath, like an *alap*),
   with an **optional Link-lock** later.
6. **Generative brain:** a **scale-aware gravity walk** (decision §4 below), flavoured with idiomatic
   touches (tonic gravity, resting-note weighting, breathing phrase-ends, glides) **without locking to
   named ragas** — behaviour is derived from the scale geometry so it works on *any* tuning mdrone hands it.

---

## 3. MVP scope (v0.1)

The smallest version that is musically real:

**In:**
- Paste an **mdrone share link** → extract tonic + scale cents.
- **One** struck/ringing voice (santoor-ish).
- The **scale-aware gravity-walk** engine (§4).
- **Four conducting knobs:** DENSITY · REGISTER · RESTLESSNESS · SILENCE (§5).
- **Free / ametric** timing; PLAY / STOP.
- A live **pitch-ladder** visual: the scale degrees + the note currently sounding (§6).
- A built-in light **reverb** send so the voice sits in ambient space.

**Deferred (post-MVP):** voice palette (multiple flavours) · Ableton Link lock · live cross-tab sync
with mdrone · presets · audio recording/export · scene sharing of mraga's own state · richer
visualizers · MIDI.

---

## 4. The generative engine — scale-aware gravity walk

The heart of mraga. It must be a **pure, deterministic-given-seed module** with no audio dependencies,
so it can be unit-tested in isolation (this is the most important architectural constraint).

### 4.1 Inputs
- `scaleCents: number[]` — the sounding scale degrees within one octave, in cents, sorted ascending,
  starting at 0 (the tonic). Derived from the mdrone link's tuning table.
- `tonicHz: number` — pitch of degree 0.
- `params` — the conducting parameters (mapped from the four knobs, see §5).
- `rng` — a seeded PRNG so a given seed reproduces a given improvisation.
- internal `state` — current position in the scale lattice, current phrase progress, dwell counters.

### 4.2 Pitch lattice
Notes live on a lattice of `(degreeIndex, octave)`: the pitch of a lattice point is
`tonicHz * 2^((scaleCents[degreeIndex] + 1200 * octave) / 1200)`. The walk moves up/down this lattice
by scale steps (wrapping degree index across octave boundaries).

### 4.3 Per-step decision (produces the next event)
Each step the engine emits **either a note or a rest**, then advances state:

1. **Rest?** With probability `pRest` (rises with SILENCE), emit a `Rest` of a breath-length duration
   and (sometimes) end the current phrase.
2. **Otherwise pick the next pitch** from the current lattice position:
   - **Step-size distribution:** mostly ±1 scale step; occasional leaps (±2…±4). RESTLESSNESS widens
     the variance and raises leap probability.
   - **Tonic gravity:** bias the move *toward the tonic* with strength proportional to current distance
     from home; the further the line strays, the stronger the pull back. RESTLESSNESS weakens this.
   - **Resting-note weighting:** degrees that are consonant against the drone (the tonic; the degree
     nearest a 3:2 fifth ≈ 702¢; secondarily the 4th ≈ 498¢ and a strong 3rd) attract longer **dwell**
     and are preferred **phrase-ending** targets. Detect them by cents-proximity, not by named-raga rules.
   - **Register bounds:** REGISTER sets a centre pitch and an allowed span; moves that exceed the span
     are reflected back inward.
3. **Glide (meend):** with some probability a note **portamentos** from the previous pitch over part of
   its onset interval — an idiomatic touch, kept subtle.
4. **Phrase breathing:** notes group into short **phrases** of varying length; a phrase tends to resolve
   onto a resting note and is followed by a longer pause. This is what makes it sound *intentional*
   rather than random.

### 4.4 Timing (free mode)
- DENSITY sets the **mean inter-onset interval (IOI)**; actual IOI has gentle (e.g. log-normal) jitter so
  it never feels mechanical. Rough range: ~4 s (very sparse) → ~0.4 s (busy).
- Note duration is a hint only — the struck voice rings and decays naturally; overlapping rings are
  expected (hence a small voice pool, §7).

### 4.5 Output
A stream of events consumed by the scheduler:
```ts
type NoteEvent = {
  kind: "note";
  pitchHz: number;
  glideFromHz?: number;   // present when gliding
  velocity: number;       // 0..1
  ioiSec: number;         // time until the next event
  durationHint: number;   // seconds; voice may ring longer
};
type RestEvent = { kind: "rest"; ioiSec: number; phraseEnd: boolean };
type EngineEvent = NoteEvent | RestEvent;
```
The engine exposes something like `nextEvent(state, scale, params, rng) -> { event, state }` — pure,
no side effects, no `AudioContext`.

---

## 5. Conducting controls (the four knobs)

| Knob | Feel | Maps to |
|---|---|---|
| **DENSITY** | sparse ↔ busy | mean IOI (note rate) |
| **REGISTER** | low ↔ high | centre pitch of the walk (span fixed-moderate in MVP; could become a 2D centre×spread pad later) |
| **RESTLESSNESS** | calm/home-bound ↔ wandering | step-size variance + leap probability; inversely, tonic-gravity strength and resting-note dwell |
| **SILENCE** | full ↔ spacious | rest probability + phrase-pause frequency/length |

The idiomatic touches (tonic gravity, resting notes, breathing, glide) are **always on** at tasteful
defaults; the knobs modulate them. Exact ranges/curves are to be tuned by ear during implementation.

---

## 6. Layout (single screen, mdrone's warm parchment/ember aesthetic)

```
┌──────────────────────────────────────────────────────────┐
│  mraga                    ◈ linked: C · mdrone-signature   │
│  [ paste mdrone link … ]                         [ ▶ PLAY ]│
├──────────────────────────────────────────────────────────┤
│                                                            │
│        ·     ·     ●     ·     ·      ·     ·               │  pitch ladder:
│       Sa    r     R     g     G      m    ...              │  lit dot = note sounding now
│                                                            │
├──────────────────────────────────────────────────────────┤
│   DENSITY       REGISTER       RESTLESS       SILENCE       │
│     (◯)           (◯)            (◯)            (◯)          │
│  sparse↔busy   low↔high       calm↔roam    full↔spacious    │
├──────────────────────────────────────────────────────────┤
│   VOICE santoor                  TIMING  ● free   ○ link    │
└──────────────────────────────────────────────────────────┘
```

- **Header:** instrument name; a status chip showing the linked drone (tonic + tuning label); a link
  paste field; PLAY/STOP.
- **Pitch ladder** is mraga's signature visual — it makes the microtuning *visible* and turns "watching
  the improviser think" into the ambient visual. Each scale degree is a dot along a vertical/horizontal
  ladder; the currently sounding degree lights and decays.
- **Knobs:** the four conducting controls with their plain-language poles (note: mdrone's own
  Plain/Poetic caption convention is a good pattern to mirror).
- **Footer:** voice label (one voice in MVP) and a free/link timing toggle (link disabled/"soon" in MVP).

---

## 7. Architecture (units with one clear purpose)

Keep each unit small, single-purpose, and independently testable.

1. **`linkImport`** — parse an mdrone share URL → `PortableTuning { tonicHz, scaleCents[], label }`.
   Pure, testable. See §8 for the mdrone link format.
2. **`tuning`** — pitch math: build the lattice, `degreeToHz`, resting-note detection (cents proximity
   to 0/702/498/strong-3rd). Pure.
3. **`engine`** — the gravity-walk generator (§4). **Pure, seeded, no audio.** The crown-jewel unit; the
   most thoroughly tested.
4. **`scheduler`** — a Web Audio **lookahead scheduler** (standard pattern: a timer wakes ~every 25 ms and
   schedules any events due in the next ~100 ms via `AudioContext.currentTime`). Pulls events from the
   engine, triggers the voice. Free timing in MVP; Link later swaps the clock source.
5. **`voice`** — an **AudioWorklet** struck-string/mallet synth with a small **voice pool** (e.g. 8) so
   rings overlap, plus a reverb send for ambient space. Candidate synthesis: Karplus–Strong pluck (bright
   excitation, moderate damping) for santoor/koto character, or a few fast-decaying detuned partials.
   Choose by ear; KS is the recommended starting point (and is well-trodden in mdrone's tanpura voice).
6. **`conducting`** — maps the four UI knob values (0..1) to engine `params`. Pure.
7. **`PitchLadder`** — the visual; reads the engine's current degree + a decay envelope.
8. **React UI** — header, knobs, ladder, footer. Thin; logic lives in the units above.

### Data flow
```
mdrone link ─▶ linkImport ─▶ tuning model ─┐
                                           ▼
   knobs ─▶ conducting ─▶ params ─▶ [ engine ] ─▶ events ─▶ scheduler ─▶ voice ─▶ output
                                        │
                                        └─ current degree ─▶ PitchLadder
```

---

## 8. The mdrone share-link format (for `linkImport`)

mraga must decode the same links mdrone produces. From mdrone's `src/shareCodec.ts` and `src/session.ts`:

- Query param **`?z=<payload>`** — DEFLATE-compressed then **URL-safe base64**. (Primary form.)
- Query param **`?b=<payload>`** — plain base64, no compression. (Fallback form.)
- Short links via `s.mdrone.org/<id>` 302-redirect to one of the above (follow the redirect, then decode).
- Decoded payload is a JSON **portable scene** (v1/v2 envelope; see mdrone's `normalizePortableScene`).
  mraga needs only two things from it:
  - the **tonic** (a note name + octave → `tonicHz`, or a stored root frequency), and
  - the **tuning** — the **per-degree cents** of the active microtonal table (mdrone's 13-degree table /
    `customTuning` cents), from which `scaleCents[]` is built.

**Implementation note:** the cleanest route is to **port mdrone's `shareCodec` decoder** (deflate +
url-safe-b64) and the relevant slice of its scene schema into mraga, or vendor a small shared decoder.
The build session should open `../mdrone/src/shareCodec.ts` and `../mdrone/src/session.ts` for the exact
byte format and field names, and write a round-trip test against a real mdrone link. Keep mraga's reader
**tolerant** (clamp/fallback like mdrone's normalizer) so a malformed or future-version link degrades to
a sensible default scale rather than crashing.

---

## 9. Tech stack (mirror mdrone for family consistency)

- **React 19 + Vite + TypeScript**, ES modules.
- **Web Audio API + AudioWorklet** for the voice (build-time worklet concatenation if needed, as mdrone does).
- **PWA**: service worker for offline + "install", versioned cache (mdrone's pattern).
- **AGPL-3.0-or-later**.
- **Testing:** `vitest` unit (engine, tuning, linkImport, conducting mapping) + Playwright e2e smoke later.
- **Storage keys** namespaced `mraga-*` (mdrone namespaces `mdrone-*` "so mpump/mloop don't collide").

---

## 10. Testing approach (test-first)

The pure units make this clean — write tests before implementation:

- **`linkImport`**: round-trips a known real mdrone `?z=`/`?b=` link to the expected `{tonicHz, scaleCents}`;
  tolerant of garbage (returns a sensible default, never throws).
- **`tuning`**: `degreeToHz` matches `2^(cents/1200)` math; lattice spans octaves correctly; resting-note
  detection picks tonic + ~702¢.
- **`engine`** (most important): deterministic for a fixed seed; **tonic gravity** statistically returns the
  line home; respects **register bounds**; **SILENCE** raises rest fraction; **DENSITY** changes mean IOI;
  **RESTLESSNESS** widens step-size variance; phrases resolve onto resting notes.
- **`conducting`**: knob 0..1 → params mapping is monotonic and within expected ranges.

---

## 11. Open items for the build session (tune by ear / decide during planning)

- Exact knob curves and ranges (IOI bounds, register span, gravity strength, rest/leap probabilities).
- Voice synthesis method (Karplus–Strong vs additive decaying partials) and its parameters; reverb amount.
- Glide probability and timing; phrase-length distribution; dwell lengths.
- Pitch-ladder orientation and how degree labels are shown (Sa/Re… vs cents vs scale index).
- Whether to vendor or re-implement mdrone's `shareCodec` decoder.

---

## 12. Roadmap after MVP

1. **Voice palette** (decision D): a few struck/decaying flavours to blend.
2. **Ableton Link lock** — join the m-family tempo; quantize note placement to a slow grid when engaged.
3. **Live cross-tab sync** — when mdrone and mraga run in the same browser, lock tonic/scale in real time
   (BroadcastChannel) so retuning the drone retunes mraga.
4. Presets, audio export, mraga-scene sharing, richer visualizers, MIDI.

---

## 13. How to continue

1. Confirm/adjust this spec (you, the user — review it).
2. In a Claude Code session rooted at `../mraga`, invoke **superpowers:writing-plans** to produce a
   step-by-step implementation plan from §3 (MVP) + §7 (architecture), test-first.
3. Build the pure units first (`tuning`, `engine`, `linkImport`, `conducting`) with their tests, then the
   `scheduler` + `voice`, then the React UI + pitch ladder.
