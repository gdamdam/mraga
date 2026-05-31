# mraga

**Live: https://gdamdam.github.io/mraga/**

A conductable generative foreground voice for the m-family. Paste an
[mdrone](https://mdrone.org) share link; mraga plays a struck/ringing melodic
line locked to the drone's tonic and microtonal scale. You don't pick notes —
you **conduct** an autonomous improviser with a handful of controls.

## Conduct it

Seven knobs shape *how* the line moves:

- **DENSITY** — sparse ↔ busy (note rate / pulse).
- **REGISTER** — low ↔ high (centre pitch).
- **RESTLESS** — calm ↔ roam (how far the melody wanders).
- **SILENCE** — full ↔ spacious (rests and breathing).
- **RHYTHM** — loose ↔ tight (rubato vs. a metronomic pulse).
- **THEME** — free ↔ locked (how strongly it repeats one motif — turn up for less random).
- **FOCUS** — wide ↔ tight (narrows the note palette toward a few characteristic degrees).

Plus: a **voice** palette (santoor · koto · sitar · mallet · qanun · kalimba),
**octave** shift, **volume**, a **🎲 reroll** (the seed is shown and saved in the
share link), and **SHARE** (a link that restores the exact sound). Hover any
control for a tooltip.

### Timing

- **free** — ametric (default).
- **bpm** — snap note onsets to an internal ½-beat grid (set the BPM).
- **link** — snap to the shared m-family tempo via the
  [mpump Link Bridge](https://github.com/gdamdam/mpump/releases) (`ws://localhost:19876`);
  falls back to free timing when the bridge isn't running.

### MIDI

Toggle **MIDI** in the footer to send the generated notes to an external
synth/DAW — microtonal, via per-note pitch-bend.

### Presets & sharing

Save/recall named sounds locally (PRESET), or copy a **SHARE** link that encodes
the whole state (knobs, voice, octave, volume, timing, theme, tuning, seed).

## Develop

    npm install
    npm run dev      # build worklet + vite dev server
    npm test         # vitest unit suite
    npm run build    # production build (PWA) → dist/

Deploys to GitHub Pages automatically on push to `main` (`.github/workflows/deploy.yml`).

## Architecture

A core of **pure, seeded, audio-free units**, exhaustively unit-tested, wrapped
by a Web Audio layer and a thin React UI:

- `engine` — the generative brain: directed phrase contours with motif
  repetition/sequence over a steady pulse, resolving onto consonant "resting"
  notes. Pure & deterministic given a seed.
- `tuning`, `linkImport`, `shareCodec`, `builtinTunings` — decode an mdrone link
  → tonic + microtonal scale; pitch-lattice math.
- `conducting` — maps the seven knobs to engine parameters.
- `voicePresets` + the Karplus–Strong `voice` worklet — one parameterized
  struck-string voice; the six flavours are parameter sets.
- `scheduler` — Web Audio lookahead; optional onset quantization (bpm / Link).
- `linkClock`, `linkBridge` — Ableton Link tempo lock (bridge client vendored
  from mdrone).
- `mragaScene`, `presets`, `midi`, `themes` — scene serialization, named
  presets, MIDI out, colour themes.

Specs and plans live in `docs/superpowers/`.

Note: the service worker cache version in `public/sw.js` is hardcoded — bump it
to match `package.json` on release.

License: AGPL-3.0-or-later.
