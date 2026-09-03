/**
 * Contexts - the "what kind of work is this" tags.
 *
 * These are a closed, ordered set, unlike the ~110 freeform tags in the
 * registry (which are topics, pipeline metadata like "suggested"/"offer", and
 * one-off labels). A context answers a different question: not what the task is
 * about, but what you need in front of you to do it. That is what makes them
 * worth grouping by - "everything I can clear in a browser right now" is a
 * useful list; "everything tagged residency" is a search.
 *
 * They are ordinary rows in the tags table, so nothing else has to know they
 * are special. This module is only the canonical order, labels and colours.
 */

export type ContextName =
  "web" | "email" | "text" | "buy" | "offline" | "notes" | "think-plan";

export interface ContextDef {
  name: ContextName;
  /** What it means, for the settings page and tooltips. */
  hint: string;
  /** AA-safe on white; drawn from the house accents, never a new hue. */
  color: string;
}

/**
 * Canonical order. Buckets render in this order, so it should read like a
 * working day: the screen-bound modes first, then away-from-desk, then the two
 * that are never "done".
 */
export const CONTEXTS: ContextDef[] = [
  { name: "web", hint: "browser work", color: "#1430c0" },
  { name: "email", hint: "emails to write or send", color: "#c0301a" },
  { name: "text", hint: "texts to send", color: "#8a6310" },
  { name: "buy", hint: "things to order or pick up", color: "#5a3bb0" },
  { name: "offline", hint: "away from the screen", color: "#0f766e" },
  { name: "notes", hint: "ongoing notes, never finished", color: "#176e46" },
  {
    name: "think-plan",
    hint: "thinking and planning",
    color: "rgba(0, 0, 0, 0.62)",
  },
];

const ORDER = new Map(CONTEXTS.map((c, i) => [c.name as string, i]));
const BY_NAME = new Map(CONTEXTS.map((c) => [c.name as string, c]));

export const CONTEXT_NAMES: string[] = CONTEXTS.map((c) => c.name);

export function isContext(tag: string): tag is ContextName {
  return BY_NAME.has(tag);
}

export function contextDef(tag: string): ContextDef | null {
  return BY_NAME.get(tag) ?? null;
}

/**
 * The context a row belongs to, for bucketing. A task can legitimately carry
 * more than one (buying online is both "buy" and "web"), so the earliest in
 * canonical order wins and the row appears once. Returning null rather than a
 * placeholder keeps the "no context" bucket the caller's decision.
 */
export function primaryContext(tags: string[] | undefined): ContextName | null {
  if (!tags?.length) return null;
  let best: ContextName | null = null;
  let bestRank = Infinity;
  for (const t of tags) {
    const rank = ORDER.get(t);
    if (rank !== undefined && rank < bestRank) {
      bestRank = rank;
      best = t as ContextName;
    }
  }
  return best;
}

/** Canonical rank of a row's primary context, Infinity when it has none. */
export function contextRank(tags: string[] | undefined): number {
  const c = primaryContext(tags);
  return c === null ? Infinity : (ORDER.get(c) ?? Infinity);
}

/** Contexts first (in canonical order), then everything else alphabetically. */
export function sortTagsByContext(tags: string[]): string[] {
  return [...tags].sort((a, b) => {
    const ra = ORDER.get(a) ?? Infinity;
    const rb = ORDER.get(b) ?? Infinity;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}
