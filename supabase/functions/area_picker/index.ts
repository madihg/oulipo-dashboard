// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { runPicker, type ReservoirTable } from "../_shared/picker.ts";
import { runNetworkRoutine } from "../_shared/network_routine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

/**
 * area_picker - single Edge Function that handles all 10 area picks
 * dispatched by POST body { area: "share" | "network" | "learn" | ... }.
 *
 * The 10 areas correspond verbatim to the Cowork briefings. Each area's
 * prompt fragment encodes its scoring rules (verbatim source in
 * specs/pickers-source-spec.md).
 */

type AreaConfig = {
  reservoir_tables: ReservoirTable[];
  surface_target: number;
  prompt: string;
};

const AREAS: Record<string, AreaConfig> = {
  share: {
    reservoir_tables: ["share_items"],
    surface_target: 3,
    prompt: `Replicates share-briefing + share-p0-morning-briefing.
- Score share_items by: imminent event/release > P0 > freshness.
- For each pick draft the IG caption (per style memory) AND the Substack body (per style memory) directly in notes.
- Reuse drafts when share_items.draft is non-empty.
- Choose 3-5 images / refs when applicable (mention names in notes).
- Touchpoint logic: announce, during, after - infer from arc + date.
- Never invent target_slot dates.`,
  },
  network: {
    reservoir_tables: ["network_contacts"],
    surface_target: 5,
    prompt: `Replicates the Cowork network-briefing exactly. The 5x4 system: 5 outreaches per week sustained, 5 contacts per each of 4 categories (Podcasts, Peers, Publications, Galleries). EO-May 2026 push: 20 sends across the buckets by 2026-05-31.

Tier cadence (canonical, from vault _Backlog_.md):
- Tier 0 monthly: touch if last_touch_at older than 30 days
- Tier 1 quarterly: touch if last_touch_at older than 90 days
- Tier 2 biannually: touch if last_touch_at older than 180 days
- Tier 3 twice-yearly: touch if last_touch_at older than 180 days (same band)
- Tier 4 yearly: touch if last_touch_at older than 365 days

Selection rules (apply in order):
1. Tiered Contacts whose cadence is due or overdue (tier IS NOT NULL). Always include any tier 0 due. Then tier 1, 2, 3, 4 as cadence dictates.
2. EO-May Cold funnel (network_contacts where vault_section starts with "Cold funnel" AND status IN ('lead','contacted')): 1 per category per weekday, P0 podcasts/publications weighted 2x, P1 galleries/peers 1x. Pipeline balance - check the picks already surfaced this week (look at hmart.todos with metadata.surfaced_by = 'pick_network' from last 5 days) and avoid repeating the same category two days running.
3. Hook availability: prefer contacts with notes/hook field non-empty.

Output target:
- Surface 5 picks total.
- project_slug should be "5-x-4" for all picks (this is the meta-tracker project that aggregates the weekly cadence).
- state should be "today" so picks appear in /today the same morning.
- priority: tier 0 / overdue cold pitches => P0; tier 1 / fresh cold => P1; else P2.

For each pick draft notes containing:
- One-line rationale at top: "why today: <tier cadence due | EO-May push | overdue maintenance | hook reference>"
- Outreach opening (warm, first-name, opt-out line, signature). If they have an email, this is paste-ready for Gmail.
- Hook reference: which recent work / mutual peer / past interaction warrants the touch.
- Suggested send channel: Gmail / Instagram DM / LinkedIn / per their preference in the contact row.
- If you want to look up the email style guide, call search_memory({"query": "email style", "kinds": ["style_guide"]}) before drafting.`,
  },
  learn: {
    reservoir_tables: ["learn_items", "learn_wikis"],
    surface_target: 5,
    prompt: `Replicates learn-briefing.
- Pull 3-5 P0/P1 lit + 2-3 tech items from learn_items.
- Tag-match against active write_drafts to suggest connections.
- For each pick, notes should include the source link + one-line "why this connects" annotation + tag overlap.
- Floor: always at least 3 P0 lit picks and 3 diagonal picks.
- Verify items aren't already covered (skip status=done unless flagged for resurface).`,
  },
  apply: {
    reservoir_tables: ["apply_opportunities"],
    surface_target: 4,
    prompt: `Replicates apply-briefing.
- Sort apply_opportunities by deadline-proximity (<=30 days first) then P0.
- Maintain Active queue cap of 5.
- For each pick draft a one-line fit note referencing the user's practice (computational poetry, Arabic literary tradition, ML, performance).
- Show deadline countdown prominently in notes (red <14 days, orange <28).`,
  },
  make: {
    reservoir_tables: ["make_pieces"],
    surface_target: 3,
    prompt: `Replicates make-briefing.
- Surface 3 make_pieces by ship-rhythm alignment + priority.
- For each, notes should include: current state, what shipping looks like this week, blocking-on items.
- Weekly cadence is 1 piece per week target.`,
  },
  write: {
    reservoir_tables: ["write_drafts", "learn_wikis"],
    surface_target: 3,
    prompt: `Replicates write-briefing.
- Surface 3 write_drafts by state=active or in_progress.
- Cross-reference active wikis (learn_wikis) and suggest synthesis opportunities in notes.
- Per-pick notes: current word count, last edit, what's next paragraph.`,
  },
  earn: {
    reservoir_tables: [],
    surface_target: 3,
    prompt: `Replicates earn-briefing.
- Surface the top 3 Earn project todos by priority + recency.
- Notes per pick: invoice / contract status, next billing action.`,
  },
  admin: {
    reservoir_tables: [],
    surface_target: 4,
    prompt: `Replicates admin-briefing.
- Surface admin backlog + any P0 health/wealth/outings items merged into admin.
- Notes per pick: what's blocking, what's the quickest path to done.`,
  },
  health: {
    reservoir_tables: [],
    surface_target: 3,
    prompt: `Replicates health-briefing (weekly).
- Surface P0 (Teeth/Gum + Gut) first then P1 (Memory + Longevity).
- For buy-recommendations include Amazon search URL + brand + dose + 1-clause rationale in notes.`,
  },
  wealth: {
    reservoir_tables: [],
    surface_target: 3,
    prompt: `Replicates wealth-briefing (weekly).
- Surface tax-deadline countdown items first.
- Things 3 priorities for next 14 days (via metadata.things_uuid if present, render as things:///show?id=<UUID> deep link).
- Waiting items >2 weeks flagged in notes.`,
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json();
    const areaSlug: string = body.area ?? body.area_slug;
    if (!areaSlug || !AREAS[areaSlug]) {
      return json({ error: `unknown area: ${areaSlug}` }, 400);
    }
    const cfg = AREAS[areaSlug];
    const isNetwork = areaSlug === "network";
    const source: "scheduled" | "manual" | "auto" =
      body.source === "manual"
        ? "manual"
        : body.source === "auto"
          ? "auto"
          : "scheduled";

    // Count gate for network: skip expensive picker when 5-x-4 is already
    // at floor. Manual refresh bypasses (Halim explicitly asked for it).
    if (isNetwork && source !== "manual") {
      const skipped = await maybeSkipNetwork(source);
      if (skipped) return json(skipped);
    }

    const result = await runPicker({
      function_name: isNetwork ? "area_picker_network" : `pick_${areaSlug}`,
      area_slug: areaSlug,
      reservoir_tables: cfg.reservoir_tables,
      prompt: cfg.prompt,
      surface_target: cfg.surface_target,
    });

    // Network branch: extend the picker_run with full briefing shape.
    if (
      isNetwork &&
      result.ok &&
      "pickerRunId" in result &&
      result.pickerRunId
    ) {
      try {
        const emailVoice = await loadEmailVoice(result.userId!);
        const briefing = await runNetworkRoutine({
          supabaseUrl: SUPABASE_URL,
          serviceRoleKey: SERVICE_ROLE_KEY,
          anthropicApiKey: ANTHROPIC_API_KEY,
          areaId: result.areaId!,
          userId: result.userId!,
          pickerRunId: result.pickerRunId,
          source: source === "auto" ? "scheduled" : source,
          sonnetPicks: result.pickedTodos ?? [],
          emailVoice,
        });
        return json({ ...result, briefing });
      } catch (e) {
        console.error("network_routine post-step failed", e);
        return json({ ...result, network_routine_error: String(e) });
      }
    }

    return json(result);
  } catch (e) {
    console.error("area_picker failed", e);
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

/**
 * Count gate: if the 5-x-4 project already has >= 5 open todos, return a
 * lightweight "topped up" payload and skip the expensive picker run.
 * The previous briefing on picker_runs.summary stays current; the UI
 * keeps rendering it via the realtime subscription on its own.
 */
async function maybeSkipNetwork(
  source: "scheduled" | "auto" | "manual",
): Promise<Record<string, unknown> | null> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    db: { schema: "hmart" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: proj } = await admin
    .from("projects")
    .select("id, user_id")
    .eq("slug", "5-x-4")
    .limit(1)
    .maybeSingle();
  if (!proj) return null;
  const { count } = await admin
    .from("todos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", (proj as any).user_id)
    .eq("project_id", (proj as any).id)
    .in("state", ["inbox", "today", "anytime", "upcoming", "someday"]);
  if ((count ?? 0) >= 5) {
    console.log(
      `[area_picker] 5-x-4 already at ${count}/5 open; skipped (source=${source}).`,
    );
    return {
      ok: true,
      skipped: true,
      reason: "5-x-4 already at floor",
      open_count: count,
      source,
    };
  }
  return null;
}

async function loadEmailVoice(userId: string): Promise<string | null> {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      db: { schema: "hmart" },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await admin
      .from("memory_entries")
      .select("body")
      .eq("user_id", userId)
      .eq("kind", "style_guide")
      .or("title.ilike.%email%,body.ilike.%email voice%")
      .limit(1)
      .maybeSingle();
    return (data as any)?.body ?? null;
  } catch (e) {
    console.warn("loadEmailVoice failed", e);
    return null;
  }
}
