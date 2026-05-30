import { useRef, useState } from "react";
import { Knob } from "./components/Knob";
import { PitchLadder } from "./components/PitchLadder";
import { importTuningFromUrl, DEFAULT_TUNING, type PortableTuning } from "./linkImport";
import { knobsToParams, type Knobs } from "./conducting";
import { initState, nextEvent, type EngineState } from "./engine";
import { makeRng } from "./rng";
import { Scheduler } from "./scheduler";
import { createVoice, type Voice } from "./voice";

export function App() {
  const [tuning, setTuning] = useState<PortableTuning>(DEFAULT_TUNING);
  const [linkInput, setLinkInput] = useState("");
  const [playing, setPlaying] = useState(false);
  const [activeDegree, setActiveDegree] = useState<number | null>(null);
  const [knobs, setKnobs] = useState<Knobs>({ density: 0.5, register: 0.5, restlessness: 0.4, silence: 0.4 });

  const voiceRef = useRef<Voice | null>(null);
  const schedRef = useRef<Scheduler | null>(null);
  const stateRef = useRef<EngineState>(initState());
  const rngRef = useRef<() => number>(makeRng(Date.now() & 0xffff));
  const knobsRef = useRef(knobs);
  const tuningRef = useRef(tuning);
  knobsRef.current = knobs;
  tuningRef.current = tuning;

  async function loadLink() {
    setTuning(await importTuningFromUrl(linkInput));
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
    });
    schedRef.current = sched;
    sched.run(25);
    setPlaying(true);
  }

  return (
    <main className="mraga">
      <div className="row">
        <h1 style={{ margin: 0, letterSpacing: 2 }}>mraga</h1>
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
        <button className="play" onClick={togglePlay}>{playing ? "■ STOP" : "▶ PLAY"}</button>
      </div>

      <PitchLadder scaleCents={tuning.scaleCents} activeDegree={activeDegree} />

      <div className="knobs">
        <Knob label="DENSITY" lowPole="sparse" highPole="busy" value={knobs.density} onChange={(v) => setKnobs({ ...knobs, density: v })} />
        <Knob label="REGISTER" lowPole="low" highPole="high" value={knobs.register} onChange={(v) => setKnobs({ ...knobs, register: v })} />
        <Knob label="RESTLESS" lowPole="calm" highPole="roam" value={knobs.restlessness} onChange={(v) => setKnobs({ ...knobs, restlessness: v })} />
        <Knob label="SILENCE" lowPole="full" highPole="spacious" value={knobs.silence} onChange={(v) => setKnobs({ ...knobs, silence: v })} />
      </div>

      <div className="row chip">
        <span>VOICE santoor</span>
        <span>TIMING ● free ○ link (soon)</span>
      </div>
    </main>
  );
}
