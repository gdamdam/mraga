# mraga — project knowledge

This folder is the project's knowledge base: enough context to continue
developing mraga from a cold start (new machine, new session, no memory of
past conversations). Start here, then read the file that matches your task.

| File | What it covers |
|---|---|
| [architecture.md](architecture.md) | Module map, audio graph, the two-clocks scheduler, worklet build, data flow |
| [features.md](features.md) | Every user-facing feature and how it is implemented (knobs, ragas, arc, drone, conducting, recording) |
| [interop.md](interop.md) | mdrone link import, Ableton link-bridge, mbus patchbay, MIDI out, share links |
| [development.md](development.md) | Workflow, verification gate, release checklist, known limitations, roadmap |

## What mraga is

A free, local-first browser instrument: a **generative melodic soloist over a
drone**, in the raga idiom. It improvises a monophonic line (Karplus–Strong
plucked timbres) inside a microtonal tuning, conducted by seven macro-knobs
rather than programmed note-by-note. Part of the **m-suite**
(`*.mpump.live`), sibling of mdrone (the drone it traditionally sits on),
mpump, mchord, mvox, etc. Suite-wide rules live in
`../DOCS/suite-conventions.md` — read that file too; it is authoritative for
stack, privacy, PWA, licensing (AGPL-3.0) and interop conventions.

## Quick start for a new session

```bash
npm install
npm run dev        # build worklet + vite dev server
npm test           # vitest unit suite (pure core — engine, tunings, codecs)
npm run typecheck  # tsc -b --noEmit
npm run build      # worklet + tsc + vite build (the real TS gate)
npm run test:e2e   # playwright smoke (needs a port — run outside sandboxes)
```

Everything musical is **pure and seeded** (`src/engine.ts`, `src/ragas.ts`,
`src/arc.ts`, `src/tuning.ts`): no audio, no `Date`, no `Math.random` — a
given seed reproduces a given improvisation exactly. Audio lives only in
`src/voice.ts` + `src/engine/voices/*` (AudioWorklet) and timing in
`src/scheduler.ts`. Keep it that way: new musical behavior goes in the pure
core with unit tests first, UI/audio wiring second.

## State of the project (2026-07, v0.2.0)

- 0.1.x: MVP — engine, 6 KS voices, mdrone tuning import, share links,
  presets, themes, BPM/Link timing, MIDI out, PWA. A review pass fixed
  share-link validation, a scheduler stall, MIDI range, SW offline shell.
- 0.2.0: built-in tanpura drone, raga grammars (6 ragas), performance arc
  (alap→jor→jhala), conducting by tap on the ladder, WAV recording, mbus
  publishing, link-bridge URL-order fix.
- Open items and next steps: see [development.md](development.md) §Roadmap.
