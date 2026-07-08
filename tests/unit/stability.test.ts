import { describe, it, expect } from "vitest";
import { decodeScene } from "../../src/mragaScene";
import { encodeScene as codecEncode, decodePayload } from "../../src/shareCodec";
import { arcKnobs, arcPhaseAt } from "../../src/arc";
import { initState, nextEvent, type EngineParams } from "../../src/engine";
import { knobsToParams } from "../../src/conducting";
import { ragaMasks, ragaBoost, ragaOrnaments, RAGAS } from "../../src/ragas";
import { taalBias, taalPositionAt, TAALS } from "../../src/taal";
import { makeRng } from "../../src/rng";

describe("bounded share/import data (M8: bound before expensive parse/alloc)", () => {
  it("decodeScene rejects an absurdly oversized payload cheaply", () => {
    expect(decodeScene("A".repeat(100_000))).toBeNull();
  });

  it("decodePayload rejects an oversized raw payload string", async () => {
    await expect(decodePayload("a".repeat(40_000), false)).rejects.toThrow(/too large/);
  });

  it("decodePayload aborts a decompression bomb instead of allocating it", async () => {
    // A tiny compressed payload that inflates past the cap must throw, not OOM.
    const bomb = "x".repeat(400_000);
    const enc = await codecEncode(bomb, { compress: true });
    expect(enc.key).toBe("z");
    await expect(decodePayload(enc.value, true)).rejects.toThrow(/too large/);
  });

  it("a valid compressed payload still round-trips (bounded inflate regression)", async () => {
    const obj = { hello: "world", n: 42, arr: [1, 2, 3] };
    const enc = await codecEncode(obj, { compress: true });
    expect(await decodePayload(enc.value, enc.key === "z")).toEqual(obj);
  });
});

describe("performance arc completion", () => {
  it("reaches the dense/tight jhala climax at t=1", () => {
    expect(arcPhaseAt(0)).toBe("alap");
    expect(arcPhaseAt(1)).toBe("jhala");
    const end = arcKnobs(1);
    expect(end.density).toBeGreaterThan(0.9);
    expect(end.rhythm).toBeGreaterThan(0.9);
    expect(end.silence).toBeLessThan(0.1);
  });

  it("t beyond 1 is clamped to the climax (no overshoot)", () => {
    expect(arcKnobs(1.5)).toEqual(arcKnobs(1));
  });
});

describe("engine integration smoke — every feature at once never throws", () => {
  it("raga masks + boost + pakad + gamaka + taal + pull, long run, finite pitches", () => {
    const scale = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100];
    const tonicHz = 261.6256;
    const raga = RAGAS.bhairav;
    const masks = ragaMasks(raga, 12, 0.3);
    const params: EngineParams = {
      ...knobsToParams({ density: 0.7, register: 0.5, restlessness: 0.4, silence: 0.15, theme: 0.4, focus: 0.3 }, tonicHz),
      arohaMask: masks.aroha,
      avarohaMask: masks.avaroha,
      degreeBoost: ragaBoost(raga, 12),
      pakadSteps: raga.pakad,
      pakadProb: 0.35,
      gamaka: ragaOrnaments(raga),
      gamakaEnabled: true,
      taalBias: taalBias(taalPositionAt(TAALS.teental, 0)),
      pullDegree: 8,
    };
    const rng = makeRng(99);
    let state = initState();
    for (let i = 0; i < 1500; i++) {
      const r = nextEvent(state, scale, tonicHz, params, rng);
      state = r.state;
      if (r.event.kind === "note") {
        expect(Number.isFinite(r.event.pitchHz)).toBe(true);
        expect(r.event.pitchHz).toBeGreaterThan(0);
        expect(r.event.velocity).toBeGreaterThanOrEqual(0);
        expect(r.event.velocity).toBeLessThanOrEqual(1);
        expect(r.event.ioiSec).toBeGreaterThan(0);
      }
    }
  });

  it("degenerate 1-degree scale does not crash the engine", () => {
    const rng = makeRng(1);
    let state = initState();
    const params = knobsToParams({ density: 0.5, register: 0.5, restlessness: 0.5, silence: 0.2 }, 220);
    for (let i = 0; i < 100; i++) {
      const r = nextEvent(state, [0], 220, params, rng);
      state = r.state;
      if (r.event.kind === "note") expect(Number.isFinite(r.event.pitchHz)).toBe(true);
    }
  });
});
