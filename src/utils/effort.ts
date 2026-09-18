import type { Effort } from "../types/database";

/**
 * Effort - how much of you a task takes, as a t-shirt size.
 *
 * Priority says what matters; context says what you need in front of you;
 * effort says what fits. "I have twenty minutes" and "I have no energy" are
 * both answered by the same cut: show me the small ones. It is one value per
 * task, so it is a column like priority, not a tag like context.
 *
 * Four sizes on purpose. Finer scales invite estimating instead of doing, and
 * the only decision the size has to support is "does this fit right now".
 */
export interface EffortDef {
  name: Effort;
  /** Authored lowercase; the caption class uppercases it. */
  label: string;
  /** What the size means, for tooltips and assistive text. */
  hint: string;
}

/** Canonical order: smallest first, the order the question is asked in. */
export const EFFORTS: EffortDef[] = [
  { name: "S", label: "s", hint: "small: minutes" },
  { name: "M", label: "m", hint: "medium: under an hour" },
  { name: "L", label: "l", hint: "large: half a day" },
  { name: "XL", label: "xl", hint: "extra large: a day or more" },
];

const RANK = new Map<string, number>(EFFORTS.map((e, i) => [e.name, i]));
const BY_NAME = new Map<string, EffortDef>(EFFORTS.map((e) => [e.name, e]));

export function effortDef(e: string | null | undefined): EffortDef | null {
  return e ? (BY_NAME.get(e) ?? null) : null;
}

/** Smallest first; an unsized task sorts after every sized one. */
export function effortRank(e: string | null | undefined): number {
  return e ? (RANK.get(e) ?? Infinity) : Infinity;
}
