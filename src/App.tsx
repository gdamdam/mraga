import { useEffect, useRef, useState } from "react";
import { Knob } from "./components/Knob";
import { PitchLadder } from "./components/PitchLadder";
import { importTuningFromUrl, DEFAULT_TUNING, type PortableTuning } from "./linkImport";
import { knobsToParams, type Knobs } from "./conducting";
import { initState, nextEvent, type EngineState } from "./engine";
import { makeRng } from "./rng";
import { Scheduler } from "./scheduler";
import { createVoice, type Voice } from "./voice";
import { VOICE_IDS, VOICE_LABELS, getPreset, type VoiceId } from "./voicePresets";
import { LinkClock } from "./linkClock";
import { enableLinkBridge, autoDetectLinkBridge, onLinkState, type LinkState } from "./engine/linkBridge";

const VOICE_KEY = "mraga-voice";
const LINK_KEY = "mraga-link-enabled";
const VOL_KEY = "mraga-volume";
const OCT_KEY = "mraga-octave";

function loadVoiceId(): VoiceId {
  const stored = localStorage.getItem(VOICE_KEY);
  return (VOICE_IDS as string[]).includes(stored ?? "") ? (stored as VoiceId) : "santoor";
}
function loadVolume(): number {
  const v = parseFloat(localStorage.getItem(VOL_KEY) ?? "");
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8;
}
function loadOctave(): number {
  const v = parseInt(localStorage.getItem(OCT_KEY) ?? "", 10);
  return Number.isFinite(v) ? Math.max(-2, Math.min(2, v)) : 0;
}

export function App() {
  const [tuning, setTuning] = useState<PortableTuning>(DEFAULT_TUNING);
  const [linkInput, setLinkInput] = useState("");
  const [playing, setPlaying] = useState(false);
  const [activeDegree, setActiveDegree] = useState<number | null>(null);
  const [knobs, setKnobs] = useState<Knobs>({ density: 0.5, register: 0.5, restlessness: 0.4, silence: 0.4 });
  const [voiceId, setVoiceId] = useState<VoiceId>(loadVoiceId);
  const [volume, setVolume] = useState<number>(loadVolume);
  const [octaveShift, setOctaveShift] = useState<number>(loadOctave);
  const [linkEnabled, setLinkEnabled] = useState<boolean>(() => localStorage.getItem(LINK_KEY) === "1");
  const [linkState, setLinkState] = useState<LinkState>({
    tempo: 120, beat: 0, phase: 0, playing: false, peers: 0, clients: 0, connected: false,
  });

  const voiceRef = useRef<Voice | null>(null);
  const schedRef = useRef<Scheduler | null>(null);
  const stateRef = useRef<EngineState>(initState());
  const rngRef = useRef<() => number>(makeRng(Date.now() & 0xffff));
  const knobsRef = useRef(knobs);
  const tuningRef = useRef(tuning);
  const clockRef = useRef(new LinkClock());
  const linkActiveRef = useRef(false);
  const octaveShiftRef = useRef(octaveShift);
  knobsRef.current = knobs;
  tuningRef.current = tuning;
  linkActiveRef.current = linkEnabled && linkState.connected;
  octaveShiftRef.current = octaveShift;

  // Subscribe to the bridge once; feed the clock and mirror state into React.
  useEffect(() => {
    const unsub = onLinkState((s) => {
      // Only feed the clock once audio exists, so beats are timestamped with a
      // real AudioContext time. The 20 Hz stream re-seeds it right after PLAY.
      if (s.connected && voiceRef.current) {
        clockRef.current.update(s.tempo, s.beat, voiceRef.current.ctx.currentTime);
      } else if (!s.connected) {
        clockRef.current.reset();
      }
      setLinkState(s);
    });
    if (localStorage.getItem(LINK_KEY) === "1") enableLinkBridge(true);
    else autoDetectLinkBridge();
    return unsub;
  }, []);

  async function loadLink() {
    setTuning(await importTuningFromUrl(linkInput));
  }

  function cycleVoice() {
    const next = VOICE_IDS[(VOICE_IDS.indexOf(voiceId) + 1) % VOICE_IDS.length];
    setVoiceId(next);
    localStorage.setItem(VOICE_KEY, next);
    voiceRef.current?.setPreset(getPreset(next));
  }

  function changeVolume(v: number) {
    setVolume(v);
    localStorage.setItem(VOL_KEY, String(v));
    voiceRef.current?.setVolume(v);
  }

  function changeOctave(delta: number) {
    const next = Math.max(-2, Math.min(2, octaveShift + delta));
    setOctaveShift(next);
    localStorage.setItem(OCT_KEY, String(next));
  }

  function toggleLink() {
    const next = !linkEnabled;
    setLinkEnabled(next);
    localStorage.setItem(LINK_KEY, next ? "1" : "0");
    enableLinkBridge(next);
  }

  async function togglePlay() {
    if (playing) {
      schedRef.current?.stop();
      setPlaying(false);
      setActiveDegree(null);
      return;
    }
    if (!voiceRef.current) voiceRef.current = await createVoice();
    await voiceRef.current.resume();
    voiceRef.current.setPreset(getPreset(voiceId));
    voiceRef.current.setVolume(volume);
    stateRef.current = initState();
    const sched = new Scheduler({
      now: () => voiceRef.current!.ctx.currentTime,
      lookaheadSec: 0.12,
      pull: () => {
        // Octave selector transposes the whole voice by shifting the tonic.
        const tonicHz = tuningRef.current.tonicHz * Math.pow(2, octaveShiftRef.current);
        const params = knobsToParams(knobsRef.current, tonicHz);
        const r = nextEvent(stateRef.current, tuningRef.current.scaleCents, tonicHz, params, rngRef.current);
        stateRef.current = r.state;
        return r.event;
      },
      onNote: (e, time) => {
        voiceRef.current!.pluck(e.pitchHz, e.velocity, e.glideFromHz);
        const delayMs = Math.max(0, (time - voiceRef.current!.ctx.currentTime) * 1000);
        setTimeout(() => setActiveDegree(e.degreeIndex), delayMs);
      },
      onRest: () => {},
      // Snap onsets to the half-beat grid only while Link is engaged+connected.
      quantize: (rawTime) =>
        linkActiveRef.current ? clockRef.current.nextGridTime(rawTime, 0.5) : rawTime,
    });
    schedRef.current = sched;
    sched.run(25);
    setPlaying(true);
  }

  const octLabel = octaveShift > 0 ? `+${octaveShift}` : String(octaveShift);
  const linkLabel = !linkEnabled
    ? "● free  ○ link"
    : linkState.connected
      ? `○ free  ● link · ${linkState.tempo.toFixed(1)} BPM · ${linkState.peers} peer${linkState.peers === 1 ? "" : "s"}`
      : "○ free  ● link — searching…";

  return (
    <main className="mraga">
      <div className="row">
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h1 style={{ margin: 0, letterSpacing: 2 }}>mraga</h1>
          <span className="chip" title="mraga version">v{__APP_VERSION__}</span>
        </div>
        <span
          className="chip"
          title="The drone scene mraga is locked to (tonic + microtonal tuning). Paste an mdrone link to change it."
        >
          ◈ linked: {tuning.label}
        </span>
      </div>

      <div className="row" style={{ margin: "16px 0" }}>
        <input
          className="link-field"
          placeholder="paste mdrone link …"
          value={linkInput}
          aria-label="mdrone link"
          title="Paste an mdrone share link to set the tonic and microtonal scale mraga plays in."
          onChange={(e) => setLinkInput(e.target.value)}
          onBlur={loadLink}
        />
        <button type="button" className="play" onClick={togglePlay} title="Start or stop the generative voice.">
          {playing ? "■ STOP" : "▶ PLAY"}
        </button>
      </div>

      <PitchLadder scaleCents={tuning.scaleCents} activeDegree={activeDegree} />

      <div className="knobs">
        <Knob label="DENSITY" lowPole="sparse" highPole="busy" value={knobs.density} onChange={(v) => setKnobs({ ...knobs, density: v })} title="How often notes occur — sparse to busy (the note rate)." />
        <Knob label="REGISTER" lowPole="low" highPole="high" value={knobs.register} onChange={(v) => setKnobs({ ...knobs, register: v })} title="Centre pitch of the melodic line — low to high." />
        <Knob label="RESTLESS" lowPole="calm" highPole="roam" value={knobs.restlessness} onChange={(v) => setKnobs({ ...knobs, restlessness: v })} title="How far the line wanders from home — calm/home-bound to roaming." />
        <Knob label="SILENCE" lowPole="full" highPole="spacious" value={knobs.silence} onChange={(v) => setKnobs({ ...knobs, silence: v })} title="How much rest and space between phrases — full to spacious." />
      </div>

      <div className="row footer chip">
        <button
          type="button"
          className="chip-btn"
          onClick={cycleVoice}
          aria-label="voice"
          title="Click to cycle the voice flavour: santoor, koto, sitar, mallet, qanun, kalimba."
        >
          VOICE {VOICE_LABELS[voiceId]}
        </button>

        <span className="oct" title="Shift the whole voice up or down by whole octaves (−2 to +2).">
          OCT
          <button type="button" onClick={() => changeOctave(-1)} aria-label="octave down">−</button>
          <span style={{ minWidth: 18, textAlign: "center" }}>{octLabel}</span>
          <button type="button" onClick={() => changeOctave(1)} aria-label="octave up">+</button>
        </span>

        <span className="vol" title="Master output volume.">
          VOL
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            aria-label="volume"
            onChange={(e) => changeVolume(parseFloat(e.target.value))}
          />
        </span>

        <button
          type="button"
          className="chip-btn"
          onClick={toggleLink}
          aria-label="timing mode"
          title="Free timing, or lock note onsets to Ableton Link's ½-beat grid (needs the mpump Link Bridge running)."
        >
          TIMING {linkLabel}
        </button>
      </div>
    </main>
  );
}
