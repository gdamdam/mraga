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

function loadVoiceId(): VoiceId {
  const stored = localStorage.getItem(VOICE_KEY);
  return (VOICE_IDS as string[]).includes(stored ?? "") ? (stored as VoiceId) : "santoor";
}

export function App() {
  const [tuning, setTuning] = useState<PortableTuning>(DEFAULT_TUNING);
  const [linkInput, setLinkInput] = useState("");
  const [playing, setPlaying] = useState(false);
  const [activeDegree, setActiveDegree] = useState<number | null>(null);
  const [knobs, setKnobs] = useState<Knobs>({ density: 0.5, register: 0.5, restlessness: 0.4, silence: 0.4 });
  const [voiceId, setVoiceId] = useState<VoiceId>(loadVoiceId);
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
  // Link is "active" (quantizing) only when enabled AND connected.
  const linkActiveRef = useRef(false);
  knobsRef.current = knobs;
  tuningRef.current = tuning;
  linkActiveRef.current = linkEnabled && linkState.connected;

  // Subscribe to the bridge once; feed the clock and mirror state into React.
  useEffect(() => {
    const unsub = onLinkState((s) => {
      // Only feed the clock model once audio exists, so beat positions are
      // always timestamped with a real AudioContext time (never 0). The 20 Hz
      // stream re-seeds the model right after PLAY; quantize is identity until
      // the clock is valid + linkActiveRef is set, so this can't misfire.
      if (s.connected && voiceRef.current) {
        clockRef.current.update(s.tempo, s.beat, voiceRef.current.ctx.currentTime);
      } else if (!s.connected) {
        clockRef.current.reset();
      }
      setLinkState(s);
    });
    // On load: persistent connect if the user previously enabled it, else a
    // silent one-shot auto-detect (mirrors mdrone).
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
    stateRef.current = initState();
    const sched = new Scheduler({
      now: () => voiceRef.current!.ctx.currentTime,
      lookaheadSec: 0.12,
      pull: () => {
        const params = knobsToParams(knobsRef.current, tuningRef.current.tonicHz);
        const r = nextEvent(stateRef.current, tuningRef.current.scaleCents, tuningRef.current.tonicHz, params, rngRef.current);
        stateRef.current = r.state;
        return r.event;
      },
      onNote: (e, time) => {
        voiceRef.current!.pluck(e.pitchHz, e.velocity, e.glideFromHz);
        const delayMs = Math.max(0, (time - voiceRef.current!.ctx.currentTime) * 1000);
        setTimeout(() => setActiveDegree(e.degreeIndex), delayMs);
      },
      onRest: () => {},
      // Snap onsets to the half-beat grid only while Link is engaged+connected;
      // identity otherwise, so free timing is unchanged.
      quantize: (rawTime) =>
        linkActiveRef.current ? clockRef.current.nextGridTime(rawTime, 0.5) : rawTime,
    });
    schedRef.current = sched;
    sched.run(25);
    setPlaying(true);
  }

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
          <span className="chip">v{__APP_VERSION__}</span>
        </div>
        <span className="chip">◈ linked: {tuning.label}</span>
      </div>

      <div className="row" style={{ margin: "16px 0" }}>
        <input
          className="link-field"
          placeholder="paste mdrone link …"
          value={linkInput}
          aria-label="mdrone link"
          onChange={(e) => setLinkInput(e.target.value)}
          onBlur={loadLink}
        />
        <button type="button" className="play" onClick={togglePlay}>{playing ? "■ STOP" : "▶ PLAY"}</button>
      </div>

      <PitchLadder scaleCents={tuning.scaleCents} activeDegree={activeDegree} />

      <div className="knobs">
        <Knob label="DENSITY" lowPole="sparse" highPole="busy" value={knobs.density} onChange={(v) => setKnobs({ ...knobs, density: v })} />
        <Knob label="REGISTER" lowPole="low" highPole="high" value={knobs.register} onChange={(v) => setKnobs({ ...knobs, register: v })} />
        <Knob label="RESTLESS" lowPole="calm" highPole="roam" value={knobs.restlessness} onChange={(v) => setKnobs({ ...knobs, restlessness: v })} />
        <Knob label="SILENCE" lowPole="full" highPole="spacious" value={knobs.silence} onChange={(v) => setKnobs({ ...knobs, silence: v })} />
      </div>

      <div className="row chip">
        <button
          type="button"
          onClick={cycleVoice}
          aria-label="voice"
          style={{ background: "none", border: "none", color: "inherit", font: "inherit", cursor: "pointer", padding: 0 }}
        >
          VOICE {VOICE_LABELS[voiceId]}
        </button>
        <button
          type="button"
          onClick={toggleLink}
          aria-label="timing mode"
          style={{ background: "none", border: "none", color: "inherit", font: "inherit", cursor: "pointer", padding: 0 }}
        >
          TIMING {linkLabel}
        </button>
      </div>
    </main>
  );
}
