// src/midi.ts
// Optional MIDI output. mraga is microtonal, so each note is sent as the nearest
// MIDI note plus a 14-bit pitch-bend for the cents offset (±2 semitone bend
// range, the General MIDI default). hzToMidi is pure & unit-tested.
//
// Two modes (src/mpe.ts holds the pure allocator):
//   • Single Channel — all notes on channel 1. Works with any synth, but a new
//     note's bend retunes every note still ringing (documented limitation).
//   • MPE — rotates notes across channels 2..8, each with its own per-note bend,
//     so overlapping microtonal notes never retune each other.
// createMidiOut wraps the Web MIDI API (browser-only, optional — returns null if
// unavailable). Voice stealing, panic, and cleanup live in the pure allocator.

import { MidiVoiceManager, type MidiMode, type MidiMessage } from "./mpe";

export type { MidiMode } from "./mpe";

// Nearest MIDI note + pitch-bend value (0..16383, centre 8192) for an exact Hz.
export function hzToMidi(hz: number): { note: number; bend: number } {
  const midiFloat = 69 + 12 * Math.log2(hz / 440);
  // Clamp to the valid MIDI range — an out-of-range note makes output.send()
  // throw inside the scheduler callback.
  const note = Math.max(0, Math.min(127, Math.round(midiFloat)));
  const centsDev = (midiFloat - note) * 100; // -50..+50
  // ±2 semitones (±200 cents) maps to the full bend range around centre.
  let bend = 8192 + Math.round((centsDev / 200) * 8192);
  bend = Math.max(0, Math.min(16383, bend));
  return { note, bend };
}

// Minimal Web MIDI typings — avoids depending on @types/webmidi for two calls.
interface WebMidiOutput {
  name?: string;
  send: (data: number[], timestamp?: number) => void;
}
interface WebMidiAccess {
  outputs: Map<string, WebMidiOutput>;
  onstatechange: ((e: unknown) => void) | null;
}
interface MidiCapableNavigator {
  requestMIDIAccess?: (opts?: { sysex?: boolean }) => Promise<WebMidiAccess>;
}

export type MidiOut = {
  name: string;
  mode: MidiMode;
  setMode: (mode: MidiMode) => void;
  sendNote: (hz: number, velocity: number, durationMs: number) => void;
  panic: () => void; // all-notes-off + bend reset on every channel
  dispose: () => void;
};

export async function createMidiOut(mode: MidiMode = "single"): Promise<MidiOut | null> {
  const nav = navigator as unknown as MidiCapableNavigator;
  if (!nav.requestMIDIAccess) return null;
  let access: WebMidiAccess;
  try {
    access = await nav.requestMIDIAccess({ sysex: false });
  } catch {
    return null;
  }

  // Track the current output; re-pick if devices change or the current one
  // disappears (hot-plug / disconnect handling).
  const pickOutput = (): WebMidiOutput | null => {
    const outs = Array.from(access.outputs.values());
    return outs.length ? outs[0] : null;
  };
  let out = pickOutput();
  if (!out) return null;

  const mgr = new MidiVoiceManager(mode);
  let disposed = false;

  // Dispatch pure allocator messages to the real port, honouring scheduled
  // timestamps. A throw (e.g. the device vanished mid-send) is swallowed so it
  // can never stall the scheduler callback; we re-pick the output on the next note.
  const flush = (msgs: MidiMessage[]) => {
    if (!out) return;
    for (const m of msgs) {
      try {
        if (m.atMs === undefined) out.send(m.bytes);
        else out.send(m.bytes, m.atMs);
      } catch {
        out = pickOutput(); // device likely disconnected — recover for next time
        return;
      }
    }
  };

  // If the set of outputs changes, panic the old device and re-pick.
  access.onstatechange = () => {
    if (disposed) return;
    const next = pickOutput();
    if (next !== out) {
      flush(mgr.panic());
      out = next;
    }
  };

  return {
    name: out.name ?? "MIDI out",
    get mode() {
      return mgr.getMode();
    },
    setMode: (m: MidiMode) => flush(mgr.setMode(m)),
    sendNote: (hz, velocity, durationMs) => {
      flush(mgr.noteOn(hz, velocity, durationMs, performance.now()).messages);
    },
    panic: () => flush(mgr.panic()),
    dispose: () => {
      disposed = true;
      try {
        flush(mgr.panic());
      } catch {
        /* ignore */
      }
      access.onstatechange = null;
    },
  };
}
