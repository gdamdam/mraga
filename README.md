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

License: AGPL-3.0-or-later.
