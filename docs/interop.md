# Interop

mraga is a suite citizen. Everything below degrades gracefully when the
counterpart is absent — no feature is required.

## mdrone tuning import (src/linkImport.ts, src/shareCodec.ts)

Paste an mdrone share link (`?z=` deflate or `?b=` plain, url-safe base64)
into the link field → mraga adopts its tonic + 12-degree microtonal scale.
Builtin tuning tables are vendored from mdrone in src/builtinTunings.ts
(a builtin tuningId in a link carries no inline cents). Failure of any kind
falls back to C · 12-TET; an **empty** field on blur is a no-op (must never
reset a tuning loaded from a scene — regression once fixed).

## The bridge companion (ws://localhost:19876)

One desktop app (mpump/link-bridge, github.com/gdamdam/mpump/releases)
serves both protocols on the same port:

### Ableton Link (src/engine/linkBridge.ts)
TIMING = link snaps note onsets to the Link beat grid (half-beat). The
client keeps a linear beat↔audio-clock model (src/linkClock.ts) fed by 20 Hz
bridge messages. Vendored from mpump. **URL order matters**: `localhost`
first — Firefox blocks ws:// to IP literals from HTTPS as mixed content and
only exempts the `localhost` hostname (bug 1376309). Safari blocks all
loopback ws:// from HTTPS; that's accepted suite-wide, permanently.

### mbus — WebRTC audio patchbay (src/transport/mbus/)
The ⇄ mbus toggle publishes mraga's master output as source "mraga"; any
suite tab can subscribe (e.g. mtape to record the whole room). Client
vendored **byte-for-byte** from `../mbus/packages/mbus-client/src`
(client.ts + protocol.ts; index.ts is per-repo and carries the credit
header). Never edit the vendored files — change upstream and re-copy via
`cd ../mbus && npm run vendored:sync`.

> **Pending**: add `'mraga'` to `SIBLINGS` in
> `../mbus/scripts/sync-vendored.mjs` so the suite-wide check covers this
> copy (one-line edit in the mbus repo).

Publishing is off by default and session-transient (never persisted) per
suite convention. Chrome/Firefox only.

## MIDI out (src/midi.ts, src/mpe.ts)

Optional Web MIDI: each note = nearest MIDI note + 14-bit pitch bend for the
cents offset (±2 semitone GM range), note clamped 0..127, scheduled note-off.
First available output. Two selectable modes:

- **Single Channel** (ch 1): works with any synth. Its **overlap limitation** —
  pitch bend is a channel-global message, so a new note's bend retunes every
  still-ringing note — is inherent to single-channel MIDI and clearly documented
  in the UI tooltip.
- **MPE**: rotates notes across channels 2–8, sends the per-note bend *before*
  note-on and resets it after note-off, so overlapping microtonal notes keep
  their own tuning. Voice-stealing (oldest-first), panic, stop, output change
  and disconnect are handled in the pure allocator `src/mpe.ts` (unit-tested).

MIDI mode is a device-local preference (`mraga-midi-mode`), not part of a shared
scene. Panic (✋ / on stop) sends all-notes-off + bend reset on every channel.

## Share links

mraga's own scenes use `?s=` (see features.md). mdrone links pasted into the
link field use `?z=`/`?b=`. The two never collide.
