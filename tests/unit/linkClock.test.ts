import { describe, it, expect } from "vitest";
import { LinkClock } from "../../src/linkClock";

describe("LinkClock", () => {
  it("is invalid until updated; nextGridTime is identity while invalid", () => {
    const c = new LinkClock();
    expect(c.valid).toBe(false);
    expect(c.nextGridTime(1.234, 0.5)).toBe(1.234);
  });

  it("beatAt and timeAtBeat are inverses", () => {
    const c = new LinkClock();
    c.update(120, 0, 0); // 120 BPM => 0.5 s/beat, beatRef 0 at time 0
    expect(c.beatAt(1.0)).toBeCloseTo(2.0, 9); // 1 s = 2 beats at 120 BPM
    expect(c.timeAtBeat(2.0)).toBeCloseTo(1.0, 9);
    expect(c.timeAtBeat(c.beatAt(0.37))).toBeCloseTo(0.37, 9);
  });

  it("snaps to the next half-beat at or after t (120 BPM => half-beat = 0.25 s)", () => {
    const c = new LinkClock();
    c.update(120, 0, 0);
    expect(c.nextGridTime(0, 0.5)).toBeCloseTo(0, 9);       // exactly on a line
    expect(c.nextGridTime(0.1, 0.5)).toBeCloseTo(0.25, 9);  // → next half-beat
    expect(c.nextGridTime(0.25, 0.5)).toBeCloseTo(0.25, 9); // on a line, stays
    expect(c.nextGridTime(0.26, 0.5)).toBeCloseTo(0.5, 9);
  });

  it("tempo change via update shifts the mapping", () => {
    const c = new LinkClock();
    c.update(60, 0, 0); // 1 s/beat, half-beat = 0.5 s
    expect(c.nextGridTime(0.1, 0.5)).toBeCloseTo(0.5, 9);
  });

  it("nextGridTime is monotonic non-decreasing for increasing t", () => {
    const c = new LinkClock();
    c.update(135, 3.2, 0.4); // arbitrary model
    let prev = -Infinity;
    for (let t = 0; t < 3; t += 0.013) {
      const g = c.nextGridTime(t, 0.5);
      expect(g).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = g;
    }
  });

  it("reset() makes it invalid again", () => {
    const c = new LinkClock();
    c.update(120, 0, 0);
    c.reset();
    expect(c.valid).toBe(false);
    expect(c.nextGridTime(0.1, 0.5)).toBe(0.1);
  });
});
