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
npm run check       # suite gate: lint + typecheck + test + build
npm run lint        # eslint (flat config; src/ + tests/)
npm test            # unit suite (180+ tests)
npm run build       # worklet + tsc -b + vite build — this is the TS gate
npm run test:e2e    # playwright smoke; binds port 4173 → run outside sandboxes
```

CI: .github/workflows/deploy.yml runs `npm run check`, then ships to
GitHub Pages on push to main.

## Release checklist

1. Bump `package.json` version. The SW cache name derives from it
   automatically — `scripts/stamp-sw-version.mjs` (postbuild) stamps the
   `__MRAGA_VERSION__` placeholder in `public/sw.js` into `dist/sw.js`.
2. `npm run check`, e2e if UI changed.
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

1. ~~**Register mraga in mbus sync**~~ — done: `'mraga'` added to SIBLINGS in
   `../mbus/scripts/sync-vendored.mjs`; `npm run vendored:check` passes.
2. ~~**MPE MIDI**~~ — done: Single/MPE MODE selector; MPE rotates channels 2–8
   with per-note bend; pure allocator `src/mpe.ts` (steal/panic/cleanup tested).
3. ~~**Gamaka ornaments**~~ — done: `src/gamaka.ts` (meend/kan/andolan/murki),
   authored per-raga, seeded, emitted as micro-notes via the engine's pending
   queue; toggle in the footer.
4. ~~**More ragas**~~ — done: 12 ragas with time/weak/ornament metadata.
   (vakra/zigzag aroha patterns are still a future refinement.)
5. **mbus subscribe side** — receive a remote source (e.g. mdrone's actual
   drone audio) into mraga's space; the vendored client already supports
   `subscribe()`. (Still future.)
6. ~~**Taal grid**~~ — done: `src/taal.ts` (teental/jhaptal/rupak/ektaal), pure
   structural bias toward sam/khali; compact UI position; free timing stays rubato.
7. ~~**Lint script**~~ — done: eslint flat config + `npm run check`
   (lint+typecheck+test+build).
8. ~~**sw.js VERSION from package.json at build**~~ — done:
   `scripts/stamp-sw-version.mjs` stamps `dist/sw.js` on postbuild.
9. **AudioContext disposal** — `voice.dispose()` is never called; fine for a
   single-page instrument, worth doing if mraga ever embeds elsewhere.
10. **README refresh** — largely folded in (MIDI/MPE, raga/taal/gamaka, stage
    lock); a full house-style diagram pass is still worthwhile.

**Before a 1.0 tag**: walk `docs/qa-checklist.md` on real devices (24-min arc,
MIDI/MPE hardware, WAV, mdrone import, mbus, PWA/offline, mobile lifecycle).
Unit + Playwright coverage is green but does not certify hardware.

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
| MPE allocation/stealing/panic/cleanup | tests/unit/mpe.test.ts |
| Gamaka ornaments (pure) | tests/unit/gamaka.test.ts |
| Gamaka + taal in the engine | tests/unit/engineGamaka.test.ts |
| Taal model / position / bias | tests/unit/taal.test.ts |
| Stability: payload bounds, arc completion, integration | tests/unit/stability.test.ts |
| e2e smoke (app boots, PLAY works) | tests/e2e/smoke.spec.ts |
