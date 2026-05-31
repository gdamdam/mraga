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
import { enableLinkBridge, onLinkState, type LinkState } from "./engine/linkBridge";
import { THEME_IDS, THEMES, applyTheme, loadThemeId, type ThemeId } from "./themes";

// Block-art wordmark in mdrone's style (rendered with the .title-art glow).
const LOGO = "█▀▄▀█ █▀█ █▀█ █▀▀ █▀█\n█ ▀ █ █▀▄ █▀█ █▄█ █▀█";

const VOICE_KEY = "mraga-voice";
const TIMING_KEY = "mraga-timing";
const BPM_KEY = "mraga-bpm";
const VOL_KEY = "mraga-volume";
const OCT_KEY = "mraga-octave";

type TimingMode = "free" | "bpm" | "link";
const TIMING_MODES: TimingMode[] = ["free", "bpm", "link"];

function loadVoiceId(): VoiceId {
  const stored = localStorage.getItem(VOICE_KEY);
  return (VOICE_IDS as string[]).includes(stored ?? "") ? (stored as VoiceId) : "santoor";
}
function loadTiming(): TimingMode {
  const stored = localStorage.getItem(TIMING_KEY);
  return (TIMING_MODES as string[]).includes(stored ?? "") ? (stored as TimingMode) : "free";
}
function loadBpm(): number {
  const v = parseFloat(localStorage.getItem(BPM_KEY) ?? "");
  return Number.isFinite(v) ? Math.max(40, Math.min(240, v)) : 80;
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
  const [timingMode, setTimingMode] = useState<TimingMode>(loadTiming);
  const [bpm, setBpm] = useState<number>(loadBpm);
  const [linkState, setLinkState] = useState<LinkState>({
    tempo: 120, beat: 0, phase: 0, playing: false, peers: 0, clients: 0, connected: false,
  });
  const [theme, setTheme] = useState<ThemeId>(loadThemeId);

  const titleRef = useRef<HTMLHeadingElement>(null);
  const voiceRef = useRef<Voice | null>(null);
  const schedRef = useRef<Scheduler | null>(null);
  const stateRef = useRef<EngineState>(initState());
  const rngRef = useRef<() => number>(makeRng(Date.now() & 0xffff));
  const knobsRef = useRef(knobs);
  const tuningRef = useRef(tuning);
  const linkClockRef = useRef(new LinkClock());      // fed by the Ableton bridge
  const internalClockRef = useRef(new LinkClock());  // self-driven at `bpm`
  const linkActiveRef = useRef(false);
  const timingModeRef = useRef(timingMode);
  const bpmRef = useRef(bpm);
  const octaveShiftRef = useRef(octaveShift);
  knobsRef.current = knobs;
  tuningRef.current = tuning;
  linkActiveRef.current = timingMode === "link" && linkState.connected;
  timingModeRef.current = timingMode;
  bpmRef.current = bpm;
  octaveShiftRef.current = octaveShift;

  // Seed the internal BPM grid from the current audio clock (no-op before audio).
  function seedInternalClock() {
    if (voiceRef.current) {
      internalClockRef.current.update(bpmRef.current, 0, voiceRef.current.ctx.currentTime);
    }
  }

  // Subscribe to the bridge once; feed the link clock and mirror state into React.
  useEffect(() => {
    const unsub = onLinkState((s) => {
      if (s.connected && voiceRef.current) {
        linkClockRef.current.update(s.tempo, s.beat, voiceRef.current.ctx.currentTime);
      } else if (!s.connected) {
        linkClockRef.current.reset();
      }
      setLinkState(s);
    });
    enableLinkBridge(loadTiming() === "link");
    return unsub;
  }, []);

  // Apply the colour theme (and re-apply on change).
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Character: the logo glows/flickers with the voice's output level — like a
  // struck string lighting up. Mirrors mdrone's incandescent RMS pulse.
  useEffect(() => {
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      const el = titleRef.current;
      const lvl = voiceRef.current?.getLevel() ?? 0;
      smooth += (lvl - smooth) * 0.3;
      if (el) {
        const lit = Math.min(1, Math.sqrt(smooth * 12));
        el.style.filter = `brightness(${(0.62 + 0.38 * lit).toFixed(3)})`;
        const t = performance.now() / 1000;
        const amp = smooth * 1.2;
        el.style.transform = `translate(${(Math.sin(t * 23.1) * amp).toFixed(2)}px, ${(Math.cos(t * 29.7) * amp).toFixed(2)}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  async function loadLink() {
    setTuning(await importTuningFromUrl(linkInput));
  }

  function selectVoice(id: VoiceId) {
    setVoiceId(id);
    localStorage.setItem(VOICE_KEY, id);
    voiceRef.current?.setPreset(getPreset(id));
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

  function changeBpm(v: number) {
    const next = Math.max(40, Math.min(240, v));
    setBpm(next);
    bpmRef.current = next;
    localStorage.setItem(BPM_KEY, String(next));
    seedInternalClock(); // re-anchor the internal grid to the new tempo
  }

  function changeTiming(mode: TimingMode) {
    setTimingMode(mode);
    timingModeRef.current = mode;
    localStorage.setItem(TIMING_KEY, mode);
    enableLinkBridge(mode === "link");
    if (mode === "bpm") seedInternalClock();
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
    seedInternalClock();
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
      // Onset grid: Ableton bridge when linked+connected; else the internal BPM
      // grid when timing="bpm"; else free (identity).
      quantize: (rawTime) => {
        if (linkActiveRef.current) return linkClockRef.current.nextGridTime(rawTime, 0.5);
        if (timingModeRef.current === "bpm") return internalClockRef.current.nextGridTime(rawTime, 0.5);
        return rawTime;
      },
    });
    schedRef.current = sched;
    sched.run(25);
    setPlaying(true);
  }

  const octLabel = octaveShift > 0 ? `+${octaveShift}` : String(octaveShift);
  const linkStatus = linkState.connected
    ? `${linkState.tempo.toFixed(1)} BPM · ${linkState.peers} peer${linkState.peers === 1 ? "" : "s"}`
    : "searching…";

  return (
    <main className="mraga">
      <div className="row">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 ref={titleRef} className="title-art" aria-label="mraga">{LOGO}</h1>
            <span className="chip" title="mraga version">v{__APP_VERSION__}</span>
          </div>
          <div className="tagline">a conducted line over the drone</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <label className="sel" title="Colour theme — toggle to taste.">
            THEME
            <select value={theme} aria-label="theme" onChange={(e) => setTheme(e.target.value as ThemeId)}>
              {THEME_IDS.map((id) => (
                <option key={id} value={id}>{THEMES[id].label}</option>
              ))}
            </select>
          </label>
          <span
            className="chip"
            title="The drone scene mraga is locked to (tonic + microtonal tuning). Paste an mdrone link to change it."
          >
            ◈ linked: {tuning.label}
          </span>
        </div>
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
        <label className="sel" title="Voice flavour — the struck/plucked timbre.">
          VOICE
          <select value={voiceId} aria-label="voice" onChange={(e) => selectVoice(e.target.value as VoiceId)}>
            {VOICE_IDS.map((id) => (
              <option key={id} value={id}>{VOICE_LABELS[id]}</option>
            ))}
          </select>
        </label>

        <span className="oct" title="Shift the whole voice up or down by whole octaves (−2 to +2).">
          OCT
          <button type="button" onClick={() => changeOctave(-1)} aria-label="octave down">−</button>
          <span style={{ minWidth: 18, textAlign: "center" }}>{octLabel}</span>
          <button type="button" onClick={() => changeOctave(1)} aria-label="octave up">+</button>
        </span>

        <span className="vol" title="Master output volume.">
          VOL
          <input type="range" min={0} max={1} step={0.01} value={volume} aria-label="volume" onChange={(e) => changeVolume(parseFloat(e.target.value))} />
        </span>

        <span className="bpm" title="Tempo for the internal BPM grid (used when TIMING = bpm; overridden by Ableton Link).">
          BPM
          <input type="number" min={40} max={240} step={1} value={bpm} aria-label="bpm" onChange={(e) => changeBpm(parseFloat(e.target.value))} />
        </span>

        <label className="sel" title="Timing: free (ametric) · bpm (snap onsets to the internal grid) · link (snap to Ableton Link via the mpump Link Bridge).">
          TIMING
          <select value={timingMode} aria-label="timing mode" onChange={(e) => changeTiming(e.target.value as TimingMode)}>
            <option value="free">free</option>
            <option value="bpm">bpm grid</option>
            <option value="link">ableton link</option>
          </select>
          {timingMode === "link" && <span style={{ marginLeft: 6 }}>· {linkStatus}</span>}
        </label>
      </div>
    </main>
  );
}
