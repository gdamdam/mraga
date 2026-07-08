// src/builtinTunings.ts
// The builtin tuning tables are now unified with mdrone: they are DERIVED from
// the vendored shared tuning library (vendor/tuning-core/builtins) rather than
// re-declared here, so mraga and mdrone can never drift on cents values. A
// share link that references a builtin tuningId carries no inline cents, so
// mraga resolves the degrees from this table.
//
// The public shape is unchanged: `BUILTIN_TUNINGS` is still keyed by mraga's
// short ids and each `degrees` array is the legacy 13-slot form
// [scaleCents…, period] (12 sounding degrees + the 1200¢ octave).
import { BUILTIN_PORTABLE_TUNINGS } from "./vendor/tuning-core/builtins";
import { periodCents } from "./vendor/tuning-core/model";

export type BuiltinTuning = { id: string; label: string; degrees: number[] };

// mraga's short ids ↔ the shared library's canonical tuning names. Order and
// cents match mdrone's builtin set exactly.
const ID_BY_NAME: Record<string, string> = {
  "Equal (12-TET)": "equal",
  "Just 5-limit": "just5",
  "¼-comma Meantone": "meantone",
  "Harmonic Series": "harmonics",
  "Maqam Rast": "maqam-rast",
  Slendro: "slendro",
};

export const BUILTIN_TUNINGS: Record<string, BuiltinTuning> = Object.fromEntries(
  BUILTIN_PORTABLE_TUNINGS.filter((t) => ID_BY_NAME[t.name]).map((t) => {
    const id = ID_BY_NAME[t.name];
    // Legacy 13-slot form: sounding degrees followed by the repeat period.
    return [id, { id, label: t.name, degrees: [...t.scaleCents, periodCents(t)] }];
  }),
);

// Returns 13 degrees [0..1200]; callers must drop the final octave when
// building a PortableTuning.scaleCents (length 12).
export function getBuiltinDegrees(id: string | null | undefined): number[] {
  if (id && BUILTIN_TUNINGS[id]) return BUILTIN_TUNINGS[id].degrees;
  return BUILTIN_TUNINGS.equal.degrees;
}
