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
}

/**
 * Contexts carry NO colour, deliberately.
 *
 * They used to hold one house accent each, but every one of those hexes was
 * already spoken for: web was the P0 cobalt, email the overdue vermilion,
 * text the P1 gold, buy the P2 violet, offline the ongoing teal, notes the
 * done green. So an emailed task read as overdue and an ongoing note read as
 * finished. The word "email" is already the whole signal; the hue only
 * borrowed an urgency the task did not have.
 *
 * Colour in a row now means exactly one thing: priority. Everything else -
 * area, context, project - identifies itself by its label.
 */

/**
 * Canonical order. Buckets render in this order, so it should read like a
 * working day: the screen-bound modes first, then away-from-desk, then the two
 * that are never "done".
 */
export const CONTEXTS: ContextDef[] = [
  { name: "web", hint: "browser work" },
  { name: "email", hint: "emails to write or send" },
  { name: "text", hint: "texts to send" },
  { name: "buy", hint: "things to order or pick up" },
  { name: "offline", hint: "away from the screen" },
  { name: "notes", hint: "ongoing notes, never finished" },
  { name: "think-plan", hint: "thinking and planning" },
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
