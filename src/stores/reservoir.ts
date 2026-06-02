import { defineStore } from "pinia";
import { ref } from "vue";
import { supabase } from "../lib/supabase";
import { useVaultStore } from "./vault";
import type { ApplyOpportunityRow, TodoRow } from "../types/database";

/**
 * Reservoir feed - app logic only, ZERO schema changes.
 *
 * The Apply AREA always shows exactly 5 "active" tasks drawn from the
 * apply_opportunities POOL, on top of whatever manual todos already live there.
 * apply_opportunities is the READ-ONLY source: the feed never edits an
 * opportunity row (Halim re-applies in later years - the source stays intact).
 *
 * A surfaced task is an ordinary todo, tagged `reservoir`, stamped with
 * metadata {reservoir:true, source_id:<opp id>} and linked back through
 * surfaced_from. Completing one refills the feed back to 5; the opportunity is
 * untouched.
 *
 * Re-surface rule (confirmed - "yearly re-apply"): an opportunity is excluded
 * while it has an OPEN reservoir todo. Once that todo is completed it becomes
 * eligible again only if the opportunity's deadline is later than the
 * completion, OR the completion is more than 11 months old.
 */

// The Apply area (areas.slug = 'apply').
export const APPLY_AREA_ID = "2690b483-d00c-5d3c-8a54-419a57525bc5";
const RESERVOIR_TAG = "reservoir";
const FEED_TARGET = 5;

type ReservoirMeta = { reservoir?: boolean; source_id?: string };

function metaOf(t: TodoRow): ReservoirMeta {
  return (t.metadata ?? {}) as ReservoirMeta;
}
function isOpen(t: TodoRow): boolean {
  return t.state !== "completed" && t.state !== "cancelled";
}

export const useReservoirStore = defineStore("reservoir", () => {
  const lastError = ref<string | null>(null);
  let inflight: Promise<void> | null = null;

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

  /**
   * Eleven-months-ago boundary as a Date. A completion older than this makes the
   * opportunity eligible to resurface again (yearly re-apply).
   */
  function elevenMonthsAgo(): Date {
    const d = new Date();
    d.setMonth(d.getMonth() - 11);
    return d;
  }

  /**
   * Ensure exactly FEED_TARGET open reservoir todos exist in the Apply area.
   * Idempotent and single-flight: concurrent callers share one run.
   */
  function ensureApplyFeed(): Promise<void> {
    if (inflight) return inflight;
    inflight = run().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function run(): Promise<void> {
    lastError.value = null;
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess.session?.user?.id;
    if (!userId) return;

    // 1. Current reservoir todos in the Apply area (all states - small set).
    const { data: applyTodosRaw, error: tErr } = await supabase
      .from("todos")
      .select("*")
      .eq("area_id", APPLY_AREA_ID);
    if (tErr) {
      lastError.value = tErr.message;
      return;
    }
    const reservoirTodos = ((applyTodosRaw as TodoRow[] | null) ?? []).filter(
      (t) => metaOf(t).reservoir === true,
    );
    const openReservoir = reservoirTodos.filter(isOpen);
    const shortfall = FEED_TARGET - openReservoir.length;
    if (shortfall <= 0) return;

    // Exclusions:
    //  - any opportunity that currently has an OPEN reservoir todo
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
    // A deadline counts as "a later cycle" (yearly re-apply) only if it falls
    // well after the completion - not a few days later. Without this guard the
    // common flow (complete a task whose deadline is still weeks away) would
    // immediately re-surface the SAME opportunity, contradicting "must not
    // bounce back this cycle". ~300 days ≈ next year's occurrence.
    const LATER_CYCLE_MS = 300 * 24 * 60 * 60 * 1000;

    function reEligible(opp: ApplyOpportunityRow): boolean {
      // Already has an open reservoir todo -> never duplicate.
      if (openSourceIds.has(opp.id)) return false;
      const lastDone = lastCompletedBySource.get(opp.id);
      if (lastDone === undefined) return true; // never surfaced+completed
      // Yearly re-apply: eligible once the completion is >11 months old, OR the
      // opportunity's deadline is a genuinely later cycle than the completion.
      const cooldownElapsed = lastDone < cutoff;
      const deadlineLaterCycle =
        !!opp.deadline &&
        new Date(opp.deadline).getTime() - lastDone > LATER_CYCLE_MS;
      return cooldownElapsed || deadlineLaterCycle;
    }

    // 2. Eligible pool: watchlist, dated-in-the-future or undated. Ordered
    //    deadline ASC NULLS LAST, then priority (P0,P1,P2), then created_at.
    const today = new Date().toISOString().slice(0, 10);
    const { data: oppsRaw, error: oErr } = await supabase
      .from("apply_opportunities")
      .select("*")
      .eq("status", "watchlist")
      .or(`deadline.is.null,deadline.gte.${today}`)
      .order("deadline", { ascending: true, nullsFirst: false })
      .order("priority", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (oErr) {
      lastError.value = oErr.message;
      return;
    }
    const candidates = ((oppsRaw as ApplyOpportunityRow[] | null) ?? []).filter(
      reEligible,
    );
    const toSurface = candidates.slice(0, shortfall);
    if (!toSurface.length) return;

    const tagId = await resolveReservoirTagId(userId);

    // 3. Surface each: insert todo -> tag -> surfaced_from. Never touch the opp.
    let surfaced = 0;
    for (const opp of toSurface) {
      const notes = [opp.fit_note, opp.url].filter(Boolean).join("\n\n");
      const { data: todo, error: insErr } = await supabase
        .from("todos")
        .insert({
          user_id: userId,
          area_id: APPLY_AREA_ID,
          project_id: null,
          title: opp.name,
          deadline: opp.deadline,
          state: "anytime",
          notes: notes || null,
          metadata: { reservoir: true, source_id: opp.id },
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
        source_table: "apply_opportunities",
        source_id: opp.id,
        surfaced_at: new Date().toISOString(),
      } as never);
      surfaced++;
    }

    // 4. Refresh the live Apply area view if it's the one on screen.
    if (surfaced > 0) {
      const vault = useVaultStore();
      if (vault.currentAreaId === APPLY_AREA_ID) {
        await vault.loadAreaTodos(APPLY_AREA_ID, { force: true });
      }
    }
  }

  return { ensureApplyFeed, lastError };
});
