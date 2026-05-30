# mraga

A conductable generative foreground voice for the m-family. Paste an
[mdrone](../mdrone) share link; mraga plays a struck/ringing melodic line locked
to the drone's tonic and microtonal scale. Conduct it with four knobs — DENSITY,
REGISTER, RESTLESSNESS, SILENCE — rather than playing notes.

## Develop

    npm install
    npm run dev        # build worklet + vite dev server
    npm test           # vitest unit suite
    npm run test:e2e   # playwright smoke test
    npm run build      # production build (PWA)

## Architecture

Pure, seeded, audio-free core (`rng`, `shareCodec`, `linkImport`, `tuning`,
`conducting`, `engine`) wrapped by a Web Audio layer (`voice` worklet +
`scheduler`) and a thin React UI. The generative engine is a scale-aware gravity
walk; see `docs/superpowers/specs/2026-05-30-mraga-design.md`.

Note: the service worker cache version in `public/sw.js` is hardcoded — bump it
to match `package.json` on release.

## Ableton Link (optional)

mraga can lock its note onsets to the shared m-family tempo via the **mpump Link Bridge**
companion app (`ws://localhost:19876`). Toggle `link` in the footer; with the bridge running,
onsets snap to a ½-beat grid. mraga only follows the tempo (it never drives it), and falls back
to free timing when the bridge isn't running.

## Voices

Six struck/plucked flavours (santoor · koto · sitar · mallet · qanun · kalimba), one parameterized
Karplus–Strong voice. Click the `VOICE` label in the footer to cycle; the choice is remembered.

License: AGPL-3.0-or-later.
