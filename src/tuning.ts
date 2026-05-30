// src/tuning.ts
// Pure pitch math over a scale lattice. A "step position" is an integer index
// into the lattice: stepPos = octave * scaleLen + degreeIndex.

export function degreeToHz(
  scaleCents: number[],
  tonicHz: number,
  degreeIndex: number,
  octave: number,
): number {
  if (degreeIndex < 0 || degreeIndex >= scaleCents.length) {
    throw new RangeError(`degreeToHz: degreeIndex ${degreeIndex} out of range [0, ${scaleCents.length})`);
  }
  const cents = scaleCents[degreeIndex] + 1200 * octave;
  return tonicHz * Math.pow(2, cents / 1200);
}

export function degreeToStepPos(degreeIndex: number, octave: number, scaleLen: number): number {
  return octave * scaleLen + degreeIndex;
}

export function stepPosToDegree(
  stepPos: number,
  scaleLen: number,
): { degreeIndex: number; octave: number } {
  const octave = Math.floor(stepPos / scaleLen);
  const degreeIndex = ((stepPos % scaleLen) + scaleLen) % scaleLen;
  return { degreeIndex, octave };
}

export function hzToNearestStepPos(hz: number, scaleCents: number[], tonicHz: number): number {
  if (hz <= 0) throw new RangeError("hzToNearestStepPos: hz must be positive");
  const cents = 1200 * Math.log2(hz / tonicHz);
  const scaleLen = scaleCents.length;
  let best = 0;
  let bestErr = Infinity;
  // Search a few octaves each side of the target.
  const centerOct = Math.round(cents / 1200);
  for (let o = centerOct - 2; o <= centerOct + 2; o++) {
    for (let d = 0; d < scaleLen; d++) {
      const c = scaleCents[d] + 1200 * o;
      const err = Math.abs(c - cents);
      if (err < bestErr) {
        bestErr = err;
        best = degreeToStepPos(d, o, scaleLen);
      }
    }
  }
  return best;
}

// Resting notes are consonances against the drone, detected by cents proximity
// (spec §4.3): tonic (0c) strongest, fifth (702c), then fourth (498c) and a
// strong third (386/400c). Returns a per-degree strength 0..1.
const RESTING_TARGETS: { cents: number; strength: number }[] = [
  { cents: 0, strength: 1.0 },
  { cents: 702, strength: 0.8 },
  { cents: 498, strength: 0.5 },
  { cents: 386, strength: 0.45 },
];
const RESTING_TOLERANCE = 35; // cents

export function restingNotes(scaleCents: number[]): number[] {
  return scaleCents.map((c) => {
    let best = 0;
    for (const t of RESTING_TARGETS) {
      if (Math.abs(c - t.cents) <= RESTING_TOLERANCE) best = Math.max(best, t.strength);
    }
    return best;
  });
}
