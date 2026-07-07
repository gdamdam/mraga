import { describe, it, expect } from "vitest";
import { concatChunks, encodeWav } from "../../src/recorder";

describe("concatChunks", () => {
  it("concatenates in order", () => {
    const out = concatChunks([new Float32Array([1, 2]), new Float32Array([3])]);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it("handles empty input", () => {
    expect(concatChunks([]).length).toBe(0);
  });
});

describe("encodeWav", () => {
  it("writes a valid 16-bit stereo PCM header", () => {
    const l = new Float32Array([0, 0.5]);
    const r = new Float32Array([0, -0.5]);
    const buf = encodeWav(l, r, 48000);
    const v = new DataView(buf);
    const str = (off: number, n: number) =>
      String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(off + i)));
    expect(str(0, 4)).toBe("RIFF");
    expect(str(8, 4)).toBe("WAVE");
    expect(str(12, 4)).toBe("fmt ");
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(2); // stereo
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(str(36, 4)).toBe("data");
    expect(v.getUint32(40, true)).toBe(2 * 2 * 2); // frames × ch × int16
    expect(buf.byteLength).toBe(44 + 8);
  });

  it("scales and interleaves samples", () => {
    const buf = encodeWav(new Float32Array([0.5]), new Float32Array([-0.5]), 44100);
    const v = new DataView(buf);
    expect(v.getInt16(44, true)).toBe(Math.round(0.5 * 32767));
    expect(v.getInt16(46, true)).toBe(Math.round(-0.5 * 32767));
  });

  it("clips floats beyond ±1 instead of wrapping", () => {
    const buf = encodeWav(new Float32Array([2]), new Float32Array([-2]), 44100);
    const v = new DataView(buf);
    expect(v.getInt16(44, true)).toBe(32767);
    expect(v.getInt16(46, true)).toBe(-32767);
  });

  it("truncates to the shorter channel", () => {
    const buf = encodeWav(new Float32Array([0, 0, 0]), new Float32Array([0]), 44100);
    expect(new DataView(buf).getUint32(40, true)).toBe(1 * 4);
  });
});
