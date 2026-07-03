import { defineStore } from "pinia";
import { ref } from "vue";
import { supabase } from "../lib/supabase";
import { useVaultStore } from "./vault";
import type {
  ApplyOpportunityRow,
  ShareItemRow,
  TodoRow,
} from "../types/database";

/**
 * Reservoir feeds - app logic only, ZERO schema changes.
 *
 * A reservoir is a background POOL table that auto-feeds an AREA with a fixed
 * number of "active" suggestion tasks, on top of whatever manual todos live
 * there. The pool is READ-ONLY to the feed: it never edits a source row.
 *
 * Two feeds:
 *  - APPLY: apply_opportunities -> apply area, exactly 5 open suggestions.
 *    Eligible = status 'watchlist' AND (deadline null or in the future).
 *  - SHARE: share_items -> share area, exactly 4 open suggestions (about four
 *    shares a week). Eligible = status 'backlog' or 'suggested' - past target
 *    slots stay eligible (an unshipped share is still worth shipping).
 *
 * A surfaced task is an ordinary todo, tagged `reservoir`, stamped with
 * metadata {reservoir:true, source_id, source_table} and linked back through
 * surfaced_from. Completing one refills its feed; the source row is untouched.
 *
 * Re-surface rule (same for both feeds): a source row is excluded while it has
 * an OPEN reservoir todo. Once that todo is completed it becomes eligible again
 * only if its cycle date (deadline / target slot) is a genuinely later cycle
 * than the completion, OR the completion is more than 11 months old.
 */

// areas.slug = 'apply' / 'share'
export const APPLY_AREA_ID = "2690b483-d00c-5d3c-8a54-419a57525bc5";
export const SHARE_AREA_ID = "c8007c92-2fa7-50c6-92fc-572de2a5d569";
const RESERVOIR_TAG = "reservoir";

type ReservoirMeta = {
  reservoir?: boolean;
  source_id?: string;
  source_table?: string;
};

type SourceRow = { id: string; created_at: string };

interface FeedConfig<R extends SourceRow> {
  key: "apply" | "share";
  areaId: string;
  target: number;
  sourceTable: "apply_opportunities" | "share_items";
  /** Fetch the eligible pool, ordered best-first. */
  fetchPool: (today: string) => Promise<{ rows: R[]; error: string | null }>;
  /** Date that defines "a later cycle" for the re-surface rule. */
  cycleDate: (row: R) => string | null;
  /** Map a pool row to the surfaced todo's fields. */
  toTodo: (
    row: R,
    today: string,
  ) => { title: string; deadline: string | null; notes: string | null };
}

function metaOf(t: TodoRow): ReservoirMeta {
  return (t.metadata ?? {}) as ReservoirMeta;
}
function isOpen(t: TodoRow): boolean {
  return t.state !== "completed" && t.state !== "cancelled";
}

const APPLY_FEED: FeedConfig<ApplyOpportunityRow> = {
  key: "apply",
  areaId: APPLY_AREA_ID,
  target: 5,
  sourceTable: "apply_opportunities",
  fetchPool: async (today) => {
    const { data, error } = await supabase
      .from("apply_opportunities")
      .select("*")
      .eq("status", "watchlist")
      .or(`deadline.is.null,deadline.gte.${today}`)
      .order("deadline", { ascending: true, nullsFirst: false })
      .order("priority", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    return {
      rows: (data as ApplyOpportunityRow[] | null) ?? [],
      error: error?.message ?? null,
    };
  },
  cycleDate: (opp) => opp.deadline,
  toTodo: (opp) => ({
    title: opp.name,
    deadline: opp.deadline,
    notes: [opp.fit_note, opp.url].filter(Boolean).join("\n\n") || null,
  }),
};

const SHARE_FEED: FeedConfig<ShareItemRow> = {
  key: "share",
  areaId: SHARE_AREA_ID,
  target: 4,
  sourceTable: "share_items",
  fetchPool: async () => {
    // Past target slots stay eligible: an unshipped share is still worth
    // shipping, so no date filter here (unlike apply deadlines, which expire).
    const { data, error } = await supabase
      .from("share_items")
      .select("*")
      .in("status", ["backlog", "suggested"])
      .order("target_slot_at", { ascending: true, nullsFirst: false })
      .order("priority", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    return {
      rows: (data as ShareItemRow[] | null) ?? [],
      error: error?.message ?? null,
    };
  },
  cycleDate: (si) => si.target_slot_at,
  toTodo: (si, today) => ({
    title: si.title,
    // Only carry a FUTURE slot as the todo deadline - a long-past slot would
    // land the suggestion straight in Today as overdue noise.
    deadline:
      si.target_slot_at && si.target_slot_at >= today
        ? si.target_slot_at
        : null,
    notes:
      [si.hook, si.external_url ?? si.drive_folder_url]
        .filter(Boolean)
        .join("\n\n") || null,
  }),
};

export const useReservoirStore = defineStore("reservoir", () => {
  const lastError = ref<string | null>(null);
  const inflight: Partial<Record<"apply" | "share", Promise<void>>> = {};

  async function resolveReservoirTagId(userId: string): Promise<string | null> {
    const { data: rows } = await supabase
      .from("tags")
      .select("*")
      .eq("name", RESERVOIR_TAG)
      .limit(1);
    if (rows && rows.length) return (rows[0] as { id: string }).id;
    const { data: created, error } = await supabase
      .from("tags")
      .insert({ user_id: userId, name: RESERVOIR_TAG, color: null } as never)
      .select()
      .single();
    if (error) {
      lastError.value = error.message;
      return null;
    }
    return (created as { id: string } | null)?.id ?? null;
  }

  function elevenMonthsAgo(): Date {
    const d = new Date();
    d.setMonth(d.getMonth() - 11);
    return d;
  }

  async function run<R extends SourceRow>(cfg: FeedConfig<R>): Promise<void> {
    lastError.value = null;
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess.session?.user?.id;
    if (!userId) return;

    // 1. Current reservoir todos in the target area (all states - small set).
    const { data: areaTodosRaw, error: tErr } = await supabase
      .from("todos")
      .select("*")
      .eq("area_id", cfg.areaId);
    if (tErr) {
      lastError.value = tErr.message;
      return;
    }
    const reservoirTodos = ((areaTodosRaw as TodoRow[] | null) ?? []).filter(
      (t) => metaOf(t).reservoir === true,
    );
    const openReservoir = reservoirTodos.filter(isOpen);
    const shortfall = cfg.target - openReservoir.length;
    if (shortfall <= 0) return;

    // Exclusions:
    //  - any source row that currently has an OPEN reservoir todo
    //  - completed ones still in their cooldown (see reEligible)
    const openSourceIds = new Set(
      openReservoir.map((t) => metaOf(t).source_id).filter(Boolean) as string[],
    );
    const lastCompletedBySource = new Map<string, number>();
    for (const t of reservoirTodos) {
      if (t.state !== "completed" || !t.completed_at) continue;
      const sid = metaOf(t).source_id;
      if (!sid) continue;
      const ts = new Date(t.completed_at).getTime();
      const prev = lastCompletedBySource.get(sid) ?? 0;
      if (ts > prev) lastCompletedBySource.set(sid, ts);
    }
    const cutoff = elevenMonthsAgo().getTime();
    // A cycle date counts as "a later cycle" only if it falls well after the
    // completion - not a few days later. Without this guard the common flow
    // (complete a task whose date is still weeks away) would immediately
    // re-surface the SAME row. ~300 days = next year's occurrence.
    const LATER_CYCLE_MS = 300 * 24 * 60 * 60 * 1000;

    const reEligible = (row: R): boolean => {
      if (openSourceIds.has(row.id)) return false;
      const lastDone = lastCompletedBySource.get(row.id);
      if (lastDone === undefined) return true; // never surfaced+completed
      const cooldownElapsed = lastDone < cutoff;
      const cycle = cfg.cycleDate(row);
      const laterCycle =
        !!cycle && new Date(cycle).getTime() - lastDone > LATER_CYCLE_MS;
      return cooldownElapsed || laterCycle;
    };

    // 2. Eligible pool, ordered best-first by the feed's own query.
    const today = new Date().toISOString().slice(0, 10);
    const { rows, error: pErr } = await cfg.fetchPool(today);
    if (pErr) {
      lastError.value = pErr;
      return;
    }
    const toSurface = rows.filter(reEligible).slice(0, shortfall);
    if (!toSurface.length) return;

    const tagId = await resolveReservoirTagId(userId);

    // 3. Surface each: insert todo -> tag -> surfaced_from. Never touch source.
    let surfaced = 0;
    for (const row of toSurface) {
      const fields = cfg.toTodo(row, today);
      const { data: todo, error: insErr } = await supabase
        .from("todos")
        .insert({
          user_id: userId,
          area_id: cfg.areaId,
          project_id: null,
          title: fields.title,
          deadline: fields.deadline,
          state: "anytime",
          notes: fields.notes,
          metadata: {
            reservoir: true,
            source_id: row.id,
            source_table: cfg.sourceTable,
          },
        } as never)
        .select()
        .single();
      if (insErr || !todo) {
        lastError.value = insErr?.message ?? "surface insert failed";
        continue;
      }
      const todoId = (todo as TodoRow).id;
      if (tagId) {
        await supabase
          .from("todo_tags")
          .insert({ todo_id: todoId, tag_id: tagId } as never);
      }
      await supabase.from("surfaced_from").insert({
        todo_id: todoId,
        source_table: cfg.sourceTable,
        source_id: row.id,
        surfaced_at: new Date().toISOString(),
      } as never);
      surfaced++;
    }

    // 4. Refresh the live area view if it's the one on screen.
    if (surfaced > 0) {
      const vault = useVaultStore();
      if (vault.currentAreaId === cfg.areaId) {
        await vault.loadAreaTodos(cfg.areaId, { force: true });
      }
    }
  }

  function ensure<R extends SourceRow>(cfg: FeedConfig<R>): Promise<void> {
    const existing = inflight[cfg.key];
    if (existing) return existing;
    const p = run(cfg).finally(() => {
      delete inflight[cfg.key];
    });
    inflight[cfg.key] = p;
    return p;
  }

  function ensureApplyFeed(): Promise<void> {
    return ensure(APPLY_FEED);
  }
  function ensureShareFeed(): Promise<void> {
    return ensure(SHARE_FEED);
  }
  async function ensureAllFeeds(): Promise<void> {
    await Promise.all([ensureApplyFeed(), ensureShareFeed()]);
  }
  /** Refill whichever feed owns this area (used on reservoir-todo check-off). */
  function refillFeedForArea(areaId: string | null): Promise<void> {
    if (areaId === SHARE_AREA_ID) return ensureShareFeed();
    if (areaId === APPLY_AREA_ID) return ensureApplyFeed();
    return Promise.resolve();
  }

  return {
    ensureApplyFeed,
    ensureShareFeed,
    ensureAllFeeds,
    refillFeedForArea,
    lastError,
  };
});
