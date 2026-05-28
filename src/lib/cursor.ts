/**
 * Custom dot cursor per design system Interaction #1.
 * Inline SVG circle (8px radius in a 20x20 viewBox), filled in the given
 * accent, encoded as a data URI so it can be set via `cursor: url(...)`.
 */

export function dotCursor(accentHex: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">` +
    `<circle cx="10" cy="10" r="8" fill="${accentHex}"/>` +
    `</svg>`;
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `url("data:image/svg+xml,${encoded}") 10 10, pointer`;
}
