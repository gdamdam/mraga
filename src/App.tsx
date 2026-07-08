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
import { Tanpura } from "./tanpura";
import { RAGA_IDS, RAGAS, getRaga, ragaMasks, ragaBoost, ragaOrnaments } from "./ragas";
import { getTaal, taalPositionAt, taalBias, TAAL_IDS, TAALS, type TaalId, type TaalPosition } from "./taal";
import { arcKnobs, arcPhaseAt, ARC_DURATIONS_MIN, type ArcPhase } from "./arc";
import { encodeWav } from "./recorder";
import { createMbusClient, type MbusClient, type Publication, type BridgeState } from "./transport/mbus";
import { LinkClock } from "./linkClock";
import { enableLinkBridge, onLinkState, type LinkState } from "./engine/linkBridge";
import { THEME_IDS, THEMES, applyTheme, loadThemeId, type ThemeId } from "./themes";
import { sceneToUrl, sceneFromUrl, type MragaScene } from "./mragaScene";
import { loadPresets, savePresets, upsertPreset, deletePreset, type Preset } from "./presets";
import { createMidiOut, type MidiOut, type MidiMode } from "./midi";

// Block-art wordmark in mdrone's style (rendered with the .title-art glow).
const LOGO = "█▀▄▀█ █▀█ █▀█ █▀▀ █▀█\n█ ▀ █ █▀▄ █▀█ █▄█ █▀█";

// Sargam degree names (matches PitchLadder) — for the active-note readout.
const SARGAM = ["Sa", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N"];

const VOICE_KEY = "mraga-voice";
const TIMING_KEY = "mraga-timing";
const BPM_KEY = "mraga-bpm";
const VOL_KEY = "mraga-volume";
const OCT_KEY = "mraga-octave";
const RAGA_KEY = "mraga-raga";
const DRONE_KEY = "mraga-drone";
const DRONE_LVL_KEY = "mraga-drone-level";
const ARC_KEY = "mraga-arc";
const TAAL_KEY = "mraga-taal";
const GAMAKA_KEY = "mraga-gamaka";
const MIDI_MODE_KEY = "mraga-midi-mode";
const STAGELOCK_KEY = "mraga-stagelock";

type TimingMode = "free" | "bpm" | "link";
const TIMING_MODES: TimingMode[] = ["free", "bpm", "link"];
// The five knobs the performance arc drives (THEME/FOCUS stay the user's).
const ARC_KNOBS = ["density", "rhythm", "silence", "register", "restlessness"] as const;
type ArcKnobKey = (typeof ARC_KNOBS)[number];

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
  return Number.isFinite(v) ? Math.max(-2, Math.min(2, v)) : -1;
}
function loadRagaId(): string {
  const stored = localStorage.getItem(RAGA_KEY) ?? "";
  return getRaga(stored) ? stored : "";
}
function loadDroneOn(): boolean {
  return localStorage.getItem(DRONE_KEY) === "1";
}
function loadDroneLevel(): number {
  const v = parseFloat(localStorage.getItem(DRONE_LVL_KEY) ?? "");
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;
}
function loadArcMin(): number {
  const v = parseInt(localStorage.getItem(ARC_KEY) ?? "", 10);
  return ARC_DURATIONS_MIN.includes(v) ? v : 0;
}
function loadTaal(): TaalId {
  const stored = (localStorage.getItem(TAAL_KEY) ?? "off") as TaalId;
  return (TAAL_IDS as string[]).includes(stored) ? stored : "off";
}
function loadGamaka(): boolean {
  return localStorage.getItem(GAMAKA_KEY) === "1";
}
function loadMidiMode(): MidiMode {
  return localStorage.getItem(MIDI_MODE_KEY) === "mpe" ? "mpe" : "single";
}

export function App() {
  const [tuning, setTuning] = useState<PortableTuning>(DEFAULT_TUNING);
  const [linkInput, setLinkInput] = useState("");
  const [playing, setPlaying] = useState(false);
  const [activeDegree, setActiveDegree] = useState<number | null>(null);
  const [knobs, setKnobs] = useState<Knobs>({ density: 0.5, register: 0.5, restlessness: 0.2, silence: 0.25, rhythm: 0.8, theme: 0.55, focus: 0.5 });
  const [seed, setSeed] = useState<number>(() => Date.now() & 0xffff);
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [selectedPreset, setSelectedPreset] = useState("");
  const [midiName, setMidiName] = useState<string | null>(null);
  const midiOutRef = useRef<MidiOut | null>(null);
  const [voiceId, setVoiceId] = useState<VoiceId>(loadVoiceId);
  const [volume, setVolume] = useState<number>(loadVolume);
  const [octaveShift, setOctaveShift] = useState<number>(loadOctave);
  const [timingMode, setTimingMode] = useState<TimingMode>(loadTiming);
  const [bpm, setBpm] = useState<number>(loadBpm);
  const [linkState, setLinkState] = useState<LinkState>({
    tempo: 120, beat: 0, phase: 0, playing: false, peers: 0, clients: 0, connected: false,
  });
  const [theme, setTheme] = useState<ThemeId>(loadThemeId);
  const [shared, setShared] = useState(false);
  const [ragaId, setRagaId] = useState<string>(loadRagaId);
  const [droneOn, setDroneOn] = useState<boolean>(loadDroneOn);
  const [droneLevel, setDroneLevel] = useState<number>(loadDroneLevel);
  const [arcMin, setArcMin] = useState<number>(loadArcMin);
  const [arcStatus, setArcStatus] = useState<{ phase: ArcPhase; pct: number; remainingSec: number } | null>(null);
  // The arc's current knob values, mirrored for the sliders so an arc-owned knob
  // shows what's actually playing (grabbing it then causes no discontinuity).
  const [arcDriven, setArcDriven] = useState<ReturnType<typeof arcKnobs> | null>(null);
  const [pullDegree, setPullDegree] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [mbusOn, setMbusOn] = useState(false); // session-transient by convention
  const [mbusState, setMbusState] = useState<BridgeState>("idle");
  const [taalId, setTaalId] = useState<TaalId>(loadTaal);
  const [taalPos, setTaalPos] = useState<TaalPosition | null>(null);
  const [gamakaOn, setGamakaOn] = useState<boolean>(loadGamaka);
  const [midiMode, setMidiMode] = useState<MidiMode>(loadMidiMode);
  const [stageLock, setStageLock] = useState<boolean>(() => localStorage.getItem(STAGELOCK_KEY) === "1");

  const titleRef = useRef<HTMLHeadingElement>(null);
  const voiceRef = useRef<Voice | null>(null);
  const schedRef = useRef<Scheduler | null>(null);
  const playingRef = useRef(false); // guards async ladder-light timeouts after STOP
  const hasPlayedRef = useRef(false); // first-run hint hides once the user has played
  const stateRef = useRef<EngineState>(initState());
  const rngRef = useRef<() => number>(makeRng(seed));
  const knobsRef = useRef(knobs);
  const tuningRef = useRef(tuning);
  const linkClockRef = useRef(new LinkClock());      // fed by the Ableton bridge
  const internalClockRef = useRef(new LinkClock());  // self-driven at `bpm`
  const linkActiveRef = useRef(false);
  const timingModeRef = useRef(timingMode);
  const bpmRef = useRef(bpm);
  const octaveShiftRef = useRef(octaveShift);
  const ragaRef = useRef(ragaId);
  const pullRef = useRef<number | null>(pullDegree);
  const droneOnRef = useRef(droneOn);
  const droneLevelRef = useRef(droneLevel);
  const arcMinRef = useRef(arcMin);
  const arcRef = useRef<{ t0: number; durSec: number } | null>(null); // live arc window (audio clock)
  const taalRef = useRef(taalId);
  const gamakaRef = useRef(gamakaOn);
  // Knobs the user has grabbed while the arc is engaged — the arc stops driving
  // these so manual intervention takes over without a jump (M7).
  const takenKnobsRef = useRef<Set<ArcKnobKey>>(new Set());
  const tanpuraRef = useRef<Tanpura | null>(null);
  if (!tanpuraRef.current) tanpuraRef.current = new Tanpura();
  const mbusClientRef = useRef<MbusClient | null>(null);
  const mbusPubRef = useRef<Publication | null>(null);
  knobsRef.current = knobs;
  tuningRef.current = tuning;
  linkActiveRef.current = timingMode === "link" && linkState.connected;
  timingModeRef.current = timingMode;
  bpmRef.current = bpm;
  octaveShiftRef.current = octaveShift;
  ragaRef.current = ragaId;
  pullRef.current = pullDegree;
  droneOnRef.current = droneOn;
  droneLevelRef.current = droneLevel;
  arcMinRef.current = arcMin;
  taalRef.current = taalId;
  gamakaRef.current = gamakaOn;

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
    // Blur with an empty field must not reset a tuning loaded elsewhere
    // (e.g. from a shared ?s= scene) back to the default.
    if (!linkInput.trim()) return;
    setTuning(await importTuningFromUrl(linkInput));
  }

  // Reroll the improvisation: a new seed reseeds the PRNG and restarts the
  // phrase state. Takes effect live (the scheduler reads these refs each pull).
  function reseed(s: number) {
    setSeed(s);
    rngRef.current = makeRng(s);
    stateRef.current = initState();
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
    if (!Number.isFinite(v)) return; // clearing the number field yields NaN
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

  async function ensureVoice(): Promise<Voice> {
    if (!voiceRef.current) voiceRef.current = await createVoice();
    await voiceRef.current.resume();
    return voiceRef.current;
  }

  function selectRaga(id: string) {
    const valid = getRaga(id) ? id : "";
    setRagaId(valid);
    ragaRef.current = valid;
    localStorage.setItem(RAGA_KEY, valid);
  }

  // --- tanpura drone (independent of melody PLAY/STOP) ---
  function startDrone(v: Voice) {
    v.setDroneLevel(droneLevelRef.current);
    tanpuraRef.current!.start(v, () => ({
      tonicHz: tuningRef.current.tonicHz, // unshifted: the drone holds the room's Sa
      scaleCents: tuningRef.current.scaleCents,
    }));
  }

  async function toggleDrone() {
    const next = !droneOn;
    setDroneOn(next);
    droneOnRef.current = next;
    localStorage.setItem(DRONE_KEY, next ? "1" : "0");
    if (next) startDrone(await ensureVoice());
    else tanpuraRef.current!.stop();
  }

  function changeDroneLevel(v: number) {
    setDroneLevel(v);
    droneLevelRef.current = v;
    localStorage.setItem(DRONE_LVL_KEY, String(v));
    voiceRef.current?.setDroneLevel(v);
  }

  // --- performance arc ---
  function changeArc(min: number) {
    setArcMin(min);
    arcMinRef.current = min;
    localStorage.setItem(ARC_KEY, String(min));
    // Changing the arc while playing (re)starts it from now.
    if (playingRef.current && voiceRef.current) {
      arcRef.current = min > 0 ? { t0: voiceRef.current.ctx.currentTime, durSec: min * 60 } : null;
      takenKnobsRef.current.clear();
    }
  }

  // --- knobs: Stage Lock blocks accidental moves; arc-owned knobs the user
  // grabs are "taken" so the arc stops driving them (graceful manual takeover) ---
  function setKnob(key: keyof Knobs, v: number) {
    if (stageLock) return; // Stage Lock: no accidental large changes
    if (arcRef.current && (ARC_KNOBS as readonly string[]).includes(key)) {
      takenKnobsRef.current.add(key as ArcKnobKey);
    }
    setKnobs((k) => ({ ...k, [key]: v }));
  }

  function changeTaal(id: TaalId) {
    const valid = (TAAL_IDS as string[]).includes(id) ? id : "off";
    setTaalId(valid);
    taalRef.current = valid;
    localStorage.setItem(TAAL_KEY, valid);
    if (valid === "off") setTaalPos(null);
  }

  function toggleGamaka() {
    const next = !gamakaOn;
    setGamakaOn(next);
    gamakaRef.current = next;
    localStorage.setItem(GAMAKA_KEY, next ? "1" : "0");
  }

  function toggleStageLock() {
    setStageLock((prev) => {
      const next = !prev;
      localStorage.setItem(STAGELOCK_KEY, next ? "1" : "0");
      return next;
    });
  }

  function changeMidiMode(mode: MidiMode) {
    setMidiMode(mode);
    localStorage.setItem(MIDI_MODE_KEY, mode);
    midiOutRef.current?.setMode(mode); // silences all notes, then switches
  }

  // --- conducting: tap a ladder degree to pull the line toward it ---
  function conduct(i: number) {
    setPullDegree((p) => {
      const next = p === i ? null : i;
      pullRef.current = next;
      return next;
    });
  }

  // --- WAV recording ---
  async function toggleRec() {
    if (!recording) {
      const v = await ensureVoice();
      v.startRecording();
      setRecording(true);
      return;
    }
    setRecording(false);
    const v = voiceRef.current;
    if (!v) return;
    const { left, right, sampleRate } = await v.stopRecording();
    if (left.length === 0) return; // nothing captured
    const blob = new Blob([encodeWav(left, right, sampleRate)], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mraga-${seed.toString(16)}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  // --- mbus publishing (session-transient, off by default per suite convention) ---
  async function toggleMbus() {
    if (!mbusOn) await ensureVoice(); // so the publish tap exists
    setMbusOn((v) => !v);
  }

  // Reconcile the mbus intent with the live graph (mirrors mvox's pattern).
  useEffect(() => {
    const tap = voiceRef.current?.getPublishTap() ?? null;
    if (mbusPubRef.current && !mbusOn) {
      mbusPubRef.current.stop();
      mbusPubRef.current = null;
    }
    if (mbusOn && tap && !mbusPubRef.current) {
      mbusClientRef.current ??= createMbusClient();
      mbusClientRef.current.connect();
      mbusPubRef.current = mbusClientRef.current.publishOutput(tap, "mraga");
    }
    if (!mbusOn) mbusClientRef.current?.disconnect();
    return mbusClientRef.current?.onState(setMbusState);
  }, [mbusOn]);

  // Snapshot the full sound for sharing.
  function currentScene(): MragaScene {
    return {
      v: 1,
      knobs: { ...knobs, rhythm: knobs.rhythm ?? 0.8, theme: knobs.theme ?? 0.7, focus: knobs.focus ?? 0 },
      voice: voiceId,
      octave: octaveShift,
      volume,
      timing: timingMode,
      bpm,
      theme,
      seed,
      tuning: { tonicHz: tuning.tonicHz, scaleCents: tuning.scaleCents, label: tuning.label },
      raga: ragaId,
      drone: droneOn,
      droneLevel,
      taal: taalId,
      gamaka: gamakaOn,
    };
  }

  // Restore state from a shared scene, persisting and applying side-effects so
  // the running engine / audio reflect the loaded sound immediately.
  function applyScene(s: MragaScene) {
    if (s.knobs) setKnobs(s.knobs);
    if (s.voice) {
      setVoiceId(s.voice as VoiceId);
      localStorage.setItem(VOICE_KEY, s.voice);
      voiceRef.current?.setPreset(getPreset(s.voice as VoiceId));
    }
    if (typeof s.octave === "number") {
      setOctaveShift(s.octave);
      localStorage.setItem(OCT_KEY, String(s.octave));
    }
    if (typeof s.volume === "number") {
      setVolume(s.volume);
      localStorage.setItem(VOL_KEY, String(s.volume));
      voiceRef.current?.setVolume(s.volume);
    }
    if (typeof s.bpm === "number") {
      setBpm(s.bpm);
      bpmRef.current = s.bpm;
      localStorage.setItem(BPM_KEY, String(s.bpm));
      seedInternalClock();
    }
    if (s.theme) setTheme(s.theme as ThemeId); // the theme effect applies it
    if (s.timing) {
      setTimingMode(s.timing);
      timingModeRef.current = s.timing;
      localStorage.setItem(TIMING_KEY, s.timing);
      enableLinkBridge(s.timing === "link");
    }
    if (s.tuning) {
      setTuning({ tonicHz: s.tuning.tonicHz, scaleCents: s.tuning.scaleCents, label: s.tuning.label });
    }
    if (typeof s.raga === "string") selectRaga(s.raga);
    if (typeof s.taal === "string") changeTaal((TAAL_IDS as string[]).includes(s.taal) ? (s.taal as TaalId) : "off");
    if (typeof s.gamaka === "boolean") {
      setGamakaOn(s.gamaka);
      gamakaRef.current = s.gamaka;
      localStorage.setItem(GAMAKA_KEY, s.gamaka ? "1" : "0");
    }
    if (typeof s.droneLevel === "number") changeDroneLevel(Math.max(0, Math.min(1, s.droneLevel)));
    if (typeof s.drone === "boolean") {
      setDroneOn(s.drone);
      droneOnRef.current = s.drone;
      localStorage.setItem(DRONE_KEY, s.drone ? "1" : "0");
      // Audio may not exist yet (URL load before any gesture): the drone then
      // starts on the next PLAY. With a live voice, apply immediately.
      if (s.drone && voiceRef.current) startDrone(voiceRef.current);
      if (!s.drone) tanpuraRef.current!.stop();
    }
    if (typeof s.seed === "number") reseed(s.seed);
  }

  function saveCurrentPreset() {
    const name = window.prompt("Save preset as:")?.trim();
    if (!name) return;
    const next = upsertPreset(presets, name, currentScene());
    setPresets(next);
    savePresets(next);
    setSelectedPreset(name);
  }

  function recallPreset(name: string) {
    setSelectedPreset(name);
    const p = presets.find((x) => x.name === name);
    if (p) applyScene(p.scene);
  }

  function removeSelectedPreset() {
    if (!selectedPreset) return;
    const next = deletePreset(presets, selectedPreset);
    setPresets(next);
    savePresets(next);
    setSelectedPreset("");
  }

  async function toggleMidi() {
    if (midiOutRef.current) {
      midiOutRef.current.dispose();
      midiOutRef.current = null;
      setMidiName(null);
      return;
    }
    const out = await createMidiOut(midiMode);
    midiOutRef.current = out;
    setMidiName(out ? out.name : "no device / unsupported");
  }

  // Arc progress readout (1 Hz — display only; the pull reads the refs).
  useEffect(() => {
    if (!playing || arcMin <= 0) {
      setArcStatus(null);
      setArcDriven(null);
      return;
    }
    const id = setInterval(() => {
      const arc = arcRef.current;
      const v = voiceRef.current;
      if (!arc || !v) return;
      const elapsed = v.ctx.currentTime - arc.t0;
      const t = Math.max(0, Math.min(1, elapsed / arc.durSec));
      setArcStatus({ phase: arcPhaseAt(t), pct: Math.round(t * 100), remainingSec: Math.max(0, arc.durSec - elapsed) });
      setArcDriven(arcKnobs(t));
    }, 1000);
    return () => clearInterval(id);
  }, [playing, arcMin]);

  // Taal position readout (display only — the pull() reads the refs). Ticks a
  // touch faster than the arc so the sam indicator feels live. Idle when Off or
  // when timing is free (no metric grid → no taal).
  useEffect(() => {
    const taal = getTaal(taalId);
    if (!playing || !taal || timingMode === "free") {
      setTaalPos(null);
      return;
    }
    const id = setInterval(() => {
      const v = voiceRef.current;
      if (!v) return;
      const clock = linkActiveRef.current
        ? linkClockRef.current
        : timingMode === "bpm"
          ? internalClockRef.current
          : null;
      if (clock && clock.valid) setTaalPos(taalPositionAt(taal, clock.beatAt(v.ctx.currentTime)));
    }, 180);
    return () => clearInterval(id);
  }, [playing, taalId, timingMode]);

  // On mount, load a shared scene if the URL carries one (?s=…).
  useEffect(() => {
    const s = sceneFromUrl(window.location.href);
    if (s) applyScene(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function shareScene() {
    const url = sceneToUrl(currentScene(), window.location.origin + window.location.pathname);
    const confirm = () => {
      setShared(true);
      setTimeout(() => setShared(false), 1500);
    };
    if (navigator.clipboard) {
      // Only show "copied ✓" if the write actually succeeded.
      navigator.clipboard.writeText(url).then(confirm, () => window.prompt("Copy link:", url));
    } else {
      window.prompt("Copy link:", url);
    }
  }

  function stopPlayback() {
    schedRef.current?.stop();
    playingRef.current = false;
    setPlaying(false);
    setActiveDegree(null);
    arcRef.current = null;
    setArcStatus(null);
    setArcDriven(null);
    setTaalPos(null);
    takenKnobsRef.current.clear();
    midiOutRef.current?.panic(); // no hung notes on stop
  }

  // Panic: silence external MIDI immediately and stop the melody. Works whether
  // or not playback is running (e.g. to clear a hung external note). Retained
  // under Stage Lock.
  function panic() {
    midiOutRef.current?.panic();
    if (playingRef.current) stopPlayback();
  }

  async function togglePlay() {
    if (playing) {
      stopPlayback();
      return;
    }
    const voice = await ensureVoice();
    voice.setPreset(getPreset(voiceId));
    voice.setVolume(volume);
    if (droneOnRef.current && !tanpuraRef.current!.running) startDrone(voice);
    seedInternalClock();
    stateRef.current = initState();
    arcRef.current = arcMinRef.current > 0
      ? { t0: voice.ctx.currentTime, durSec: arcMinRef.current * 60 }
      : null;
    takenKnobsRef.current.clear();
    const sched = new Scheduler({
      now: () => voiceRef.current!.ctx.currentTime,
      lookaheadSec: 0.12,
      pull: () => {
        // Octave selector transposes the whole voice by shifting the tonic.
        const tonicHz = tuningRef.current.tonicHz * Math.pow(2, octaveShiftRef.current);
        // Performance arc: override the driven knobs along the alap→jor→jhala
        // trajectory; when it completes, end the performance.
        let kn = knobsRef.current;
        const arc = arcRef.current;
        if (arc) {
          const t = (voiceRef.current!.ctx.currentTime - arc.t0) / arc.durSec;
          if (t >= 1) {
            arcRef.current = null;
            setTimeout(stopPlayback, 0); // outside the tick — let scheduled notes ring out
          }
          kn = { ...kn, ...arcKnobs(Math.min(1, t)) };
          // Manual takeover: knobs the user grabbed mid-arc stay under user
          // control (the slider already shows the arc's value → no jump).
          for (const k of takenKnobsRef.current) kn = { ...kn, [k]: knobsRef.current[k] };
        }
        const scale = tuningRef.current.scaleCents;
        const params = knobsToParams(kn, tonicHz);
        // Raga grammar (only defined on a 12-degree lattice).
        const raga = getRaga(ragaRef.current);
        if (raga && scale.length === 12) {
          const masks = ragaMasks(raga, 12, params.focus);
          params.arohaMask = masks.aroha;
          params.avarohaMask = masks.avaroha;
          params.degreeBoost = ragaBoost(raga, 12);
          params.pakadSteps = raga.pakad;
          params.pakadProb = 0.35;
          // Gamaka: authored ornaments from the raga, when enabled.
          if (gamakaRef.current) {
            params.gamaka = ragaOrnaments(raga);
            params.gamakaEnabled = true;
          }
        }
        // Taal: bias phrase/accent/rest/resolution toward structural points, but
        // only when a metric clock is running — free timing stays rubato.
        const taal = getTaal(taalRef.current);
        if (taal) {
          const clock = linkActiveRef.current
            ? linkClockRef.current
            : timingModeRef.current === "bpm"
              ? internalClockRef.current
              : null;
          if (clock && clock.valid) {
            params.taalBias = taalBias(taalPositionAt(taal, clock.beatAt(voiceRef.current!.ctx.currentTime)));
          }
        }
        params.pullDegree = pullRef.current;
        const r = nextEvent(stateRef.current, scale, tonicHz, params, rngRef.current);
        stateRef.current = r.state;
        return r.event;
      },
      onNote: (e, time) => {
        voiceRef.current!.pluck(e.pitchHz, e.velocity, e.glideFromHz);
        midiOutRef.current?.sendNote(e.pitchHz, e.velocity, (e.durationHint || 0.5) * 1000);
        const delayMs = Math.max(0, (time - voiceRef.current!.ctx.currentTime) * 1000);
        setTimeout(() => { if (playingRef.current) setActiveDegree(e.degreeIndex); }, delayMs);
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
    playingRef.current = true;
    hasPlayedRef.current = true;
    sched.run(25);
    setPlaying(true);
  }

  const octLabel = octaveShift > 0 ? `+${octaveShift}` : String(octaveShift);
  // Raga palette for the ladder display: union of ascent+descent (untrimmed).
  const activeRaga = getRaga(ragaId);
  const ragaAllowed =
    activeRaga && tuning.scaleCents.length === 12
      ? (() => {
          const m = ragaMasks(activeRaga, 12, 0);
          return m.aroha.map((v, i) => v || m.avaroha[i]);
        })()
      : null;
  const linkStatus = linkState.connected
    ? `${linkState.tempo.toFixed(1)} BPM · ${linkState.peers} peer${linkState.peers === 1 ? "" : "s"}`
    : "searching…";

  // Display value for a knob: while the arc drives it (and the user hasn't taken
  // it over), show the arc's live value so the slider matches what's playing —
  // then grabbing it causes no discontinuity.
  const KNOB_DEFAULT: Record<string, number> = { rhythm: 0.8, theme: 0.7, focus: 0 };
  const knobVal = (key: keyof Knobs): number => {
    const user = knobs[key] ?? KNOB_DEFAULT[key] ?? 0;
    if (arcDriven && (ARC_KNOBS as readonly string[]).includes(key) && !takenKnobsRef.current.has(key as ArcKnobKey)) {
      return (arcDriven as Record<string, number>)[key] ?? user;
    }
    return user;
  };
  const arcOwns = (key: ArcKnobKey) => !!arcDriven && !takenKnobsRef.current.has(key);

  // Ladder feedback: per-degree role (Sa / vadi / samvadi / pakad) for the raga.
  const ladderRoles: (string | null)[] | null = activeRaga
    ? (() => {
        const pakadDegrees = new Set(activeRaga.pakad.map((s) => ((s % 12) + 12) % 12));
        return tuning.scaleCents.map((_, i) =>
          i === 0 ? "Sa" : i === activeRaga.vadi ? "vadi" : i === activeRaga.samvadi ? "samvadi" : pakadDegrees.has(i) ? "pakad" : null,
        );
      })()
    : null;

  // Readout for the note sounding now: degree name + cents + ratio + role.
  const activeReadout =
    activeDegree != null && activeDegree < tuning.scaleCents.length
      ? {
          name: SARGAM[activeDegree] ?? String(activeDegree),
          cents: tuning.scaleCents[activeDegree],
          ratio: Math.pow(2, tuning.scaleCents[activeDegree] / 1200),
          role: ladderRoles?.[activeDegree] ?? null,
        }
      : null;

  const fmtRemaining = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

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
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <label className="sel" title="Saved presets — recall a sound you saved.">
            PRESET
            <select value={selectedPreset} aria-label="presets" onChange={(e) => recallPreset(e.target.value)}>
              <option value="">—</option>
              {presets.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </label>
          <button type="button" className="chip-btn" onClick={saveCurrentPreset} title="Save the current sound as a named preset.">
            save
          </button>
          {selectedPreset && (
            <button type="button" className="chip-btn" onClick={removeSelectedPreset} title="Delete the selected preset.">
              ✕
            </button>
          )}
          <button
            type="button"
            className="chip-btn"
            onClick={() => reseed((Math.random() * 0x100000000) >>> 0)}
            title="Reroll — generate a different improvisation. The displayed seed changes each click and is saved in the share link, so a shared sound replays identically."
          >
            🎲 {seed.toString(16)}
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={shareScene}
            title="Copy a link that restores this exact sound (voice, knobs, octave, volume, timing, theme, tuning, seed)."
          >
            {shared ? "copied ✓" : "SHARE"}
          </button>
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
        <button
          type="button"
          className="chip-btn"
          onClick={panic}
          title="Panic — immediately silence external MIDI (all-notes-off + bend reset) and stop the line. Always available, even under Stage Lock."
        >
          ✋ panic
        </button>
        <button
          type="button"
          className={"chip-btn" + (stageLock ? " on" : "")}
          onClick={toggleStageLock}
          aria-pressed={stageLock}
          title="Stage Lock — freezes the knobs so a stray touch can't wreck a performance. Transport, conducting (ladder taps), panic and intentional preset recall still work. Toggle off to edit knobs."
        >
          {stageLock ? "🔒 locked" : "🔓 lock"}
        </button>
      </div>
      {!playing && !hasPlayedRef.current && (
        <div className="first-run deg-label" style={{ margin: "6px 0", opacity: 0.75 }}>
          new here? <strong>pick a raga</strong> → <strong>▶ Play</strong> → tap the ladder to <strong>conduct</strong> → add <strong>◉ drone</strong> → try an <strong>ARC</strong>.
        </div>
      )}

      <PitchLadder
        scaleCents={tuning.scaleCents}
        activeDegree={activeDegree}
        allowedDegrees={ragaAllowed}
        pulledDegree={pullDegree}
        roles={ladderRoles}
        onSelectDegree={conduct}
      />
      <div className="ladder-readout deg-label" aria-live="polite" style={{ minHeight: 18, marginTop: 2 }}>
        {activeReadout ? (
          <>
            <strong>{activeReadout.name}</strong>
            {" · "}
            {activeReadout.cents.toFixed(0)}¢ · {activeReadout.ratio.toFixed(3)}×
            {activeReadout.role && <> · <span className="chip" style={{ padding: "0 6px" }}>{activeReadout.role}</span></>}
          </>
        ) : (
          <span style={{ opacity: 0.6 }}>tap a column to conduct — pull the line toward a degree</span>
        )}
        {pullDegree != null && <span style={{ marginLeft: 8, opacity: 0.85 }}>→ pulling toward {SARGAM[pullDegree] ?? pullDegree}</span>}
      </div>

      <div className="knobs" aria-disabled={stageLock}>
        <Knob label={arcOwns("density") ? "DENSITY ◆" : "DENSITY"} lowPole="sparse" highPole="busy" value={knobVal("density")} onChange={(v) => setKnob("density", v)} title={"How often notes occur — sparse to busy." + (stageLock ? " (Stage Lock on)" : arcOwns("density") ? " ◆ driven by the Arc — grab to take over." : "")} />
        <Knob label={arcOwns("register") ? "REGISTER ◆" : "REGISTER"} lowPole="low" highPole="high" value={knobVal("register")} onChange={(v) => setKnob("register", v)} title={"Centre pitch of the melodic line — low to high." + (stageLock ? " (Stage Lock on)" : arcOwns("register") ? " ◆ driven by the Arc — grab to take over." : "")} />
        <Knob label={arcOwns("restlessness") ? "RESTLESS ◆" : "RESTLESS"} lowPole="calm" highPole="roam" value={knobVal("restlessness")} onChange={(v) => setKnob("restlessness", v)} title={"How far the line wanders from home — calm to roaming." + (stageLock ? " (Stage Lock on)" : arcOwns("restlessness") ? " ◆ driven by the Arc — grab to take over." : "")} />
        <Knob label={arcOwns("silence") ? "SILENCE ◆" : "SILENCE"} lowPole="full" highPole="spacious" value={knobVal("silence")} onChange={(v) => setKnob("silence", v)} title={"How much rest and space between phrases — full to spacious." + (stageLock ? " (Stage Lock on)" : arcOwns("silence") ? " ◆ driven by the Arc — grab to take over." : "")} />
        <Knob label={arcOwns("rhythm") ? "RHYTHM ◆" : "RHYTHM"} lowPole="loose" highPole="tight" value={knobVal("rhythm")} onChange={(v) => setKnob("rhythm", v)} title={"Timing feel — loose/rubato to a tight, metronomic pulse." + (stageLock ? " (Stage Lock on)" : arcOwns("rhythm") ? " ◆ driven by the Arc — grab to take over." : "")} />
        <Knob label="THEME" lowPole="free" highPole="locked" value={knobVal("theme")} onChange={(v) => setKnob("theme", v)} title={"Motif lock — invent new material (free) ↔ repeat one figure (locked). Higher = less random." + (stageLock ? " (Stage Lock on)" : "")} />
        <Knob label="FOCUS" lowPole="wide" highPole="tight" value={knobVal("focus")} onChange={(v) => setKnob("focus", v)} title={"Note palette — all scale degrees (wide) ↔ a few characteristic notes (tight)." + (stageLock ? " (Stage Lock on)" : "")} />
      </div>

      <div className="row footer chip">
        <label className="sel" title="Raga grammar — constrains ascent/descent to the raga's notes, leans on its vadi/samvadi, and weaves in its signature phrase (pakad). free = no grammar (tuning + FOCUS only).">
          RAGA
          <select value={ragaId} aria-label="raga" onChange={(e) => selectRaga(e.target.value)}>
            <option value="">free</option>
            {RAGA_IDS.map((id) => (
              <option key={id} value={id}>{RAGAS[id].label}</option>
            ))}
          </select>
          {activeRaga && <span style={{ marginLeft: 6 }} className="deg-label">· {activeRaga.mood}</span>}
        </label>

        <button
          type="button"
          className={"chip-btn" + (droneOn ? " on" : "")}
          onClick={toggleDrone}
          title="Built-in tanpura (Pa Sa Sa Sa̠ cycle on the scale's own fifth) — mraga stands alone, no mdrone tab needed. Plays independently of ▶/■."
        >
          ◉ drone {droneOn ? "on" : "off"}
        </button>
        {droneOn && (
          <span className="vol" title="Tanpura level.">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={droneLevel}
              aria-label="drone level"
              onChange={(e) => changeDroneLevel(parseFloat(e.target.value))}
            />
          </span>
        )}

        <label className="sel" title="Performance arc — DENSITY, RHYTHM, SILENCE, REGISTER and RESTLESS follow a slow alap → jor → jhala trajectory (THEME and FOCUS stay yours). Grab a driven knob to take it over; playback ends when the arc completes.">
          ARC
          <select value={String(arcMin)} aria-label="performance arc" onChange={(e) => changeArc(parseInt(e.target.value, 10))}>
            <option value="0">off</option>
            {ARC_DURATIONS_MIN.map((m) => (
              <option key={m} value={String(m)}>{m} min</option>
            ))}
          </select>
          {arcStatus && (
            <span style={{ marginLeft: 6 }} aria-live="polite">
              · {arcStatus.phase} {arcStatus.pct}% · {fmtRemaining(arcStatus.remainingSec)} left
              {(() => {
                const owned = ARC_KNOBS.filter((k) => !takenKnobsRef.current.has(k));
                return owned.length ? <span style={{ opacity: 0.7 }}> · owns {owned.join(" ").toUpperCase()}</span> : <span style={{ opacity: 0.7 }}> · manual</span>;
              })()}
            </span>
          )}
        </label>

        <label className="sel" title="Taal — an optional rhythmic cycle (teental 16 / jhaptal 10 / rupak 7 / ektaal 12). Biases phrase starts, accents, rests and resolution toward the cycle's structural points (especially sam). Needs a metric grid (TIMING = bpm or link); free timing stays rubato.">
          TAAL
          <select value={taalId} aria-label="taal" onChange={(e) => changeTaal(e.target.value as TaalId)}>
            <option value="off">off</option>
            {TAAL_IDS.filter((id) => id !== "off").map((id) => (
              <option key={id} value={id}>{TAALS[id as Exclude<TaalId, "off">].label} {TAALS[id as Exclude<TaalId, "off">].matras}</option>
            ))}
          </select>
          {taalPos && (
            <span style={{ marginLeft: 6 }} aria-live="polite" title="Current cycle position">
              · {taalPos.matra + 1}/{getTaal(taalId)!.matras}
              {taalPos.isSam ? " ✳ sam" : taalPos.isKhali ? " ○ khali" : taalPos.isVibhagStart ? " |" : ""}
            </span>
          )}
        </label>

        <button
          type="button"
          className={"chip-btn" + (gamakaOn ? " on" : "")}
          onClick={toggleGamaka}
          aria-pressed={gamakaOn}
          title="Gamaka — authored ornaments (meend glide, andolan oscillation, kan grace, rare murki) drawn from the selected raga's grammar. Needs a raga; deterministic and seeded."
        >
          gamaka {gamakaOn ? "on" : "off"}
          {gamakaOn && !activeRaga && <span style={{ opacity: 0.7 }}> (pick a raga)</span>}
        </button>

        <button
          type="button"
          className={"chip-btn" + (recording ? " on" : "")}
          onClick={toggleRec}
          title="Record the master output (melody + drone + reverb); stopping downloads a 16-bit stereo WAV."
        >
          {recording ? "■ rec…" : "● rec"}
        </button>

        <button
          type="button"
          className={"chip-btn" + (mbusOn ? " on" : "")}
          onClick={toggleMbus}
          title="Publish mraga's audio to the mbus patchbay so other m-suite tabs can subscribe (needs the bridge companion; Chrome/Firefox). Off by default, never persisted."
        >
          ⇄ mbus{mbusOn ? (mbusState === "connected" ? " · live" : " · searching…") : " off"}
        </button>
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

        <button
          type="button"
          className={"chip-btn" + (midiName ? " on" : "")}
          onClick={toggleMidi}
          aria-pressed={!!midiName}
          title="Send the generated notes to an external MIDI synth/DAW (microtonal via pitch-bend). Click to connect the first available output."
        >
          MIDI {midiName ? `· ${midiName}` : "off"}
        </button>

        <label className="sel" title="MIDI mode. Single Channel: works with any synth, but a new note's pitch-bend retunes every note still ringing (overlap limitation). MPE: rotates notes across channels 2–8, each with its own bend, so overlapping microtonal notes never retune each other (needs an MPE-capable synth).">
          MODE
          <select value={midiMode} aria-label="midi mode" onChange={(e) => changeMidiMode(e.target.value as MidiMode)}>
            <option value="single">single ch</option>
            <option value="mpe">MPE 2–8</option>
          </select>
        </label>
      </div>
    </main>
  );
}
