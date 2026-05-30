// src/linkImport.ts
import { extractPayloadFromUrl, decodePayload } from "./shareCodec";
import { getBuiltinDegrees } from "./builtinTunings";

export type PortableTuning = {
  tonicHz: number;
  scaleCents: number[]; // length 12, [0] === 0
  label: string;
};

const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// ../mdrone/src/scene/droneSceneModel.ts:42–46
function pitchToFreq(root: string, octave: number): number {
  const idx = PITCH_CLASSES.indexOf(root);
  const semitonesFromA4 = idx - 9 + (octave - 4) * 12;
  return 440 * Math.pow(2, semitonesFromA4 / 12);
}

export const DEFAULT_TUNING: PortableTuning = Object.freeze({
  tonicHz: pitchToFreq("C", 4),
  scaleCents: getBuiltinDegrees("equal").slice(0, 12),
  label: "C · Equal (12-TET)",
});

function isValidDegrees(d: unknown): d is number[] {
  return (
    Array.isArray(d) &&
    d.length >= 13 &&
    d.every((n) => typeof n === "number" && Number.isFinite(n)) &&
    d[0] === 0
  );
}

export function sceneToTuning(scene: unknown): PortableTuning {
  try {
    const s = scene as any;
    const root = s?.drone?.root;
    const octave = s?.drone?.octave;
    if (typeof root !== "string" || !PITCH_CLASSES.includes(root)) return DEFAULT_TUNING;
    if (typeof octave !== "number" || octave < 0 || octave > 9) return DEFAULT_TUNING;

    const tonicHz = pitchToFreq(root, octave);

    let degrees: number[];
    let tuningLabel: string;
    const custom = s?.customTuning;
    if (custom && typeof custom.id === "string" && custom.id.startsWith("custom:") && isValidDegrees(custom.degrees)) {
      degrees = custom.degrees;
      tuningLabel = typeof custom.label === "string" ? custom.label : "Custom";
    } else {
      degrees = getBuiltinDegrees(s?.drone?.tuningId);
      tuningLabel = s?.drone?.tuningId ?? "Equal (12-TET)";
    }

    return { tonicHz, scaleCents: degrees.slice(0, 12), label: `${root} · ${tuningLabel}` };
  } catch {
    return DEFAULT_TUNING;
  }
}

export async function importTuningFromUrl(url: string): Promise<PortableTuning> {
  try {
    const extracted = extractPayloadFromUrl(url);
    if (!extracted) return DEFAULT_TUNING;
    const scene = await decodePayload(extracted.payload, extracted.compressed);
    return sceneToTuning(scene);
  } catch {
    return DEFAULT_TUNING;
  }
}
