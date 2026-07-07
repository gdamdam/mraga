# Development

## Ground rules (from ../DOCS/suite-conventions.md — authoritative)

- React + Vite + TypeScript strict; DSP in AudioWorklets; a lookahead
  scheduler for anything sequenced; Vitest.
- **Pure core first**: new musical behavior = pure function/module + unit
  tests, then UI/audio wiring. Validate/clamp everything crossing a boundary
  (URL payloads, localStorage, MIDI, worklet messages, bridge traffic).
- Local-first, no telemetry, AGPL-3.0. Audio starts on a user gesture.
- Vendored code (mbus client, link client, mdrone tables) is never edited
  in place — change upstream, re-copy, keep the credit header.

## Verification gate (before any "done")

```bash
npm test            # unit suite (125+ tests)
npm run build       # worklet + tsc -b + vite build — this is the TS gate
npm run test:e2e    # playwright smoke; binds port 4173 → run outside sandboxes
```

There is no lint script yet (see Roadmap). CI: .github/workflows/deploy.yml
builds and ships to GitHub Pages on push to main.

## Release checklist

1. Bump `package.json` version **and** `const VERSION` in `public/sw.js`
   (hand-synced — the SW cache name derives from it; automate someday).
2. `npm test && npm run build`, e2e if UI changed.
3. Commit (repo convention: `feat:` / `fix:` / `docs:` prefixes, merge
   commits per feature branch historically; direct commits to main are fine
   for small work).
4. Push to main → Pages deploy. The SW is network-first for navigations and
   precaches the shell, so clients pick up a new version on next online load.

## Gotchas that have already bitten

- `[].every()` is vacuously true — length-check arrays before element checks
  (empty scaleCents once crashed PLAY via `x % 0`).
- The scheduler must advance its time cursor **before** dispatching
  callbacks (a throwing onNote once froze the timeline → pluck storm).
- `parseFloat("")` is NaN and survives Math.min/max clamps.
- The SW navigate fallback only works if something actually cached
  index.html (precache on install).
- React state read inside scheduler callbacks must go through refs (the
  `xxxRef.current = xxx` mirror block at the top of App).
- AudioWorklet processors can't be ES modules — new processor files must be
  added to `parts` in scripts/build-worklet.mjs; never edit
  src/engine/voiceProcessor.js (generated).
- The engine octave state starts at `octave: 1` and REGISTER centers pitch
  relative to the (octave-shifted) tonic — the OCT selector shifts the
  melody's tonic, while the tanpura reads the unshifted tonic.

## Roadmap / backlog (in rough priority order)

1. **Register mraga in mbus sync** — add `'mraga'` to SIBLINGS in
   `../mbus/scripts/sync-vendored.mjs` (couldn't be done from the mraga
   sandbox; one line).
2. **MPE MIDI** — per-note channel rotation (2..8) so overlapping notes keep
   their own pitch bend; UI switch between single-channel and MPE. Fixes the
   documented microtonal-overlap limitation.
3. **Gamaka ornaments** — beyond meend glide: andolan (slow oscillation on
   held resting notes), kan (grace) notes before phrase starts. Engine-level,
   pure, seeded; render as short glide chains on the KS voice.
4. **More ragas + time-of-day menu** — the RAGAS table is data-driven;
   consider aroha-only vakra (zigzag) patterns for ragas like Gaud Malhar.
5. **mbus subscribe side** — receive a remote source (e.g. mdrone's actual
   drone audio) into mraga's space; the vendored client already supports
   `subscribe()`.
6. **Taal grid** — optional rhythmic cycle (teental 16, jhaptal 10) layered
   on the BPM grid: accent sam, mark khali in the UI.
7. **Lint script** — add eslint (suite gate is lint+type+test+build; mraga
   lacks the lint quarter).
8. **sw.js VERSION from package.json at build** — kill the hand-sync.
9. **AudioContext disposal** — `voice.dispose()` is never called; fine for a
   single-page instrument, worth doing if mraga ever embeds elsewhere.
10. **README refresh** — the README predates 0.2.0; fold in drone/raga/arc/
    conduct/rec/mbus per the house style (badges, tables, ASCII diagram).

## Testing map

| Area | File |
|---|---|
| Engine (knobs, determinism, guards) | tests/unit/engine.test.ts |
| Raga grammar in the engine | tests/unit/engineRaga.test.ts |
| Raga/masks/boost data | tests/unit/ragas.test.ts |
| Arc trajectory | tests/unit/arc.test.ts |
| Tanpura cycle | tests/unit/tanpura.test.ts |
| WAV encode | tests/unit/recorder.test.ts |
| Scheduler timing/quantize/robustness | tests/unit/scheduler.test.ts |
| Scene validation/clamps | tests/unit/mragaScene.test.ts |
| Tuning/pitch math | tests/unit/tuning.test.ts |
| mdrone import + codec | tests/unit/linkImport.test.ts, shareCodec.test.ts |
| MIDI math | tests/unit/midi.test.ts |
| e2e smoke (app boots, PLAY works) | tests/e2e/smoke.spec.ts |
