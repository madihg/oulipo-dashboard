/**
 * Which platform owns the modifier key. A shortcut hint names that key in a
 * word ("cmd k" on a Mac, "ctrl k" elsewhere): the palette opens on either
 * metaKey or ctrlKey, so a glyph would be right on one platform and wrong on
 * the other.
 */
export const IS_APPLE =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);

/** The modifier's word on this platform. */
export const MOD = IS_APPLE ? "cmd" : "ctrl";
