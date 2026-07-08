# Features

## The seven knobs (src/conducting.ts)

| Knob | Engine mapping |
|---|---|
| DENSITY | base pulse unit 4.0 s → 0.4 s (log) |
| REGISTER | centre pitch: tonic → +2 octaves |
| RESTLESS | contour strength, leap probability, tonic gravity, resting dwell |
| SILENCE | rest probability + phrase-pause length |
| RHYTHM | IOI jitter: rubato (0.35) → metronomic (0) |
| THEME | motif repeat probability 0.15 → 0.9 |
| FOCUS | palette narrowing: all degrees → ~5-degree core |

All knob→param mapping is in one pure function, `knobsToParams` — change the
feel of the instrument there, with tests in tests/unit/conducting.test.ts.

## Ragas (src/ragas.ts, engine masks)

A raga supplies grammar on the 12-degree lattice (only applied when the
active tuning has 12 degrees):
- **aroha/avaroha** — degree sets allowed while ascending / descending
  (direction-dependent masks in the engine; Desh has the classic dual Ni).
- **vadi/samvadi** — boosted as resting strengths (0.9 / 0.7): they attract
  resolutions (distance-discounted `nearestRestingStep`), get longer dwell
  and a slight accent.
- **pakad** — the signature phrase, lattice steps relative to Sa; with
  probability 0.35 a fresh phrase *is* the pakad, octave-shifted to sit near
  the register centre, held on its last note.
- FOCUS trims the raga's sets toward a core ranked tonic > vadi > samvadi >
  fifth (Sa/vadi/samvadi never trimmed).

Shipped ragas (practical approximations, not scholarly transcriptions):
Yaman, Bhairav, Bhairavi, Desh, Malkauns, Durga, Bhupali, Kafi, Khamaj, Todi,
Marwa, Ahir Bhairav (12). Each entry also carries a rough **time** association,
optional **weak/avoid** degrees (durbal — kept usable but trimmed first under
FOCUS and never a resting target), and authored **ornaments** (see Gamaka).
Adding one = a new entry in `RAGAS` — the tests in tests/unit/ragas.test.ts
validate well-formedness automatically. The ladder dims degrees outside the raga.

## Gamaka ornaments (src/gamaka.ts, engine masks)

Authored, seeded ornaments drawn from a raga's `ornaments` grammar (never generic
random decoration). Toggle **gamaka** in the footer (needs a raga). Four kinds,
rendered as short micro-notes emitted around the main note via the engine's
pending queue (no audio-layer change — precise onsets, real glide):
- **meend** — a slide *into* the note (per-raga glide).
- **kan** — a grace note approaching from an adjacent scale degree (below when
  ascending, above when descending).
- **andolan** — a slow few-cents oscillation on held resting notes (e.g. komal
  Re/Dha in Bhairav).
- **murki** — a rare fast ornamental turn.
Disabled by default and consumes **no rng when off**, so existing seeds/links
reproduce identically. Determinism, pitch bounds, direction and disabled
behaviour are tested (tests/unit/gamaka.test.ts, engineGamaka.test.ts).

## Taal cycle (src/taal.ts)

Optional rhythmic cycle: Off · Teental 16 · Jhaptal 10 · Rupak 7 · Ektaal 12.
A pure module models matra / vibhag / sam / khali and yields mild structural
**bias** weights (accent, phrase-start, resolution, rest) that lean the engine
toward structural points — especially **sam** (resolution) and **khali**
(breathing). Only active on a metric grid (TIMING = bpm/link); **free timing
stays rubato** (no taal bias). The footer shows the current matra + sam/khali
compactly — a gravitational field, not a drum machine. Link-timing compatible.
Not shown, it is part of the share scene (defaulted for old links).

## Stage Lock

A footer 🔒 toggle that freezes the knobs so a stray touch can't wreck a live
performance. Transport (Play/Stop), **panic**, conducting (ladder taps) and
intentional preset recall still work. The transport row also has a ✋ **panic**
button (all-notes-off + bend reset on MIDI, stop the line) available even locked.

## MIDI modes (src/midi.ts, src/mpe.ts)

**MODE = Single Channel** (all notes ch 1; overlap retunes) or **MPE** (notes
rotate across channels 2–8, per-note bend before note-on, bend reset after
note-off). The pure allocator handles voice-stealing, ownership, panic, mode
switch and device disconnect (tests/unit/mpe.test.ts).

## Tanpura drone (src/tanpura.ts + drone pool in voice.ts)

Classic four-string cycle — Pa(low) Sa Sa Sa(low) — free-timed (~1.15 s per
pluck), long jawari-heavy KS preset, own level control. Uses the *tuning's
own* fifth (702 c ± 40), falling back to the fourth, then the low octave, so
it stays microtonal. Follows the **unshifted** tonic (the melody's OCT
selector doesn't move the room's Sa). Independent of ▶/■: toggling DRONE
starts/stops it, and it auto-starts on PLAY if the toggle is on. Persisted
(`mraga-drone`, `mraga-drone-level`) and part of scenes/presets.

## Performance arc (src/arc.ts)

ARC = off | 6 | 12 | 24 min. While engaged, DENSITY/RHYTHM/SILENCE/REGISTER/
RESTLESS are overridden by a piecewise-linear trajectory through alap
(sparse, rubato, low, spacious) → jor (a pulse emerges, t=0.42) → jhala
(fast, tight, high, t=0.75 →1). THEME and FOCUS stay the user's. When the
arc completes, playback stops (a performance ends). Changing ARC mid-play
restarts the trajectory from now. Progress (phase + %) shows next to the
selector. Deliberately **not** part of share scenes.

## Conducting (PitchLadder → engine pullDegree)

Tap a ladder column to pull the line toward that degree — fresh phrases then
target its nearest lattice occurrence instead of a random resting note. Tap
again to release. The pulled column is outlined. Works with or without a
raga (a tap outside the raga's set is honored — performer's override).
Transient: not persisted, not in scenes.

## WAV recording (recorder worklet + src/recorder.ts)

● rec arms a worklet tap on the master (melody + drone + reverb — exactly
what you hear); ■ stops, encodes 16-bit stereo PCM WAV in the main thread
(pure `encodeWav`, unit-tested: header, interleave, clipping) and triggers a
download named `mraga-<seed>.wav`.

## Scenes, presets, sharing (src/mragaScene.ts, src/presets.ts)

A scene = knobs + voice + octave + volume + timing + bpm + theme + seed +
tuning + raga + drone (+level). Encoded as url-safe base64 JSON in `?s=`.
Decoding validates/clamps everything (see the sanitization tests — including
the empty-scaleCents and absurd-tonic rejections). New fields must be
optional-with-defaults so old links keep working. Presets = named scenes in
localStorage.

## Voices (src/voicePresets.ts)

santoor (baseline), koto, sitar, mallet, qanun, kalimba — four numbers each:
brightness (loop lowpass), damping (< 0.5 for stability), decay, jawari.
