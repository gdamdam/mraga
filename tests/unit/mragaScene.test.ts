import { describe, it, expect } from "vitest";
import {
  encodeScene,
  decodeScene,
  sceneToUrl,
  sceneFromUrl,
  type MragaScene,
} from "../../src/mragaScene";
import { bytesToUrlSafeB64 } from "../../src/shareCodec";

const SAMPLE_SCENE: MragaScene = {
  v: 1,
  knobs: { density: 0.5, register: 0.3, restlessness: 0.7, silence: 0.1, rhythm: 0.6, theme: 0.5, focus: 0.4 },
  voice: "sitar",
  octave: 0,
  volume: 0.8,
  timing: "bpm",
  bpm: 120,
  theme: "dusk",
  seed: 4242,
  tuning: {
    tonicHz: 261.63,
    scaleCents: [0, 204, 386, 498, 702, 884, 1088],
    label: "Just Major",
  },
  raga: "yaman",
  drone: true,
  droneLevel: 0.6,
  taal: "teental",
  gamaka: true,
  rhythmCells: true,
  tihai: true,
  vakra: true,
  theka: true,
};

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe("backward compatibility", () => {
  it("a pre-1.0 scene (no taal/gamaka) decodes with safe defaults", () => {
    const { taal: _t, gamaka: _g, ...pre10 } = SAMPLE_SCENE;
    const decoded = decodeScene(bytesToUrlSafeB64(new TextEncoder().encode(JSON.stringify(pre10))));
    expect(decoded).not.toBeNull();
    expect(decoded!.taal).toBe("off");
    expect(decoded!.gamaka).toBe(false);
  });

  it("a pre-0.4 scene (no phrase-engine flags / theka) decodes them to false", () => {
    const { rhythmCells: _r, tihai: _ti, vakra: _v, theka: _th, ...pre04 } = SAMPLE_SCENE;
    const decoded = decodeScene(bytesToUrlSafeB64(new TextEncoder().encode(JSON.stringify(pre04))));
    expect(decoded).not.toBeNull();
    expect(decoded!.rhythmCells).toBe(false);
    expect(decoded!.tihai).toBe(false);
    expect(decoded!.vakra).toBe(false);
    expect(decoded!.theka).toBe(false);
  });
});

describe("round-trip", () => {
  it("encodeScene + decodeScene produces a deeply equal scene", () => {
    const encoded = encodeScene(SAMPLE_SCENE);
    const decoded = decodeScene(encoded);
    expect(decoded).toEqual(SAMPLE_SCENE);
  });

  it("sceneToUrl + sceneFromUrl (no baseUrl) round-trips", () => {
    const url = sceneToUrl(SAMPLE_SCENE);
    expect(url.startsWith("?s=")).toBe(true);
    // sceneFromUrl needs an absolute URL — wrap with a dummy origin.
    const absolute = `https://mraga.app/${url}`;
    const decoded = sceneFromUrl(absolute);
    expect(decoded).toEqual(SAMPLE_SCENE);
  });

  it("sceneToUrl + sceneFromUrl (with baseUrl, no existing query) round-trips", () => {
    const url = sceneToUrl(SAMPLE_SCENE, "https://mraga.app/");
    expect(url).toContain("?s=");
    const decoded = sceneFromUrl(url);
    expect(decoded).toEqual(SAMPLE_SCENE);
  });

  it("sceneToUrl appends &s= when baseUrl already has a query", () => {
    const url = sceneToUrl(SAMPLE_SCENE, "https://mraga.app/?foo=bar");
    expect(url).toContain("&s=");
    const decoded = sceneFromUrl(url);
    expect(decoded).toEqual(SAMPLE_SCENE);
  });
});

// ---------------------------------------------------------------------------
// Tolerant / null cases
// ---------------------------------------------------------------------------

describe("tolerant decoding", () => {
  it("decodeScene('garbage!!') → null", () => {
    expect(decodeScene("garbage!!")).toBeNull();
  });

  it("decodeScene of a scene with v:2 → null", () => {
    const bad = { ...SAMPLE_SCENE, v: 2 } as unknown as MragaScene;
    const encoded = bytesToUrlSafeB64(new TextEncoder().encode(JSON.stringify(bad)));
    expect(decodeScene(encoded)).toBeNull();
  });

  it("sceneFromUrl('not a url') → null", () => {
    expect(sceneFromUrl("not a url")).toBeNull();
  });

  it("sceneFromUrl with no s param → null", () => {
    expect(sceneFromUrl("https://mraga.app/?foo=1")).toBeNull();
  });

  it("decodeScene of empty string → null", () => {
    expect(decodeScene("")).toBeNull();
  });

  it("decodeScene of valid base64 non-JSON → null", () => {
    const encoded = bytesToUrlSafeB64(new TextEncoder().encode("not json {{{"));
    expect(decodeScene(encoded)).toBeNull();
  });

  it("decodeScene of a scene missing required fields → null", () => {
    const { tuning: _omit, ...noTuning } = SAMPLE_SCENE;
    const encoded = bytesToUrlSafeB64(new TextEncoder().encode(JSON.stringify(noTuning)));
    expect(decodeScene(encoded)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sanitization / clamping
// ---------------------------------------------------------------------------

function encodeRaw(obj: unknown): string {
  return bytesToUrlSafeB64(new TextEncoder().encode(JSON.stringify(obj)));
}

describe("sanitization", () => {
  it("clamps octave 9 → 2", () => {
    const raw = { ...SAMPLE_SCENE, octave: 9 };
    const decoded = decodeScene(encodeRaw(raw));
    expect(decoded?.octave).toBe(2);
  });

  it("clamps octave -9 → -2", () => {
    const raw = { ...SAMPLE_SCENE, octave: -9 };
    const decoded = decodeScene(encodeRaw(raw));
    expect(decoded?.octave).toBe(-2);
  });

  it("clamps volume 5 → 1", () => {
    const raw = { ...SAMPLE_SCENE, volume: 5 };
    const decoded = decodeScene(encodeRaw(raw));
    expect(decoded?.volume).toBe(1);
  });

  it("clamps volume -1 → 0", () => {
    const raw = { ...SAMPLE_SCENE, volume: -1 };
    const decoded = decodeScene(encodeRaw(raw));
    expect(decoded?.volume).toBe(0);
  });

  it("clamps bpm 9999 → 240", () => {
    const raw = { ...SAMPLE_SCENE, bpm: 9999 };
    const decoded = decodeScene(encodeRaw(raw));
    expect(decoded?.bpm).toBe(240);
  });

  it("clamps bpm 1 → 40", () => {
    const raw = { ...SAMPLE_SCENE, bpm: 1 };
    const decoded = decodeScene(encodeRaw(raw));
    expect(decoded?.bpm).toBe(40);
  });

  it("clamps knob density 2.5 → 1", () => {
    const raw = { ...SAMPLE_SCENE, knobs: { ...SAMPLE_SCENE.knobs, density: 2.5 } };
    const decoded = decodeScene(encodeRaw(raw));
    expect(decoded?.knobs.density).toBe(1);
  });

  it("rounds octave float 1.7 → 2", () => {
    const raw = { ...SAMPLE_SCENE, octave: 1.7 };
    const decoded = decodeScene(encodeRaw(raw));
    expect(decoded?.octave).toBe(2);
  });

  it("rejects invalid timing value → null", () => {
    const raw = { ...SAMPLE_SCENE, timing: "turbo" };
    expect(decodeScene(encodeRaw(raw))).toBeNull();
  });

  it("rejects tonicHz <= 0 → null", () => {
    const raw = { ...SAMPLE_SCENE, tuning: { ...SAMPLE_SCENE.tuning, tonicHz: -1 } };
    expect(decodeScene(encodeRaw(raw))).toBeNull();
  });

  it("rejects non-finite scaleCents entry → null", () => {
    const raw = {
      ...SAMPLE_SCENE,
      tuning: { ...SAMPLE_SCENE.tuning, scaleCents: [0, Infinity, 386] },
    };
    expect(decodeScene(encodeRaw(raw))).toBeNull();
  });

  it("rejects empty scaleCents → null (would divide by scale length)", () => {
    const raw = { ...SAMPLE_SCENE, tuning: { ...SAMPLE_SCENE.tuning, scaleCents: [] } };
    expect(decodeScene(encodeRaw(raw))).toBeNull();
  });

  it("rejects absurdly long scaleCents (>24) → null", () => {
    const raw = {
      ...SAMPLE_SCENE,
      tuning: { ...SAMPLE_SCENE.tuning, scaleCents: Array.from({ length: 25 }, (_, i) => i * 40) },
    };
    expect(decodeScene(encodeRaw(raw))).toBeNull();
  });

  it("rejects tonicHz above the audible range → null", () => {
    const raw = { ...SAMPLE_SCENE, tuning: { ...SAMPLE_SCENE.tuning, tonicHz: 1e9 } };
    expect(decodeScene(encodeRaw(raw))).toBeNull();
  });

  it("rejects a non-ascending scaleCents payload → null (crafted ?s= link)", () => {
    const raw = {
      ...SAMPLE_SCENE,
      tuning: { ...SAMPLE_SCENE.tuning, scaleCents: [0, 386, 204, 498, 702] },
    };
    expect(decodeScene(encodeRaw(raw))).toBeNull();
  });

  it("rejects scaleCents not rooted at 0 → null", () => {
    const raw = {
      ...SAMPLE_SCENE,
      tuning: { ...SAMPLE_SCENE.tuning, scaleCents: [50, 204, 386, 498, 702] },
    };
    expect(decodeScene(encodeRaw(raw))).toBeNull();
  });

  it("preserves a non-octave period through the scene round-trip (§2-A)", () => {
    const raw = {
      ...SAMPLE_SCENE,
      tuning: { ...SAMPLE_SCENE.tuning, scaleCents: [0, 133.24, 301.85, 435.08], period: 1901.955 },
    };
    const decoded = decodeScene(encodeRaw(raw));
    expect(decoded).not.toBeNull();
    expect(decoded!.tuning.period).toBeCloseTo(1901.955, 3);
  });

  it("older payloads without raga/drone decode with defaults", () => {
    const { raga: _r, drone: _d, droneLevel: _l, ...old } = SAMPLE_SCENE;
    const decoded = decodeScene(encodeRaw(old));
    expect(decoded).not.toBeNull();
    expect(decoded?.raga).toBe("");
    expect(decoded?.drone).toBe(false);
    expect(decoded?.droneLevel).toBe(0.5);
  });

  it("clamps droneLevel and coerces non-boolean drone to false", () => {
    const raw = { ...SAMPLE_SCENE, drone: "yes", droneLevel: 3 };
    const decoded = decodeScene(encodeRaw(raw));
    expect(decoded?.drone).toBe(false);
    expect(decoded?.droneLevel).toBe(1);
  });
});
