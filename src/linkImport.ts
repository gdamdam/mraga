// src/linkImport.ts
import { extractPayloadFromUrl, decodePayload } from "./shareCodec";
import { getBuiltinDegrees } from "./builtinTunings";

export type PortableTuning = {
  tonicHz: number;
  scaleCents: number[]; // arbitrary length N, [0] === 0 (was hard-coded to 12)
  label: string;
  // Repeat period in cents (§2-A). Preserved from the mdrone link so
  // non-octave scales resolve at their real period instead of silently being
  // re-stacked at 1200. mraga still MAPS on its octave lattice (the engine is
  // period-agnostic), so a non-octave tuning is labelled accordingly.
  period?: number;
};

const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const OCTAVE_CENTS = 1200;

// A degrees array is the legacy [scaleCents…, period] form. The trailing entry
// is the repeat period. For an OCTAVE scale (period ≈ 1200) that entry is
// redundant — the octave lattice already reproduces it one register up — so we
// drop it. For a NON-OCTAVE scale the trailing period is a distinct pitch the
// octave lattice never reaches, so we keep it as a sounding degree rather than
// silently discarding a real note (§2-A). Either way the full scale survives
// for tunings of ANY length N (previously truncated to 12 via `slice(0, 12)`).
function soundingDegrees(degrees: number[]): number[] {
  if (degrees.length === 0) return [];
  const period = degrees[degrees.length - 1];
  if (Math.abs(period - OCTAVE_CENTS) <= 1e-6) {
    return degrees.slice(0, degrees.length - 1);
  }
  return degrees.slice();
}

// The repeat period declared by a legacy [scaleCents…, period] degrees array:
// its trailing entry, or the octave when the array is degenerate.
function periodOf(degrees: number[]): number {
  return degrees.length > 0 ? degrees[degrees.length - 1] : OCTAVE_CENTS;
}

// ../mdrone/src/scene/droneSceneModel.ts:42–46
function pitchToFreq(root: string, octave: number): number {
  const idx = PITCH_CLASSES.indexOf(root);
  const semitonesFromA4 = idx - 9 + (octave - 4) * 12;
  return 440 * Math.pow(2, semitonesFromA4 / 12);
}

export const DEFAULT_TUNING: PortableTuning = Object.freeze({
  tonicHz: pitchToFreq("C", 4),
  scaleCents: soundingDegrees(getBuiltinDegrees("equal")),
  label: "C · Equal (12-TET)",
  period: OCTAVE_CENTS,
});

// Accept a [scaleCents…, period] array of ANY length N (≥ 2: at least one
// sounding degree plus the period). Previously this required length ≥ 13,
// locking custom tunings to 12 notes.
function isValidDegrees(d: unknown): d is number[] {
  return (
    Array.isArray(d) &&
    d.length >= 2 &&
    d.every((n) => typeof n === "number" && Number.isFinite(n)) &&
    d[0] === 0
  );
}

export function sceneToTuning(scene: unknown): PortableTuning {
  try {
    // Untrusted decoded payload — loose optional-chained access is deliberate;
    // every field is validated below before use.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    const period = periodOf(degrees);
    // §2-A: surface that a non-octave tuning is being played on mraga's
    // octave lattice, rather than silently coercing it to 1200.
    const nonOctave = Math.abs(period - OCTAVE_CENTS) > 1e-6;
    const label = nonOctave
      ? `${root} · ${tuningLabel} (non-octave: octave mapping)`
      : `${root} · ${tuningLabel}`;

    return { tonicHz, scaleCents: soundingDegrees(degrees), label, period };
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
