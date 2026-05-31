// src/midi.ts
// Optional MIDI output. mraga is microtonal, so each note is sent as the nearest
// MIDI note plus a 14-bit pitch-bend for the cents offset (±2 semitone bend
// range, the General MIDI default). hzToMidi is pure & unit-tested; createMidiOut
// wraps the Web MIDI API (browser-only, optional — returns null if unavailable).

// Nearest MIDI note + pitch-bend value (0..16383, centre 8192) for an exact Hz.
export function hzToMidi(hz: number): { note: number; bend: number } {
  const midiFloat = 69 + 12 * Math.log2(hz / 440);
  const note = Math.round(midiFloat);
  const centsDev = (midiFloat - note) * 100; // -50..+50
  // ±2 semitones (±200 cents) maps to the full bend range around centre.
  let bend = 8192 + Math.round((centsDev / 200) * 8192);
  bend = Math.max(0, Math.min(16383, bend));
  return { note, bend };
}

export type MidiOut = {
  name: string;
  sendNote: (hz: number, velocity: number, durationMs: number) => void;
  dispose: () => void;
};

export async function createMidiOut(): Promise<MidiOut | null> {
  const nav = navigator as unknown as { requestMIDIAccess?: (o?: object) => Promise<any> };
  if (!nav.requestMIDIAccess) return null;
  try {
    const access = await nav.requestMIDIAccess({ sysex: false });
    const outputs = Array.from(access.outputs.values()) as any[];
    if (outputs.length === 0) return null;
    const out = outputs[0];
    const CH = 0;
    return {
      name: out.name ?? "MIDI out",
      sendNote: (hz, velocity, durationMs) => {
        const { note, bend } = hzToMidi(hz);
        const vel = Math.max(1, Math.min(127, Math.round(velocity * 127)));
        out.send([0xe0 | CH, bend & 0x7f, (bend >> 7) & 0x7f]); // pitch bend
        out.send([0x90 | CH, note, vel]); // note on
        out.send([0x80 | CH, note, 0], performance.now() + Math.max(60, durationMs)); // scheduled note off
      },
      dispose: () => {
        // best-effort all-notes-off on the channel
        try {
          out.send([0xb0, 123, 0]);
        } catch {
          /* ignore */
        }
      },
    };
  } catch {
    return null;
  }
}
