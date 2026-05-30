# mraga — voice palette — design spec

_Date: 2026-05-30 · Status: design approved, pre-planning · Depends on: mraga MVP (branch `feat/mvp`)_

> **For the planning session:** Approved brainstorming output. Folded into the same work as the Ableton
> Link spec (`2026-05-30-mraga-ableton-link-design.md`); one combined implementation plan covers both.

---

## 1. What this adds

A **voice palette**: the user picks one of **six** struck/plucked decaying flavours instead of the single
fixed santoor of the MVP. All flavours are produced by **one parameterized Karplus–Strong voice** — each
flavour is a parameter set. **Select-one** (no per-note blending this iteration).

## 2. Locked decisions

1. **Select one preset at a time** (not blend). Each note uses the currently selected voice.
2. **One parameterized Karplus–Strong synth** — reuse the MVP's KS voice; flavours = parameter sets.
   (No second/additive synthesis path; truly inharmonic bells are out of scope because KS models them poorly.)
3. **Six flavours:** Santoor, Koto, Sitar, Mallet, Qanun, Kalimba.
4. Selection persists in `localStorage["mraga-voice"]`; default `santoor` (MVP parity).

## 3. The flavours

KS parameter axes:
- **`brightness`** (0..1) — lowpass cutoff applied to the initial excitation burst. High = bright/sharp
  attack, low = warm/soft.
- **`damping`** (≈0.49..0.50) — KS loop one-pole coefficient → sustain tone & length.
- **`decay`** (per-sample gain multiplier, ≈0.9999..0.99997) → overall ring length.
- **`jawari`** (0..1) — waveshaping nonlinearity in the loop (metallic buzz), borrowed from mdrone's
  `tanpura.js`. 0 for most flavours; high for sitar.

| flavour | brightness | damping | decay | jawari | character |
|---|---|---|---|---|---|
| **Santoor** | high | medium | medium | 0 | bright hammered-dulcimer (MVP baseline) |
| **Koto** | mid | high | long | 0 | warm zither, long ring, soft attack |
| **Sitar** | mid-high | high | long | high | buzzy jawari, metallic, sustained |
| **Mallet** | low | low | short | 0 | dark struck bar, marimba/woodblock |
| **Qanun** | high | low-mid | short-med | low | bright, dry, fast Middle-Eastern zither (pairs with maqam-rast) |
| **Kalimba** | mid | low | short | low | bell-ish thumb-piano pluck, slight buzz |

Exact numeric values are tuned by ear during implementation; the table fixes the *relative* design and the
parameter axes. Defaults must keep **Santoor audibly equal to the current MVP voice**.

## 4. Architecture (units, one purpose each)

1. **`voicePresets`** *(new, pure TS — the tested unit)* — `src/voicePresets.ts`.
   ```ts
   export type VoiceId = "santoor" | "koto" | "sitar" | "mallet" | "qanun" | "kalimba";
   export type KSParams = { brightness: number; damping: number; decay: number; jawari: number };
   export const VOICE_IDS: VoiceId[];                 // ordered, for the UI cycle
   export const VOICE_LABELS: Record<VoiceId, string>; // display names
   export const VOICE_PRESETS: Record<VoiceId, KSParams>;
   export function getPreset(id: string): KSParams;    // falls back to santoor for unknown ids
   ```
2. **`KSVoice`** — `src/engine/voices/shared.js`. Gains a `setParams({brightness,damping,decay,jawari})`;
   `pluck` filters the excitation by `brightness`, uses `damping` in the loop, `decay` for the gain
   envelope, and applies the `jawari` waveshaper in `render`. Keeps existing glide state.
3. **`MragaVoiceProcessor`** — `src/engine/voices/karplus.js`. Handles `{type:"preset", params}` →
   stores the active params and calls `setParams` on every pooled voice (or applies at next pluck). New
   plucks sound with the active preset. Velocity clamp stays.
4. **`voice` host** — `src/voice.ts`. Adds `setPreset(params: KSParams)` → `port.postMessage({type:"preset",
   params})`. `createVoice` posts the initial preset after the worklet loads.
5. **`App` + footer** — `src/App.tsx`. The static `VOICE santoor` footer label becomes an interactive
   selector cycling `VOICE_IDS` (click to advance; shows the current `VOICE_LABELS[id]`). On change:
   persist `mraga-voice`, call `voice.setPreset(getPreset(id))` (only if audio exists). On load: read
   `mraga-voice`, default `santoor`; apply once audio is created on first PLAY.

### Data flow
```
UI voice selector ─▶ getPreset(id) ─▶ voice.setPreset(params) ─▶ worklet {type:"preset"} ─▶ KSVoice.setParams
engine note events ─▶ voice.pluck(freq, vel, glide) ─▶ pooled KSVoice (sounds with active params)
```

## 5. Out of scope (non-goals)

- **No blending / layering** of voices (select-one only).
- **No additive/FM/bell synthesis** — KS only; no inharmonic metallophone/glass voices.
- **No per-flavour reverb or FX changes** — the MVP reverb send is unchanged.
- **No preset save/recall of full mraga state** — only the active voice id is persisted.

## 6. Testing (test-first)

- **`voicePresets`** (the unit-testable part): all six `VOICE_IDS` have a preset; every preset's params are
  within valid ranges (brightness 0..1, jawari 0..1, damping in the safe KS band, decay < 1); labels exist
  for every id; `getPreset` returns santoor for an unknown id; santoor's params match the documented MVP
  baseline values.
- **Audio (`KSVoice`/worklet/`voice`)**: not unit-tested (audio thread) — verified by `npm run
  build:worklet` succeeding, the generated `voiceProcessor.js` containing the new `setParams`/preset
  handling, `tsc`/`vitest` staying green, and **manual** listening that each flavour is audibly distinct
  and Santoor matches the MVP.

## 7. How to continue

Combined with the Ableton Link spec into one **superpowers:writing-plans** plan. Suggested order: build
the pure units first (`voicePresets`, plus Link's `linkClock`) with tests, then the worklet/voice changes,
then the App/footer wiring for both features.
