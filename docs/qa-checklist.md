# Real-device QA checklist

Automated unit + Playwright coverage cannot exercise real audio hardware, MIDI
ports, WebRTC peers, or mobile lifecycle. Before tagging a release, walk this
list on real devices. mraga does **not** qualify as done on unit tests alone.

Legend: ☐ = to verify. Record device/browser/OS next to each run.

## 1. 24-minute performance arc (the headline claim)
- ☐ Select a raga, press **Play**, set **ARC = 24**. Leave it running the full
  duration on a laptop that does not sleep.
- ☐ Phase readout advances alap → jor → jhala; progress/time-remaining is
  correct and monotonic.
- ☐ At t=1 the performance **stops itself** cleanly (no stuck notes, no pluck
  storm, no runaway CPU).
- ☐ Intervene mid-arc (turn a knob the arc owns): control hands over smoothly,
  no pitch/timing discontinuity; releasing returns control to the arc.
- ☐ CPU/memory stable across the whole arc (no worklet leak — see §8 note).

## 2. MIDI out — single channel
- ☐ Connect a hardware/software synth. Enable MIDI (mode = Single).
- ☐ Notes sound at the correct microtuning (bend applied).
- ☐ Confirm the documented overlap limitation is understood: overlapping notes
  share one bend (expected in single mode).
- ☐ Panic / Stop silences all notes; no hung note-ons.

## 3. MIDI out — MPE
- ☐ Switch mode = MPE on an MPE-capable synth (or monitor with a MIDI monitor).
- ☐ Overlapping notes land on channels 2–8, each with its own pitch bend; no
  cross-retuning of ringing notes.
- ☐ Voice stealing at >7 simultaneous notes is graceful (oldest released first).
- ☐ Bend resets to centre after each note-off (watch a MIDI monitor).
- ☐ Change MIDI output device mid-play, then unplug it: no crash, clean
  all-notes-off on the old device, graceful fallback.
- ☐ Panic and Stop each send all-notes-off + bend reset on every channel.

## 4. WAV recording
- ☐ Arm ● rec, play ~30 s with drone + reverb, ■ stop.
- ☐ File downloads as `mraga-<seed>.wav`, opens in an editor, is 16-bit stereo,
  correct sample rate, no clipping/garbage, matches what was heard.

## 5. mdrone tuning import
- ☐ Paste a real mdrone `?z=` link: tonic + microtonal scale adopted; the
  ladder reflects the imported cents; melody + tanpura stay beat-free against
  a running mdrone tab.
- ☐ Paste a malformed/truncated link: graceful fallback to C · 12-TET, no crash.
- ☐ Blur the link field empty: does NOT reset a tuning already loaded.

## 6. mbus (WebRTC patchbay) — needs the bridge companion
- ☐ Start `mpump/link-bridge`. Enable ⇄ mbus in mraga (Chrome/Firefox).
- ☐ Open mtape/mscope, subscribe to source "mraga": audio arrives; recording in
  mtape captures the mraga line.
- ☐ Toggle mbus off: publishing stops, peer connection closes cleanly.
- ☐ Reload mraga: mbus is OFF again (session-transient, never persisted).
- ☐ Kill the bridge mid-session: graceful failure, no crash, UI recovers.

## 7. Ableton Link timing
- ☐ Bridge running, set TIMING = link: onsets snap to the shared beat grid.
- ☐ With a taal selected, structural bias (sam emphasis) reads musically over
  Link timing; nothing drifts or double-schedules.
- ☐ Kill the bridge: falls back to free timing, shows "searching", no stall.

## 8. PWA / offline
- ☐ First online load, then go offline (airplane mode): app still boots and
  plays from the service-worker cache.
- ☐ Install as a standalone PWA; launches and runs offline.
- ☐ Deploy a new version: a previously-installed client picks it up on the next
  online load (SW cache version bumped automatically from package.json).

## 9. Mobile lifecycle (phone + tablet, iOS Safari + Android Chrome)
- ☐ Audio starts only on the first user gesture (Play), per policy.
- ☐ Background the tab / lock the screen mid-play, return: no zombie audio, no
  crash; transport state is sane.
- ☐ Rotate orientation: one-screen layout holds; controls reachable.
- ☐ Incoming call / interruption then resume: recovers cleanly.

## 10. Share / preset backward compatibility
- ☐ Open an OLD `?s=` share link (pre-taal/pre-gamaka): loads with sensible
  defaults, no crash.
- ☐ Save a preset in this version, reload, recall it: identical sound (seed +
  all params restored).
- ☐ Copy a fresh share link, open in a clean profile: same improvisation.

## 11. Stage Lock
- ☐ Engage Stage Lock: large accidental knob drags are prevented; transport,
  conducting (ladder taps), panic, and intentional preset recall still work.
- ☐ Disengage: full control returns.

## 12. Accessibility
- ☐ Full keyboard operation (tab order, Play/Stop/panic, knob adjust,
  ladder-tap equivalent).
- ☐ Screen reader announces controls, current raga/taal, and arc phase.

---

Note (worklet lifecycle): `voice.dispose()` closes the AudioContext but is not
wired to a UI action (single-page instrument). If mraga is ever embedded, verify
contexts are disposed on unmount to avoid leaks.
