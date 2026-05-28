import { describe, it, expect } from "vitest";
import {
  contrastRatio,
  hexToRgb,
  accessibleTextColor,
  accessibleUIColor,
} from "../src/lib/contrast";

const WHITE: [number, number, number] = [255, 255, 255];

describe("contrast helpers", () => {
  it("returns ~21:1 for black on white", () => {
    expect(contrastRatio([0, 0, 0], WHITE)).toBeCloseTo(21, 0);
  });

  it("returns 1 for identical colors", () => {
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 2);
  });

  it("darkens each performance accent until AA text passes on white", () => {
    const accents = [
      "#8B5CF6", // reverse
      "#2AA4DD", // hard
      "#02F700", // reinforcement
      "#FEE005", // versus
      "#F6009B", // carnation
    ];
    for (const hex of accents) {
      const darkened = accessibleTextColor(hex);
      expect(contrastRatio(hexToRgb(darkened), WHITE)).toBeGreaterThanOrEqual(
        4.49,
      );
    }
  });

  it("UI variant only needs 3:1", () => {
    const darkened = accessibleUIColor("#FEE005");
    expect(contrastRatio(hexToRgb(darkened), WHITE)).toBeGreaterThanOrEqual(
      2.99,
    );
  });
});
