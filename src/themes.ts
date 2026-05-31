// src/themes.ts
// Warm palettes in mdrone's incandescent / candlelit mood. Each is a single
// saturated warm accent (--ember) over a warm-neutral surface, mirroring
// mdrone's structure. Applied by setting CSS custom properties on :root at
// runtime (so the theme can be toggled live), persisted in localStorage.
export type ThemeId = "saffron" | "madder" | "rosewood" | "clay" | "parchment";

export type Theme = { label: string; vars: Record<string, string> };

export const THEMES: Record<ThemeId, Theme> = {
  // golden saffron — warm, raga-evoking; the default.
  saffron: {
    label: "saffron",
    vars: { "--bg": "#15100a", "--ink": "#f1e3cd", "--ember": "#eaa53a", "--muted": "#9b8a70", "--line": "#34291d", "--field": "#211a12" },
  },
  // madder root — warm red-orange.
  madder: {
    label: "madder",
    vars: { "--bg": "#150d0a", "--ink": "#f3ddd1", "--ember": "#d75f4f", "--muted": "#9d857b", "--line": "#352822", "--field": "#20140f" },
  },
  // rosewood — warm berry/rose, still on the warm side of the wheel.
  rosewood: {
    label: "rosewood",
    vars: { "--bg": "#130b0d", "--ink": "#f0dbe0", "--ember": "#cf667e", "--muted": "#9a838a", "--line": "#322229", "--field": "#1d1318" },
  },
  // clay / terracotta — earthy warm orange.
  clay: {
    label: "clay",
    vars: { "--bg": "#140e0a", "--ink": "#f1e0d0", "--ember": "#c97a4e", "--muted": "#9c8975", "--line": "#342820", "--field": "#201711" },
  },
  // parchment — the original light, warm look (for bright rooms).
  parchment: {
    label: "parchment",
    vars: { "--bg": "#efe6d4", "--ink": "#3a2f24", "--ember": "#c0572b", "--muted": "#8a7a64", "--line": "#cabfa8", "--field": "#fff8ec" },
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];
const KEY = "mraga-theme";

export function loadThemeId(): ThemeId {
  const s = localStorage.getItem(KEY);
  return (THEME_IDS as string[]).includes(s ?? "") ? (s as ThemeId) : "saffron";
}

export function applyTheme(id: ThemeId): void {
  const t = THEMES[id] ?? THEMES.saffron;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
  localStorage.setItem(KEY, id);
}
