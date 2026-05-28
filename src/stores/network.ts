import { defineStore } from "pinia";
import { ref } from "vue";
import { supabase } from "../lib/supabase";
import type { AreaGoalRow, AreaRow, PickerRunRow } from "../types/database";
import {
  emptyBriefing,
  type GoalSnapshot,
  type NetworkBriefing,
} from "../types/briefing";

const NETWORK_FUNCTION = "area_picker_network";

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.ceil(ms / 86_400_000);
}

function goalFromRow(
  row: AreaGoalRow,
  briefingGoal: GoalSnapshot | null,
): GoalSnapshot {
  if (briefingGoal) return briefingGoal;
  const deadline = row.deadline ? new Date(row.deadline) : null;
  const days_left = deadline ? daysBetween(new Date(), deadline) : null;
  const targets = (row.category_targets as Record<string, number> | null) ?? {};
  const subtally: Record<string, { sent: number; target: number }> = {};
  for (const [k, v] of Object.entries(targets)) {
    subtally[k] = { sent: 0, target: v };
  }
  return {
    name: row.name,
    total_sent: 0,
    total_target: row.target,
    subtally,
    deadline: row.deadline,
    days_left,
  };
}

export const useNetworkStore = defineStore("network", () => {
  const briefing = ref<NetworkBriefing | null>(null);
  const goal = ref<GoalSnapshot | null>(null);
  const refreshing = ref(false);
  const lastRunId = ref<string | null>(null);
  const error = ref<string | null>(null);

  let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

  async function loadForArea(area: AreaRow) {
    error.value = null;
    if (area.slug !== "network") {
      briefing.value = null;
      goal.value = null;
      return;
    }

    const { data: goalRow } = await supabase
      .from("area_goals")
      .select("*")
      .eq("area_id", area.id)
      .eq("active", true)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: runRow } = await supabase
      .from("picker_runs")
      .select("*")
      .eq("area_id", area.id)
      .eq("function_name", NETWORK_FUNCTION)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const run = runRow as PickerRunRow | null;
    const summary = (run?.summary ?? null) as NetworkBriefing | null;
    if (summary && summary.todays_picks) {
      briefing.value = summary;
      lastRunId.value = run?.id ?? null;
      goal.value = goalRow
        ? goalFromRow(goalRow as AreaGoalRow, summary.goal)
        : summary.goal;
    } else {
      briefing.value = emptyBriefing("network");
      goal.value = goalRow ? goalFromRow(goalRow as AreaGoalRow, null) : null;
    }

    subscribeToRuns(area.id);
  }

  function subscribeToRuns(areaId: string) {
    void unsubscribe();
    realtimeChannel = supabase
      .channel(`network-routine:${areaId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "hmart",
          table: "picker_runs",
          filter: `area_id=eq.${areaId}`,
        },
        (payload) => {
          const row = payload.new as PickerRunRow;
          if (row.function_name !== NETWORK_FUNCTION) return;
          const summary = row.summary as NetworkBriefing | null;
          if (summary) {
            briefing.value = summary;
            lastRunId.value = row.id;
            if (summary.goal) goal.value = summary.goal;
          }
          refreshing.value = false;
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "hmart",
          table: "picker_runs",
          filter: `area_id=eq.${areaId}`,
        },
        (payload) => {
          const row = payload.new as PickerRunRow;
          if (row.function_name !== NETWORK_FUNCTION) return;
          if (row.id !== lastRunId.value) return;
          const summary = row.summary as NetworkBriefing | null;
          if (summary) {
            briefing.value = summary;
            if (summary.goal) goal.value = summary.goal;
          }
          refreshing.value = false;
        },
      )
      .subscribe();
  }

  async function unsubscribe() {
    if (realtimeChannel) {
      await supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  async function triggerRefresh(area: AreaRow) {
    if (area.slug !== "network") return;
    if (refreshing.value) return;
    refreshing.value = true;
    error.value = null;
    try {
      const { error: invokeError } = await supabase.functions.invoke(
        "area_picker",
        { body: { area: "network", source: "manual" } },
      );
      if (invokeError) throw invokeError;
    } catch (e) {
      refreshing.value = false;
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function markPickSent(pickId: string) {
    if (!briefing.value) return;
    const pick = briefing.value.todays_picks.find((p) => p.id === pickId);
    if (pick) {
      pick.marked_sent_at = new Date().toISOString();
      if (pick.contact_id) {
        await supabase
          .from("network_contacts")
          .update({
            last_touch_at: pick.marked_sent_at,
            status: "contacted",
          })
          .eq("id", pick.contact_id);
      }
    }
  }

  function skipPick(pickId: string) {
    if (!briefing.value) return;
    briefing.value.todays_picks = briefing.value.todays_picks.filter(
      (p) => p.id !== pickId,
    );
  }

  async function skipReply(replyId: string) {
    if (!briefing.value) return;
    briefing.value.inbox_replies.known =
      briefing.value.inbox_replies.known.filter((r) => r.id !== replyId);
    briefing.value.inbox_replies.warm =
      briefing.value.inbox_replies.warm.filter((r) => r.id !== replyId);
    await supabase
      .from("inbox_reply_drafts")
      .update({ status: "dismissed" })
      .eq("id", replyId);
  }

  async function dismissContact(threadId: string) {
    if (!briefing.value) return;
    briefing.value.new_from_inbox = briefing.value.new_from_inbox.filter(
      (c) => c.thread_id !== threadId,
    );
  }

  return {
    briefing,
    goal,
    refreshing,
    error,
    loadForArea,
    triggerRefresh,
    unsubscribe,
    markPickSent,
    skipPick,
    skipReply,
    dismissContact,
  };
});
