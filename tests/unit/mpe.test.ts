import { describe, it, expect } from "vitest";
import { MidiVoiceManager, MPE_CHANNELS } from "../../src/mpe";
import { hzToMidi } from "../../src/midi";

const A4 = 440;
const bendOf = (hz: number) => hzToMidi(hz).bend;

// Helpers to read message kinds off raw bytes.
const isNoteOn = (m: { bytes: number[] }) => (m.bytes[0] & 0xf0) === 0x90;
const isNoteOff = (m: { bytes: number[] }) => (m.bytes[0] & 0xf0) === 0x80;
const isBend = (m: { bytes: number[] }) => (m.bytes[0] & 0xf0) === 0xe0;
const chanOf = (m: { bytes: number[] }) => m.bytes[0] & 0x0f;

describe("single-channel mode", () => {
  it("all notes use channel 1 (index 0) and do not reset bend", () => {
    const mgr = new MidiVoiceManager("single");
    const { channel, messages } = mgr.noteOn(A4, 0.8, 500, 0);
    expect(channel).toBe(0);
    for (const m of messages) expect(chanOf(m)).toBe(0);
    // bend, note-on, scheduled note-off — but NO bend reset (would retune ringing notes)
    const resets = messages.filter((m) => isBend(m) && m.atMs !== undefined);
    expect(resets).toHaveLength(0);
  });

  it("emits pitch bend BEFORE note-on", () => {
    const mgr = new MidiVoiceManager("single");
    const { messages } = mgr.noteOn(A4, 0.8, 500, 0);
    const bendIdx = messages.findIndex(isBend);
    const onIdx = messages.findIndex(isNoteOn);
    expect(bendIdx).toBeGreaterThanOrEqual(0);
    expect(bendIdx).toBeLessThan(onIdx);
  });
});

describe("MPE bend bytes", () => {
  it("14-bit bend is split LSB then MSB, matching hzToMidi", () => {
    const mgr = new MidiVoiceManager("mpe");
    const hz = 440 * Math.pow(2, 0.4 / 12); // +40 cents
    const { messages } = mgr.noteOn(hz, 0.8, 500, 0);
    const bend = messages.find((m) => isBend(m) && m.atMs === undefined)!;
    const value = bend.bytes[1] | (bend.bytes[2] << 7);
    expect(value).toBe(bendOf(hz));
    expect(bend.bytes[1]).toBeLessThanOrEqual(0x7f);
    expect(bend.bytes[2]).toBeLessThanOrEqual(0x7f);
  });
});

describe("MPE channel allocation + rotation", () => {
  it("rotates across channels 2..8 for overlapping notes", () => {
    const mgr = new MidiVoiceManager("mpe");
    const used: number[] = [];
    for (let i = 0; i < MPE_CHANNELS.length; i++) {
      used.push(mgr.noteOn(A4, 0.8, 10_000, 0).channel);
    }
    // each overlapping note gets a distinct channel, all within 2..8
    expect(new Set(used).size).toBe(MPE_CHANNELS.length);
    for (const ch of used) expect(MPE_CHANNELS).toContain(ch);
  });

  it("reaps a voice after its note-off time passes (no channel leak)", () => {
    const mgr = new MidiVoiceManager("mpe");
    mgr.noteOn(A4, 0.8, 500, 0); // releases at 500ms
    expect(mgr.activeCount()).toBe(1);
    // next note well after release: the finished voice is reaped, not leaked
    const second = mgr.noteOn(A4, 0.8, 500, 1000);
    expect(mgr.activeCount()).toBe(1);
    expect(MPE_CHANNELS).toContain(second.channel);
  });
});

describe("MPE voice stealing", () => {
  it("steals the oldest voice when all channels are busy, silencing it first", () => {
    const mgr = new MidiVoiceManager("mpe");
    const owners = MPE_CHANNELS.map(() => mgr.noteOn(A4, 0.8, 10_000, 0));
    expect(mgr.activeCount()).toBe(MPE_CHANNELS.length);
    const oldestChannel = owners[0].channel;
    const stealer = mgr.noteOn(A4, 0.8, 10_000, 0);
    // reuses the oldest channel
    expect(stealer.channel).toBe(oldestChannel);
    // still only 7 voices (one stolen, one added)
    expect(mgr.activeCount()).toBe(MPE_CHANNELS.length);
    // steal emits an immediate note-off on the reused channel before the new note
    const immediateOff = stealer.messages.find((m) => isNoteOff(m) && m.atMs === undefined);
    expect(immediateOff).toBeDefined();
    expect(chanOf(immediateOff!)).toBe(oldestChannel);
  });
});

describe("ownership + explicit release", () => {
  it("noteOff by id releases the channel and resets bend in MPE", () => {
    const mgr = new MidiVoiceManager("mpe");
    const { id, channel } = mgr.noteOn(A4, 0.8, 10_000, 0);
    const msgs = mgr.noteOff(id);
    expect(mgr.activeCount()).toBe(0);
    expect(msgs.some((m) => isNoteOff(m) && chanOf(m) === channel)).toBe(true);
    expect(msgs.some((m) => isBend(m) && chanOf(m) === channel)).toBe(true);
  });

  it("noteOff on an unknown id is a harmless no-op", () => {
    const mgr = new MidiVoiceManager("mpe");
    expect(mgr.noteOff(999)).toEqual([]);
  });
});

describe("panic + cleanup", () => {
  it("panic sends all-notes-off + bend reset on every MPE channel and clears state", () => {
    const mgr = new MidiVoiceManager("mpe");
    mgr.noteOn(A4, 0.8, 10_000, 0);
    mgr.noteOn(A4, 0.8, 10_000, 0);
    const msgs = mgr.panic();
    expect(mgr.activeCount()).toBe(0);
    for (const ch of MPE_CHANNELS) {
      expect(msgs.some((m) => (m.bytes[0] & 0xf0) === 0xb0 && chanOf(m) === ch && m.bytes[1] === 123)).toBe(true);
      expect(msgs.some((m) => isBend(m) && chanOf(m) === ch)).toBe(true);
    }
  });

  it("setMode panics first, then switches channel set", () => {
    const mgr = new MidiVoiceManager("single");
    mgr.noteOn(A4, 0.8, 10_000, 0);
    const msgs = mgr.setMode("mpe");
    // panic on the OLD (single) channel set
    expect(msgs.some((m) => (m.bytes[0] & 0xf0) === 0xb0 && chanOf(m) === 0)).toBe(true);
    expect(mgr.getMode()).toBe("mpe");
    expect(mgr.activeCount()).toBe(0);
    // now allocates MPE channels
    expect(MPE_CHANNELS).toContain(mgr.noteOn(A4, 0.8, 10_000, 100).channel);
  });
});
