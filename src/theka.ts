// src/theka.ts
// Theka — an OPTIONAL, barely-audible metric tick that lets the taal cycle be
// *felt* without turning mraga into a drum machine. A PURE module: given a taal
// and a beat position it decides whether a stroke sounds and how hard. No audio,
// no Date, no Math.random. The App renders each stroke as a short muted KS pluck
// on the drone pool, quantized to the metric clock (see APP_WIRING). The theka
// marks the clap skeleton only: sam (strongest) and the tali (clap) matras; the
// khali (wave) matras and all interior matras stay silent, so the cycle reads as
// a sparse pulse rather than a full percussion track.
//
// Velocities are deliberately tiny — the stroke should sit under the drone.
import type { Taal } from "./taal";
import { taalPositionAt } from "./taal";

// Stroke velocities (0..1). Sam is slightly stronger than the tali strokes so
// the top of the cycle is the loudest point; both are barely-audible by design.
export const THEKA_SAM_VELOCITY = 0.2;
export const THEKA_TALI_VELOCITY = 0.15;

export type ThekaAccent = "sam" | "tali" | "none";

export type ThekaTick = {
  play: boolean; // false === silent (khali, interior matra, or an off-beat position)
  velocity: number; // 0 when silent; sam louder than tali
  accent: ThekaAccent; // structural role of the stroke, for display/wiring
};

const SILENT: ThekaTick = { play: false, velocity: 0, accent: "none" };

// Pure: the stroke (if any) at a given beat position. Only integer matra onsets
// carry a stroke — a fractional `beat` (mid-matra) is silent, so a caller that
// samples the metric clock slightly off a grid line never spuriously ticks.
// Precedence: sam always sounds (it is the cycle's downbeat even in rupak, where
// the sam is nominally a khali), then khali is silent, then tali sounds; every
// other (interior) matra is silent.
export function thekaTickAt(taal: Taal, beat: number, eps = 1e-6): ThekaTick {
  const nearest = Math.round(beat);
  if (Math.abs(beat - nearest) > eps) return SILENT;
  const pos = taalPositionAt(taal, nearest);
  if (pos.isSam) return { play: true, velocity: THEKA_SAM_VELOCITY, accent: "sam" };
  if (pos.isKhali) return SILENT;
  if (pos.isTali) return { play: true, velocity: THEKA_TALI_VELOCITY, accent: "tali" };
  return SILENT;
}

// Pure: the stroke for each matra of one cycle (index i === matra i). Convenience
// for callers/tests that want the whole clap skeleton at a glance.
export function thekaCycle(taal: Taal): ThekaTick[] {
  return Array.from({ length: taal.matras }, (_, i) => thekaTickAt(taal, i));
}
