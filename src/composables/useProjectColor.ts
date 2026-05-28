/**
 * Deterministic project color from a project slug or id.
 *
 * Returns a hex from a 16-stop palette tuned to play with the Hmart
 * performance accents (carnation/hard/reverse/reinforcement/versus) and
 * the slate ground. Stable across reloads because it hashes the input
 * to a palette index.
 *
 * Special-case carnation when the project slug contains "5x4" / "5-x-4"
 * since that's Halim's pinned-priority project; everything else cycles.
 */

const PALETTE = [
  "#F6009B", // carnation
  "#2AA4DD", // hard cyan
  "#8B5CF6", // reverse violet
  "#F59E0B", // amber
  "#10B981", // emerald
  "#EC4899", // pink
  "#6366F1", // indigo
  "#0EA5E9", // sky
  "#14B8A6", // teal
  "#F43F5E", // rose
  "#22C55E", // green
  "#A855F7", // purple
  "#3B82F6", // blue
  "#FB923C", // orange
  "#06B6D4", // cyan
  "#84CC16", // lime
];

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

export function projectColor(slugOrId: string | null | undefined): string {
  if (!slugOrId) return "#94A3B8"; // slate-400 = "no project"
  const key = slugOrId.toLowerCase();
  if (key.includes("5x4") || key.includes("5-x-4")) return "#F6009B";
  const idx = hashStr(key) % PALETTE.length;
  return PALETTE[idx]!;
}

/**
 * Returns a calmer text color for the same project so it's legible
 * as a label color when needed (the bright palette colors don't all
 * pass AA on white at 12px).
 */
export function projectColorText(slugOrId: string | null | undefined): string {
  const c = projectColor(slugOrId);
  // Pre-darkened text variants for the most-used palette colors
  const map: Record<string, string> = {
    "#F6009B": "#B8006F",
    "#2AA4DD": "#1E6E96",
    "#8B5CF6": "#6B3FE0",
    "#F59E0B": "#92580B",
    "#10B981": "#0B7A0A",
    "#EC4899": "#9F1F60",
    "#6366F1": "#4338CA",
    "#0EA5E9": "#0369A1",
    "#14B8A6": "#0F766E",
    "#F43F5E": "#9F1239",
    "#22C55E": "#15803D",
    "#A855F7": "#6B21A8",
    "#3B82F6": "#1D4ED8",
    "#FB923C": "#9A3412",
    "#06B6D4": "#0E7490",
    "#84CC16": "#3F6212",
  };
  return map[c] ?? "#475569";
}
