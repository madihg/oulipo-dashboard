/**
 * WCAG contrast helpers ported from the design system spec.
 * See ~/Documents/second-brain/A2. Make/Hmart Design System.md sections 03 + 08.
 *
 * `accessibleTextColor(hex)` returns the input hex darkened toward black
 * via binary search until it meets WCAG AA (4.5:1 on white). Used so raw
 * brand accents never land on a glyph as-is.
 *
 * `accessibleUIColor(hex)` is the looser 3:1 variant for non-text UI
 * (borders, dividers, focus rings).
 */

const WHITE: [number, number, number] = [255, 255, 255];

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (x: number) =>
    Math.max(0, Math.min(255, Math.round(x)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

export function contrastRatio(
  fg: [number, number, number],
  bg: [number, number, number],
): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [a, b] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (a + 0.05) / (b + 0.05);
}

function darkenToward(
  rgb: [number, number, number],
  amount: number,
): [number, number, number] {
  return [rgb[0] * (1 - amount), rgb[1] * (1 - amount), rgb[2] * (1 - amount)];
}

/**
 * Binary-search a darkened version of `hex` that meets WCAG AA against white.
 * Defaults to text contrast (4.5:1); pass 3 for non-text UI.
 */
export function ensureContrast(hex: string, minRatio = 4.5): string {
  // Target slightly above the threshold so post-rounding to integer RGB
  // hex codes doesn't drift below the WCAG minimum.
  const target = minRatio + 0.05;
  const original = hexToRgb(hex);
  if (contrastRatio(original, WHITE) >= target) {
    return rgbToHex(...original);
  }

  let lo = 0;
  let hi = 1;
  let best = darkenToward(original, hi);
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    const candidate = darkenToward(original, mid);
    if (contrastRatio(candidate, WHITE) >= target) {
      best = candidate;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  // Verify the post-rounded hex still meets the threshold; nudge once if not.
  let result = rgbToHex(...best);
  if (contrastRatio(hexToRgb(result), WHITE) < minRatio) {
    best = darkenToward(best, 0.02);
    result = rgbToHex(...best);
  }
  return result;
}

export function accessibleTextColor(hex: string): string {
  return ensureContrast(hex, 4.5);
}

export function accessibleUIColor(hex: string): string {
  return ensureContrast(hex, 3);
}
