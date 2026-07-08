// src/ragas.ts
// Raga models over the 12-degree lattice (degree indices 0..11, Sa = 0).
// Each raga is: aroha/avaroha (the degree sets allowed while ascending /
// descending), vadi/samvadi (the emphasized degrees — boosted as resting
// targets so lines resolve onto them, i.e. the raga's authored resting
// strengths), a pakad (the signature phrase, expressed as lattice steps
// relative to Sa; negative = below the tonic), optional weak/avoid degrees
// (durbal — kept usable but de-emphasised and trimmed first), optional authored
// gamaka (ornament) rules, and a concise contextual time/mood note.
//
// These are practical approximations of the classical grammars — enough to
// make each raga recognizably itself — not scholarly transcriptions. Cents come
// from the active tuning, so a raga stays microtonal under a JI tuning. Ragas
// only apply when the scale has 12 degrees (all current tunings do).

import type { GamakaRules } from "./gamaka";

export type Raga = {
  id: string;
  label: string;
  aroha: number[]; // degree indices allowed ascending
  avaroha: number[]; // degree indices allowed descending
  vadi: number; // most emphasized degree (strongest authored resting note)
  samvadi: number; // second-most emphasized degree
  pakad: number[]; // signature phrase, lattice steps relative to Sa
  mood: string; // one-line character, for the UI tooltip
  time?: string; // rough time/season association (not a rigid claim)
  weak?: number[]; // durbal/avoid degrees — used sparingly, trimmed first
  ornaments?: GamakaRules; // authored gamaka grammar (see gamaka.ts)
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
    time: "early evening",
    ornaments: {
      meend: { degrees: [4, 11], prob: 0.3 },
      kan: { degrees: [4, 9], prob: 0.25 },
    },
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
    time: "dawn",
    // The oscillating komal Re and komal Dha are Bhairav's signature.
    ornaments: {
      andolan: { degrees: [1, 8], cents: 22, prob: 0.4 },
      kan: { degrees: [4], prob: 0.2 },
    },
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
    time: "late morning / any time (the closing raga)",
    ornaments: {
      meend: { degrees: [3, 5, 10], prob: 0.3 },
      andolan: { degrees: [1, 8], cents: 18, prob: 0.25 },
    },
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
    time: "monsoon night",
    ornaments: {
      meend: { degrees: [2, 11], prob: 0.3 },
      kan: { degrees: [2, 7], prob: 0.2 },
    },
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
    time: "late night",
    ornaments: {
      meend: { degrees: [3, 8, 10], prob: 0.32 },
      andolan: { degrees: [3], cents: 16, prob: 0.2 },
    },
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
    time: "night",
    ornaments: {
      meend: { degrees: [5, 9], prob: 0.25 },
    },
  },
  // --- expansion (careful, credible additions) ---
  bhupali: {
    id: "bhupali",
    label: "Bhupali",
    aroha: [0, 2, 4, 7, 9],
    avaroha: [0, 2, 4, 7, 9],
    vadi: 4,
    samvadi: 9,
    pakad: [4, 7, 9, 7, 4, 2], // G P D P G R
    mood: "calm major pentatonic",
    time: "early evening",
    ornaments: {
      meend: { degrees: [4, 9], prob: 0.28 },
      kan: { degrees: [4, 7], prob: 0.2 },
    },
  },
  kafi: {
    id: "kafi",
    label: "Kafi",
    aroha: [0, 2, 3, 5, 7, 9, 10],
    avaroha: [0, 2, 3, 5, 7, 9, 10],
    vadi: 7,
    samvadi: 2,
    pakad: [5, 7, 3, 5, 2, 0], // m P g m R S
    mood: "earthy, komal ga & ni",
    time: "night / spring",
    ornaments: {
      meend: { degrees: [3, 10], prob: 0.28 },
      andolan: { degrees: [3], cents: 14, prob: 0.18 },
    },
  },
  khamaj: {
    id: "khamaj",
    label: "Khamaj",
    aroha: [0, 4, 5, 7, 9, 11],
    avaroha: [0, 2, 4, 5, 7, 9, 10],
    vadi: 4,
    samvadi: 11,
    pakad: [7, 9, 10, 9, 5, 4], // P D n D m G
    mood: "light romantic, dual Ni",
    time: "evening",
    weak: [2], // Re is skipped ascending
    ornaments: {
      meend: { degrees: [4, 10], prob: 0.3 },
      kan: { degrees: [4, 7], prob: 0.2 },
    },
  },
  todi: {
    id: "todi",
    label: "Todi",
    aroha: [0, 1, 3, 6, 8, 11],
    avaroha: [0, 1, 3, 6, 8, 11],
    vadi: 8,
    samvadi: 3,
    pakad: [3, 6, 8, 6, 3, 1], // g M d M g r
    mood: "intense, komal re-ga-dha & tivra Ma",
    time: "late morning",
    ornaments: {
      andolan: { degrees: [3, 8], cents: 20, prob: 0.4 },
      meend: { degrees: [6], prob: 0.3 },
    },
  },
  marwa: {
    id: "marwa",
    label: "Marwa",
    aroha: [0, 1, 4, 6, 9, 11],
    avaroha: [0, 1, 4, 6, 9, 11],
    vadi: 1,
    samvadi: 9,
    pakad: [1, 4, 6, 4, 1], // r G M G r
    mood: "unsettled dusk, no Pa, komal Re",
    time: "sunset",
    weak: [0], // Sa is deliberately sparse in Marwa
    ornaments: {
      meend: { degrees: [1, 9], prob: 0.32 },
      andolan: { degrees: [1], cents: 18, prob: 0.22 },
    },
  },
  ahirbhairav: {
    id: "ahirbhairav",
    label: "Ahir Bhairav",
    aroha: [0, 1, 4, 5, 7, 9, 10],
    avaroha: [0, 1, 4, 5, 7, 9, 10],
    vadi: 5,
    samvadi: 0,
    pakad: [1, 4, 5, 7, 5, 4], // r G m P m G
    mood: "meditative morning, komal Re & Ni",
    time: "early morning",
    ornaments: {
      andolan: { degrees: [1], cents: 18, prob: 0.3 },
      kan: { degrees: [4, 5], prob: 0.2 },
      meend: { degrees: [10], prob: 0.25 },
    },
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
// tonic > vadi > samvadi > fifth > the rest in scale order, with weak/avoid
// degrees ranked LAST so they drop first. focus=0 keeps the full raga; focus=1
// keeps ~5 degrees (or fewer if the raga is smaller).
function trimByFocus(degrees: number[], raga: Raga, focus: number): number[] {
  const weak = new Set(raga.weak ?? []);
  const rank = (d: number) =>
    weak.has(d) && d !== 0
      ? 100 + d // weak degrees drop first
      : d === 0
        ? 0
        : d === raga.vadi
          ? 1
          : d === raga.samvadi
            ? 2
            : d === 7
              ? 3
              : 4 + d;
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

// Per-degree resting boost: lines dwell on and resolve to vadi/samvadi (the
// raga's authored resting strengths). Weak/avoid degrees are never boosted.
export function ragaBoost(raga: Raga, scaleLen: number): number[] {
  const b = new Array<number>(scaleLen).fill(0);
  const weak = new Set(raga.weak ?? []);
  if (raga.vadi >= 0 && raga.vadi < scaleLen && !weak.has(raga.vadi)) b[raga.vadi] = 0.9;
  if (raga.samvadi >= 0 && raga.samvadi < scaleLen && !weak.has(raga.samvadi)) b[raga.samvadi] = 0.7;
  return b;
}

// Authored ornament grammar for a raga (empty object when none), for the engine.
export function ragaOrnaments(raga: Raga | null | undefined): GamakaRules | null {
  return raga?.ornaments ?? null;
}
