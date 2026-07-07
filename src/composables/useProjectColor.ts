/**
 * Deterministic project/area color from a slug or id.
 *
 * Returns a hex from a 16-stop palette led by the halimmadi marks
 * (cobalt/vermilion/viridian/gold/azure/violet) then complementary deep tones.
 * Stable across reloads because it hashes the input to a palette index.
 *
 * Special-case cobalt (the primary accent) when the slug contains "5x4" /
 * "5-x-4" since that's Halim's pinned-priority project; everything else cycles.
 */

const PALETTE = [
  "#1c39e8", // cobalt (primary)
  "#e5391c", // vermilion
  "#1e8e5a", // viridian
  "#e89b1b", // gold
  "#2e7bd6", // azure
  "#6e4bd0", // violet
  "#0f766e", // teal
  "#c21f7a", // magenta
  "#0369a1", // deep sky
  "#c2410c", // burnt orange
  "#4338ca", // indigo
  "#15803d", // green
  "#be123c", // rose
  "#7e22ce", // purple
  "#4d7c0f", // olive
  "#0e7490", // cyan
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
  if (!slugOrId) return "#b6b3aa"; // warm metal = "no project"
  const key = slugOrId.toLowerCase();
  if (key.includes("5x4") || key.includes("5-x-4")) return "#1c39e8";
  const idx = hashStr(key) % PALETTE.length;
  return PALETTE[idx]!;
}

/**
 * Returns a calmer text color for the same project so it's legible
 * as a label color when needed (the brighter palette colors don't all
 * pass AA on white at 12px).
 */
export function projectColorText(slugOrId: string | null | undefined): string {
  const c = projectColor(slugOrId);
  // Pre-darkened text variants for the lighter palette colors (AA on white).
  const map: Record<string, string> = {
    "#1c39e8": "#1430c0",
    "#e5391c": "#c0301a",
    "#1e8e5a": "#176e46",
    "#e89b1b": "#8a6310",
    "#2e7bd6": "#1f5fa8",
    "#6e4bd0": "#5a3bb0",
    "#0f766e": "#0f766e",
    "#c21f7a": "#a01862",
    "#0369a1": "#0369a1",
    "#c2410c": "#9a3412",
    "#4338ca": "#4338ca",
    "#15803d": "#15803d",
    "#be123c": "#9f1239",
    "#7e22ce": "#6b21a8",
    "#4d7c0f": "#3f6212",
    "#0e7490": "#0e7490",
  };
  return map[c] ?? "#6b6660";
}
