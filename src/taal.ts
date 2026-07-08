// src/taal.ts
// Taal (rhythmic cycle) models — a PURE module: taal definitions + position math
// + structural bias weights. No audio, no Date, no Math.random; the engine and
// scheduler consume these to bias phrase starts / accents / rests / resolution
// toward structural points (especially sam), and the UI reads the position to
// show it compactly. mraga is an instrument, not a drum machine: a taal here is
// a *gravitational field* over the melodic line, not a percussion track.
//
// Matras are 0-indexed internally (matra 0 == sam == the downbeat). Standard
// Hindustani structures (practical, not scholarly): teental 16, jhaptal 10,
// rupak 7, ektaal 12. "off" == free/rubato (no taal).

export type TaalId = "off" | "teental" | "jhaptal" | "rupak" | "ektaal";

export type Taal = {
  id: Exclude<TaalId, "off">;
  label: string;
  matras: number; // beats in one cycle
  vibhags: number[]; // section lengths, sum === matras
  taliBeats: number[]; // 0-indexed clap (stressed) matras
  khaliBeats: number[]; // 0-indexed wave (empty) matras
  // In rupak the sam itself is a khali (the cycle opens on the wave); still the
  // strongest structural downbeat for phrasing purposes.
  samIsKhali?: boolean;
};

// Sam is always matra 0. Tali/khali follow the common clap patterns.
export const TAALS: Record<Exclude<TaalId, "off">, Taal> = {
  teental: {
    id: "teental",
    label: "Teental",
    matras: 16,
    vibhags: [4, 4, 4, 4],
    taliBeats: [0, 4, 12],
    khaliBeats: [8],
  },
  jhaptal: {
    id: "jhaptal",
    label: "Jhaptal",
    matras: 10,
    vibhags: [2, 3, 2, 3],
    taliBeats: [0, 2, 7],
    khaliBeats: [5],
  },
  rupak: {
    id: "rupak",
    label: "Rupak",
    matras: 7,
    vibhags: [3, 2, 2],
    taliBeats: [3, 5],
    khaliBeats: [0], // sam opens on the wave
    samIsKhali: true,
  },
  ektaal: {
    id: "ektaal",
    label: "Ektaal",
    matras: 12,
    vibhags: [2, 2, 2, 2, 2, 2],
    taliBeats: [0, 4, 8, 10],
    khaliBeats: [2, 6],
  },
};

export const TAAL_IDS: TaalId[] = ["off", "teental", "jhaptal", "rupak", "ektaal"];

export function getTaal(id: TaalId | null | undefined): Taal | null {
  if (!id || id === "off") return null;
  return TAALS[id] ?? null;
}

// Matra indices where each vibhag begins (0, then cumulative section lengths).
export function vibhagStarts(taal: Taal): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const len of taal.vibhags) {
    starts.push(acc);
    acc += len;
  }
  return starts;
}

export type TaalPosition = {
  matra: number; // 0-indexed, normalized into [0, matras)
  vibhagIndex: number;
  matraInVibhag: number;
  isSam: boolean; // matra 0
  isVibhagStart: boolean;
  isTali: boolean;
  isKhali: boolean;
};

// Normalize any (possibly negative / fractional) beat count into a position.
export function taalPositionAt(taal: Taal, beat: number): TaalPosition {
  const m = ((Math.floor(beat) % taal.matras) + taal.matras) % taal.matras;
  const starts = vibhagStarts(taal);
  let vibhagIndex = 0;
  for (let i = 0; i < starts.length; i++) {
    if (m >= starts[i]) vibhagIndex = i;
  }
  return {
    matra: m,
    vibhagIndex,
    matraInVibhag: m - starts[vibhagIndex],
    isSam: m === 0,
    isVibhagStart: starts.includes(m),
    isTali: taal.taliBeats.includes(m),
    isKhali: taal.khaliBeats.includes(m),
  };
}

// Structural bias weights for a position, all >= 0. The engine multiplies its
// phrase-start / accent / resolution likelihoods and scales rest probability by
// these, biasing musical events toward structural points — strongest at sam,
// then tali / vibhag starts, weakest (and rest-favouring) at khali and interior
// matras. These are deliberately mild: a taal shades the free engine, it does
// not turn it into a metronome.
export type TaalBias = {
  accent: number; // velocity / emphasis multiplier around 1.0
  phraseStart: number; // relative attraction for a fresh phrase to begin here
  resolution: number; // relative pull to resolve (land on a resting note) here
  rest: number; // relative attraction for a rest / breath here
};

export function taalBias(pos: TaalPosition): TaalBias {
  if (pos.isSam) {
    // Sam: the cycle's gravitational centre — phrases aim to arrive/resolve here.
    return { accent: 1.35, phraseStart: 1.0, resolution: 2.2, rest: 0.4 };
  }
  if (pos.isKhali) {
    // Khali (wave): a natural place to breathe / lift.
    return { accent: 0.8, phraseStart: 0.7, resolution: 0.7, rest: 1.6 };
  }
  if (pos.isVibhagStart || pos.isTali) {
    // Section boundaries: secondary emphasis, good phrase launch points.
    return { accent: 1.15, phraseStart: 1.4, resolution: 1.2, rest: 0.7 };
  }
  // Interior matra: neutral.
  return { accent: 1.0, phraseStart: 1.0, resolution: 1.0, rest: 1.0 };
}
