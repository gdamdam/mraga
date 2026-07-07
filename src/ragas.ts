// src/ragas.ts
// Raga models over the 12-degree lattice (degree indices 0..11, Sa = 0).
// Each raga is: aroha/avaroha (the degree sets allowed while ascending /
// descending), vadi/samvadi (the emphasized degrees — boosted as resting
// targets so lines resolve onto them), and a pakad (the signature phrase,
// expressed as lattice steps relative to Sa; negative = below the tonic).
//
// These are practical approximations of the classical grammars — enough to
// make each raga recognizably itself — not scholarly transcriptions. Cents
// come from the active tuning, so a raga stays microtonal under a JI tuning.
// Ragas only apply when the scale has 12 degrees (all current tunings do).

export type Raga = {
  id: string;
  label: string;
  aroha: number[];   // degree indices allowed ascending
  avaroha: number[]; // degree indices allowed descending
  vadi: number;      // most emphasized degree
  samvadi: number;   // second-most emphasized degree
  pakad: number[];   // signature phrase, lattice steps relative to Sa
  mood: string;      // one-line character, for the UI tooltip
};

export const RAGAS: Record<string, Raga> = {
  yaman: {
    id: "yaman",
    label: "Yaman",
    aroha: [0, 2, 4, 6, 9, 11],
    avaroha: [0, 2, 4, 6, 7, 9, 11],
    vadi: 4,
    samvadi: 11,
    pakad: [-1, 2, 4, 2, 0], // N. R G R S
    mood: "serene evening, tivra Ma",
  },
  bhairav: {
    id: "bhairav",
    label: "Bhairav",
    aroha: [0, 1, 4, 5, 7, 8, 11],
    avaroha: [0, 1, 4, 5, 7, 8, 11],
    vadi: 8,
    samvadi: 1,
    pakad: [4, 5, 8, 7], // G m d P
    mood: "solemn dawn, komal re & dha",
  },
  bhairavi: {
    id: "bhairavi",
    label: "Bhairavi",
    aroha: [0, 1, 3, 5, 7, 8, 10],
    avaroha: [0, 1, 3, 5, 7, 8, 10],
    vadi: 5,
    samvadi: 0,
    pakad: [-2, 0, 3, 5, 7], // n. S g m P
    mood: "tender, all komal",
  },
  desh: {
    id: "desh",
    label: "Desh",
    aroha: [0, 2, 5, 7, 11],
    avaroha: [0, 2, 4, 5, 7, 9, 10],
    vadi: 2,
    samvadi: 7,
    pakad: [2, 5, 7, 11, 12], // R m P N S'
    mood: "monsoon romance, dual Ni",
  },
  malkauns: {
    id: "malkauns",
    label: "Malkauns",
    aroha: [0, 3, 5, 8, 10],
    avaroha: [0, 3, 5, 8, 10],
    vadi: 5,
    samvadi: 0,
    pakad: [5, 3, 5, 8, 10, 8, 5], // m g m d n d m
    mood: "deep midnight pentatonic",
  },
  durga: {
    id: "durga",
    label: "Durga",
    aroha: [0, 2, 5, 7, 9],
    avaroha: [0, 2, 5, 7, 9],
    vadi: 5,
    samvadi: 2,
    pakad: [2, 5, 7, 9, 12], // R m P D S'
    mood: "bright pentatonic strength",
  },
};

export const RAGA_IDS = Object.keys(RAGAS);

export function getRaga(id: string | null | undefined): Raga | null {
  return id ? (RAGAS[id] ?? null) : null;
}

function toMask(degrees: number[], scaleLen: number): boolean[] {
  const m = new Array<boolean>(scaleLen).fill(false);
  for (const d of degrees) if (d >= 0 && d < scaleLen) m[d] = true;
  m[0] = true; // Sa is always available
  return m;
}

// FOCUS within a raga: trim each direction's set toward its core, ranked
// tonic > vadi > samvadi > fifth > the rest in scale order. focus=0 keeps the
// full raga; focus=1 keeps ~5 degrees (or fewer if the raga is smaller).
function trimByFocus(degrees: number[], raga: Raga, focus: number): number[] {
  const rank = (d: number) =>
    d === 0 ? 0 : d === raga.vadi ? 1 : d === raga.samvadi ? 2 : d === 7 ? 3 : 4 + d;
  const ordered = [...degrees].sort((a, b) => rank(a) - rank(b));
  const full = ordered.length;
  const core = Math.min(5, full);
  const keep = Math.round(full + (core - full) * Math.max(0, Math.min(1, focus)));
  return ordered.slice(0, Math.max(1, keep));
}

export function ragaMasks(
  raga: Raga,
  scaleLen: number,
  focus: number,
): { aroha: boolean[]; avaroha: boolean[] } {
  return {
    aroha: toMask(trimByFocus(raga.aroha, raga, focus), scaleLen),
    avaroha: toMask(trimByFocus(raga.avaroha, raga, focus), scaleLen),
  };
}

// Per-degree resting boost: lines dwell on and resolve to vadi/samvadi.
export function ragaBoost(raga: Raga, scaleLen: number): number[] {
  const b = new Array<number>(scaleLen).fill(0);
  if (raga.vadi >= 0 && raga.vadi < scaleLen) b[raga.vadi] = 0.9;
  if (raga.samvadi >= 0 && raga.samvadi < scaleLen) b[raga.samvadi] = 0.7;
  return b;
}
