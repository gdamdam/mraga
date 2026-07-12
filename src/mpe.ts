// src/mpe.ts
// Pure MIDI voice allocation for correct microtonal output. mraga bends each
// note to its exact cents, but pitch-bend is a per-CHANNEL message: on one
// channel a new note's bend retunes every still-ringing note. MPE fixes this by
// rotating notes across channels 2..8 (7 voices), so each note owns its bend.
//
// This module is PURE and deterministic: it turns note-on / note-off / panic
// requests into ordered MIDI byte messages (with optional scheduled timestamps)
// and tracks channel ownership + voice stealing. The Web MIDI wrapper
// (src/midi.ts) just sends what this produces. No I/O, no Date, no allocation in
// a render loop — fully unit-testable.

import { hzToMidi } from "./midi";

export type MidiMode = "single" | "mpe";

// A MIDI message: raw status+data bytes, optionally scheduled at atMs (matching
// WebMIDI's output.send(data, timestamp)); undefined atMs => send immediately.
export type MidiMessage = { bytes: number[]; atMs?: number };

// MPE note channels are MIDI channels 2..8 => zero-based channel numbers 1..7.
export const MPE_CHANNELS = [1, 2, 3, 4, 5, 6, 7];
const SINGLE_CHANNEL = 0; // MIDI channel 1
const BEND_CENTER = 8192;

// Status-byte builders (channel is zero-based 0..15).
const noteOnMsg = (ch: number, note: number, vel: number): number[] => [0x90 | ch, note, vel];
const noteOffMsg = (ch: number, note: number): number[] => [0x80 | ch, note, 0];
const bendMsg = (ch: number, bend: number): number[] => [0xe0 | ch, bend & 0x7f, (bend >> 7) & 0x7f];
const allNotesOffMsg = (ch: number): number[] => [0xb0 | ch, 123, 0];

type Voice = {
  id: number;
  channel: number;
  note: number;
  releaseAtMs: number; // when this voice's scheduled note-off fires
  order: number; // monotonic allocation order (for oldest-first stealing)
};

export class MidiVoiceManager {
  private mode: MidiMode;
  private voices: Voice[] = [];
  private nextId = 1;
  private orderCounter = 0;
  private rrIndex = 0; // round-robin cursor into MPE_CHANNELS

  constructor(mode: MidiMode = "single") {
    this.mode = mode;
  }

  getMode(): MidiMode {
    return this.mode;
  }

  // Changing modes silences everything first (channels differ between modes).
  setMode(mode: MidiMode): MidiMessage[] {
    const off = this.panic();
    this.mode = mode;
    this.rrIndex = 0;
    return off;
  }

  private channels(): number[] {
    return this.mode === "mpe" ? MPE_CHANNELS : [SINGLE_CHANNEL];
  }

  // Free any voice whose scheduled note-off has already fired by nowMs. Its
  // note-off was emitted at note-on time, so reaping is state-only.
  private reap(nowMs: number): void {
    this.voices = this.voices.filter((v) => v.releaseAtMs > nowMs);
  }

  // Pick a channel for a new note. Prefers a free channel (round-robin);
  // otherwise steals the oldest voice, returning the note-off/bend-reset to
  // silence it first.
  private allocate(): { channel: number; steal: MidiMessage[] } {
    const chans = this.channels();
    if (this.mode === "single") return { channel: SINGLE_CHANNEL, steal: [] };

    const busy = new Set(this.voices.map((v) => v.channel));
    // Round-robin over channels starting at the cursor, so notes spread out.
    for (let i = 0; i < chans.length; i++) {
      const idx = (this.rrIndex + i) % chans.length;
      const ch = chans[idx];
      if (!busy.has(ch)) {
        this.rrIndex = (idx + 1) % chans.length;
        return { channel: ch, steal: [] };
      }
    }
    // All busy: steal the oldest voice.
    let oldest = this.voices[0];
    for (const v of this.voices) if (v.order < oldest.order) oldest = v;
    const steal: MidiMessage[] = [
      { bytes: noteOffMsg(oldest.channel, oldest.note) },
      { bytes: bendMsg(oldest.channel, BEND_CENTER) },
    ];
    this.voices = this.voices.filter((v) => v.id !== oldest.id);
    return { channel: oldest.channel, steal };
  }

  // Emit the messages for one note. Returns { id, messages }. The caller sends
  // messages verbatim; `id` can be passed to noteOff() for an explicit release
  // (otherwise the scheduled note-off frees the channel on its own).
  noteOn(
    hz: number,
    velocity: number,
    durationMs: number,
    nowMs: number,
  ): { id: number; channel: number; messages: MidiMessage[] } {
    this.reap(nowMs);
    const { note, bend } = hzToMidi(hz);
    const vel = Math.max(1, Math.min(127, Math.round(velocity * 127)));
    const dur = Math.max(60, durationMs);
    const { channel, steal } = this.allocate();

    const releaseAtMs = nowMs + dur;
    const messages: MidiMessage[] = [...steal];
    // Bend BEFORE note-on so the note starts in tune (esp. important for MPE).
    messages.push({ bytes: bendMsg(channel, bend) });
    messages.push({ bytes: noteOnMsg(channel, note, vel) });
    // Scheduled note-off frees the channel. We deliberately do NOT schedule a
    // future bend-reset: WebMIDI's timestamp queue is fire-and-forget, so a
    // queued reset can't be cancelled when the channel is stolen — it would
    // fire mid-note and detune the stealing note. A stale bend on an idle
    // channel is harmless because every note-on bends its channel first.
    messages.push({ bytes: noteOffMsg(channel, note), atMs: releaseAtMs });

    const id = this.nextId++;
    this.voices.push({ id, channel, note, releaseAtMs, order: this.orderCounter++ });
    return { id, channel, messages };
  }

  // Explicitly release a voice (immediate note-off + bend reset in MPE).
  noteOff(id: number): MidiMessage[] {
    const v = this.voices.find((x) => x.id === id);
    if (!v) return [];
    this.voices = this.voices.filter((x) => x.id !== id);
    const msgs: MidiMessage[] = [{ bytes: noteOffMsg(v.channel, v.note) }];
    if (this.mode === "mpe") msgs.push({ bytes: bendMsg(v.channel, BEND_CENTER) });
    return msgs;
  }

  // Silence everything: all-notes-off + bend reset on every channel in the
  // active mode, and clear all voice state. Used for panic / stop / disconnect.
  panic(): MidiMessage[] {
    const msgs: MidiMessage[] = [];
    for (const ch of this.channels()) {
      msgs.push({ bytes: allNotesOffMsg(ch) });
      msgs.push({ bytes: bendMsg(ch, BEND_CENTER) });
    }
    this.voices = [];
    this.rrIndex = 0;
    return msgs;
  }

  // Number of currently-owned voices (for tests / diagnostics).
  activeCount(): number {
    return this.voices.length;
  }
}
