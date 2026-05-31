<h1 align="center">mraga</h1>

<p align="center">
  <a href="https://github.com/gdamdam/mraga"><img src="https://img.shields.io/github/package-json/v/gdamdam/mraga?color=blue&label=version" alt="Version"></a>
  <a href="https://github.com/gdamdam/mraga/actions/workflows/deploy.yml"><img src="https://github.com/gdamdam/mraga/actions/workflows/deploy.yml/badge.svg" alt="Deploy"></a>
  <a href="https://github.com/gdamdam/mraga/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License"></a>
  <img src="https://img.shields.io/badge/Web%20Audio-API-FF6600" alt="Web Audio API">
  <img src="https://img.shields.io/badge/AudioWorklet-DSP-FF6600" alt="AudioWorklet">
</p>

<p align="center"><strong>mraga is a conductable generative melodic instrument.</strong><br><br>A struck, microtonal voice that improvises over an <a href="https://mdrone.org">mdrone</a> drone — locked to its exact tonic and tuning. You don't play notes; you <em>conduct</em> an autonomous improviser with a handful of knobs. In any browser. No install. No account. Free.</p>

<p align="center">
  <a href="https://gdamdam.github.io/mraga/">https://gdamdam.github.io/mraga/</a>
</p>

---

## What it does

- **Plays over the drone** — paste an mdrone share link; mraga reads the tonic and the microtonal scale out of it and improvises a struck/ringing line in that exact tuning, so the two never beat against each other.
- **You conduct, you don't play** — seven knobs shape *how* an autonomous improviser moves: how often it speaks, where it sits, how far it wanders, how much it breathes, how tight the pulse is, how strongly it repeats a motif, and how wide a note palette it draws from.
- **Sounds intentional, not random** — a scale-aware engine builds directed phrase contours that resolve onto consonant "resting" notes, repeats and transposes motifs, and breathes between phrases — over a steady pulse, with subtle glides.
- **Six struck voices** — santoor, koto, sitar, mallet, qanun, kalimba — one parameterized Karplus–Strong string, switchable live.
- **Locks to tempo** — free/ametric by default, or snap note onsets to an internal BPM grid, or to **Ableton Link** via the shared m-family bridge.
- **Speaks MIDI** — send the line to an external synth/DAW, microtonal via per-note pitch-bend.
- **Saves, shares, rerolls** — name and recall sounds locally, copy a link that restores the exact sound (including the seed), and reroll the improvisation with one click.
- **Has character** — a warm, incandescent palette (five themes), a glowing block-art wordmark that flickers with the voice, and a live pitch-ladder that makes the microtuning visible.
- **Works offline + installs** — service worker; once loaded it runs in airplane mode, and installs as a standalone PWA.

---

## Table of Contents

- [Conducting](#conducting)
- [The Engine](#the-engine)
- [Voices](#voices)
- [Timing](#timing)
- [Microtuning](#microtuning)
- [Sharing, Presets & Seed](#sharing-presets--seed)
- [MIDI](#midi)
- [Look & Feel](#look--feel)
- [Develop](#develop)
- [Architecture](#architecture)
- [License](#license)

---

## Conducting

Seven knobs steer the improviser. The idiomatic touches (tonic gravity, resting-note resolution, breathing, glide) are always on at tasteful defaults; the knobs modulate them.

| Knob | Poles | Shapes |
|---|---|---|
| **DENSITY** | sparse ↔ busy | the note rate / pulse |
| **REGISTER** | low ↔ high | the centre pitch of the line |
| **RESTLESS** | calm ↔ roam | how far the melody wanders, and how hard it's pulled home |
| **SILENCE** | full ↔ spacious | rest probability and phrase-breathing |
| **RHYTHM** | loose ↔ tight | timing feel — rubato to metronomic (independent of the melody) |
| **THEME** | free ↔ locked | how strongly it repeats one motif — turn up for *less random* |
| **FOCUS** | wide ↔ tight | narrows the note palette toward a few characteristic degrees |

Plus footer controls: **VOICE** (six flavours), **OCT** (−2…+2 octave shift), **VOL** (master), **🎲** reroll, and a free/bpm/link **TIMING** selector. Every control has a hover tooltip.

---

## The Engine

The heart of mraga is a **pure, seeded, audio-free** generative unit — deterministic given its seed, so a shared link replays identically.

- **Directed phrases** — each phrase is a precomputed contour that walks (mostly stepwise) toward a resting note and resolves on it, rather than a step-by-step random walk.
- **Motif repetition & sequence** — phrases repeat and transpose the previous figure (THEME), so the line develops recognizable, recurring material.
- **Tonic gravity** — a graded pull back toward the register centre, stronger when calm and the further the line strays.
- **Resting-note weighting** — degrees consonant against the drone (tonic, fifth, fourth, strong third — detected by cents proximity, not named-raga rules) attract dwell and phrase endings.
- **Steady pulse** — note values are integer multiples of a base unit, barely humanised when RHYTHM is tight; loose toward rubato.
- **Glide (meend)** — occasional portamento between notes, rendered as a sliding Karplus–Strong delay length.
- **Anti-stuck guard** — caps consecutive identical pitches so a locked motif can't drone on one note.

---

## Voices

One parameterized Karplus–Strong string; each flavour is a parameter set over brightness (an in-loop lowpass), damping, decay, and jawari (a metallic-buzz waveshaper). Switch live; the choice is remembered and travels in the share link.

| Voice | Character |
|---|---|
| **santoor** | bright hammered-dulcimer, medium ring (the baseline voice) |
| **koto** | warm zither, long ring, soft attack |
| **sitar** | buzzy jawari, metallic, sustained |
| **mallet** | dark struck bar — marimba / woodblock, short |
| **qanun** | bright, dry, fast Middle-Eastern zither (pairs with maqam tunings) |
| **kalimba** | bell-ish thumb-piano pluck, slight buzz, short |

---

## Timing

- **free** — ametric, by probability and breath, like an *alap* (default).
- **bpm** — snap note onsets to an internal ½-beat grid; set the tempo with the **BPM** field.
- **link** — snap to the shared m-family tempo via **Ableton Link**. mraga reuses mpump's [Link Bridge](https://github.com/gdamdam/mpump/releases) (a tiny companion that bridges Link ↔ browser over `ws://localhost:19876`). mraga only *follows* the tempo — it never drives it — and falls back to free timing when the bridge isn't running.

---

## Microtuning

mraga is **tuning-aware** in a way a generic looper/arpeggiator can't be — it plays in the drone's exact cents.

- **Decodes mdrone share links** (`?z=` deflate / `?b=` plain, the same codec mdrone produces) to extract the tonic (note + octave → Hz) and the per-degree microtonal cents.
- **Six built-in tuning tables** vendored from mdrone — equal (12-TET), just 5-limit, ¼-comma meantone, harmonic series, maqam rast, slendro — plus any **custom 13-degree table** carried inline in the link.
- **Tolerant** — a malformed or future-version link degrades to a sensible default scale rather than crashing.
- **Pitch ladder** — the signature visual: each scale degree is a column; the degree sounding now lights and decays, making the microtuning visible.

---

## Sharing, Presets & Seed

- **SHARE** copies a self-contained `?s=` link that restores the exact sound — knobs, voice, octave, volume, timing, theme, tuning, **and the seed** — so a recipient hears the same improvisation. Opening such a link applies it on load.
- **PRESET** saves / recalls / deletes named sounds locally (`localStorage`).
- **🎲 reroll** picks a new seed (shown on the button) for a different improvisation; the seed is part of the share link, so a reroll you like is reproducible.

---

## MIDI

Toggle **MIDI** in the footer to send the generated notes to the first available Web MIDI output. Because mraga is microtonal, each note is sent as the nearest MIDI note **plus a 14-bit pitch-bend** for the cents offset (±2-semitone bend range). Optional and graceful — it does nothing if Web MIDI is unavailable.

---

## Look & Feel

- **Themes** — five warm, incandescent palettes (saffron, madder, rosewood, clay, parchment) in the m-family mood, switchable live from the header and remembered.
- **Glowing wordmark** — block-art `mraga` with an incandescent text-shadow that flickers and breathes with the voice's output level, like a struck string lighting up.
- **One screen** — header (link field, transport, presets, share, theme), pitch ladder, the seven knobs, and a footer control strip.

---

## Develop

Standard Vite app:

    npm install
    npm run dev      # build worklet + vite dev server
    npm test         # vitest unit suite
    npm run build    # production build (PWA) → dist/

Every push to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`.

Note: the service-worker cache version in `public/sw.js` is hardcoded — bump it to match `package.json` on release.

---

## Architecture

A core of **pure, seeded, audio-free units** (exhaustively unit-tested) wrapped by a thin Web Audio layer and React UI:

- `engine` — the generative brain (directed contours + motif repetition + steady pulse). Pure, deterministic, the most thoroughly tested unit.
- `tuning`, `linkImport`, `shareCodec`, `builtinTunings` — decode an mdrone link → tonic + scale; pitch-lattice math and resting-note detection.
- `conducting` — maps the seven knobs to engine parameters.
- `voicePresets` + the Karplus–Strong `voice` worklet — one parameterized struck-string voice with a small voice pool and a reverb send.
- `scheduler` — a Web Audio lookahead scheduler with optional onset quantization (bpm / Link).
- `linkClock`, `linkBridge` — Ableton Link tempo lock (bridge client vendored from mdrone).
- `mragaScene`, `presets`, `midi`, `themes` — scene serialization + sharing, named presets, MIDI out, colour themes.

Specs and implementation plans live in `docs/superpowers/`.

---

## License

[AGPL-3.0](LICENSE)

## Trademark

"mraga" is an unregistered trademark of the author. Use of the name or logo for derivative projects or services may cause confusion and is not permitted.

---

Built with Claude Code. Part of the **m-family** alongside [mdrone](https://mdrone.org). Design, architecture, and creative direction by [gdamdam](https://github.com/gdamdam).
