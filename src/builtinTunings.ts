// src/builtinTunings.ts
// Vendored verbatim from ../mdrone/src/microtuning.ts. A share link that
// references a builtin tuningId carries no inline cents, so mraga resolves
// the degrees from this table.
export type BuiltinTuning = { id: string; label: string; degrees: number[] };

export const BUILTIN_TUNINGS: Record<string, BuiltinTuning> = {
  equal: {
    id: "equal",
    label: "Equal (12-TET)",
    degrees: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200],
  },
  just5: {
    id: "just5",
    label: "Just 5-limit",
    degrees: [0, 111.73, 203.91, 315.64, 386.31, 498.04, 582.51, 701.96, 813.69, 884.36, 996.09, 1088.27, 1200],
  },
  meantone: {
    id: "meantone",
    label: "¼-comma Meantone",
    degrees: [0, 76.05, 193.16, 310.26, 386.31, 503.42, 579.47, 696.58, 772.63, 889.74, 1006.84, 1082.89, 1200],
  },
  harmonics: {
    id: "harmonics",
    label: "Harmonic Series",
    degrees: [0, 104.96, 203.91, 266.87, 386.31, 498.04, 551.32, 701.96, 813.69, 884.36, 968.83, 1088.27, 1200],
  },
  "maqam-rast": {
    id: "maqam-rast",
    label: "Maqam Rast",
    degrees: [0, 100, 200, 350, 400, 500, 600, 700, 800, 900, 1050, 1100, 1200],
  },
  slendro: {
    id: "slendro",
    label: "Slendro",
    degrees: [0, 80, 160, 240, 360, 480, 600, 720, 800, 880, 960, 1080, 1200],
  },
};

export function getBuiltinDegrees(id: string | null | undefined): number[] {
  if (id && BUILTIN_TUNINGS[id]) return BUILTIN_TUNINGS[id].degrees;
  return BUILTIN_TUNINGS.equal.degrees;
}
