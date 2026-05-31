// src/presets.ts
// Named, locally-saved sounds (presets). Each preset is a MragaScene under a
// user-given name, persisted in localStorage. The list operations are pure and
// unit-tested; load/save just (de)serialize to localStorage.
import type { MragaScene } from "./mragaScene";

const KEY = "mraga-presets";

export type Preset = { name: string; scene: MragaScene };

export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((p) => p && typeof p.name === "string" && p.scene && typeof p.scene === "object");
  } catch {
    return [];
  }
}

export function savePresets(presets: Preset[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(presets));
  } catch {
    /* storage unavailable — ignore */
  }
}

// Pure: insert-or-replace a named preset, kept sorted by name.
export function upsertPreset(presets: Preset[], name: string, scene: MragaScene): Preset[] {
  const next = presets.filter((p) => p.name !== name);
  next.push({ name, scene });
  next.sort((a, b) => a.name.localeCompare(b.name));
  return next;
}

// Pure: remove a named preset.
export function deletePreset(presets: Preset[], name: string): Preset[] {
  return presets.filter((p) => p.name !== name);
}
