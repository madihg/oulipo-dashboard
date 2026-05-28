// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  callClaude,
  extractJson,
  makeSearchMemoryHandler,
  SEARCH_MEMORY_TOOL,
  type TextBlock,
} from "./anthropic.ts";
import { buildContextBundle } from "./context.ts";

/**
 * Shared picker runtime for the 10 per-area Edge Functions (US-015).
 *
 * Each area picker calls runPicker() with its own area slug, what reservoir
 * tables to surface from, and a per-area prompt fragment that encodes the
 * scoring rules from `specs/pickers-source-spec.md`.
 *
 * Sonnet returns a JSON plan: surface N reservoir items as new todos
 * (with drafted notes attached when appropriate). The runtime applies the
 * plan: creates the todos, writes the picker_run record, returns a summary.
 */

export type ReservoirTable =
  | "network_contacts"
  | "apply_opportunities"
  | "learn_items"
  | "learn_wikis"
  | "make_pieces"
  | "write_drafts"
  | "outings_events"
  | "share_items";

export type PickerOpts = {
  function_name: string;
  area_slug: string;
  user_id?: string; // run per user; for a single-user system this is the resolved auth.uid
  reservoir_tables?: ReservoirTable[];
  prompt: string; // per-area prompt fragment
  surface_target?: number; // default 3-5
};

export type SonnetPlan = {
  picks: Array<{
    title: string;
    project_slug?: string;
    priority?: "P0" | "P1" | "P2" | null;
    deadline?: string | null;
    notes: string; // drafted body with the prep work
    source_table?: ReservoirTable | null;
    source_id?: string | null;
    tags?: string[];
  }>;
  summary: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

export async function runPicker(opts: PickerOpts) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    db: { schema: "hmart" },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve user. For single-user system, pick the first auth.user that has rows in the area.
  let userId = opts.user_id;
  if (!userId) {
    const { data: any_area } = await admin
      .from("areas")
      .select("user_id")
      .eq("slug", opts.area_slug)
      .limit(1)
      .maybeSingle();
    userId = (any_area as any)?.user_id;
  }
  if (!userId) {
    return { ok: false, error: `no user found for area ${opts.area_slug}` };
  }

  const startedAt = new Date().toISOString();

  const { data: area } = await admin
    .from("areas")
    .select("id, name, slug")
    .eq("user_id", userId)
    .eq("slug", opts.area_slug)
    .maybeSingle();
  if (!area) return { ok: false, error: `area ${opts.area_slug} not found` };

  // Pull projects in this area + active todos
  const [projectsRes, todosRes] = await Promise.all([
    admin
      .from("projects")
      .select("id,slug,name,deadline,cadence,cadence_target")
      .eq("user_id", userId)
      .eq("area_id", (area as any).id),
    admin
      .from("todos")
      .select("id,title,priority,deadline,state,project_id")
      .eq("user_id", userId)
      .eq("area_id", (area as any).id)
      .neq("state", "completed")
      .limit(200),
  ]);

  // Pull reservoir rows if specified
  const reservoirData: Record<string, any[]> = {};
  for (const table of opts.reservoir_tables ?? []) {
    const { data } = await admin
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .limit(50);
    reservoirData[table] = data ?? [];
  }

  // Scope the bundle to this area + global (cuts ~45KB to ~10-15KB)
  const contextBundle = await buildContextBundle(
    SUPABASE_URL,
    SERVICE_ROLE_KEY,
    userId,
    opts.area_slug,
  );

  const system: TextBlock[] = [
    {
      type: "text",
      text: `You are the per-area picker for the "${(area as any).name}" area of Hmart Kanban.

Your job: read this area's projects, current open todos, and reservoir items (evergreen lists). Pick the SMALL set of items that should be surfaced as todos for the next ~24 hours. For each pick, DRAFT the prep work inline in notes so the next human step is as cheap as possible.

Rules:
- ${opts.prompt}
- Return ONLY strict JSON matching the schema. No prose. No fences.
- Surface ${opts.surface_target ?? "3-5"} items total.
- Never invent project_slug. Use one from the catalog or leave null.
- Em-dashes banned. Use hyphens with spaces.
- Voice: warm, precise, lowercase.

You have a tool: search_memory(query, scope?, kinds?, limit?). Call it to look up
specific rules, style guides, or references you don't see in your bundled
context. Examples: query "outreach voice" with scope ["global","area:network"]
to pull the email style guide before drafting; query "tier cadence" to confirm
maintenance frequency. Use it once or twice if your first-pass picks reference
something you want to validate.

Schema:
{
  "picks": [
    {
      "title": string (clean, imperative),
      "project_slug": string | null,
      "priority": "P0" | "P1" | "P2" | null,
      "deadline": "YYYY-MM-DD" | null,
      "notes": string (the drafted prep work / context / first-pass artifact),
      "source_table": "${(opts.reservoir_tables ?? []).join(" | ")}" | null,
      "source_id": string | null,
      "tags": string[]
    }
  ],
  "summary": string (one sentence on why these were surfaced today)
}`,
    },
    {
      type: "text",
      text: contextBundle,
      cache_control: { type: "ephemeral" },
    },
  ];

  const userMsg = [
    `# Area: ${(area as any).name}`,
    "",
    "## Projects",
    ...(projectsRes.data ?? []).map(
      (p: any) =>
        `- ${p.slug}: ${p.name}${p.deadline ? ` (deadline ${p.deadline})` : ""}${p.cadence ? ` (cadence ${p.cadence_target ?? 1}/${p.cadence})` : ""}`,
    ),
    "",
    "## Open todos in this area",
    ...(todosRes.data ?? []).map(
      (t: any) =>
        `- [${t.priority ?? "  "}] ${t.title}${t.deadline ? ` (due ${t.deadline})` : ""}`,
    ),
    "",
    ...Object.entries(reservoirData).flatMap(([table, rows]) => [
      `## Reservoir: ${table} (${rows.length})`,
      ...rows.map((r) => `- ${r.id}: ${JSON.stringify(r).slice(0, 240)}`),
      "",
    ]),
    "Return the JSON plan now.",
  ].join("\n");

  const { text, usage, toolsUsed } = await callClaude({
    apiKey: ANTHROPIC_API_KEY,
    system,
    maxTokens: 4096,
    temperature: 0.3,
    messages: [{ role: "user", content: userMsg }],
    tools: [SEARCH_MEMORY_TOOL],
    toolHandlers: {
      search_memory: makeSearchMemoryHandler(
        SUPABASE_URL,
        SERVICE_ROLE_KEY,
        userId,
      ),
    },
    maxToolIterations: 3,
  });

  const plan = extractJson<SonnetPlan>(text);
  if (!plan) {
    await admin.from("picker_runs").insert({
      area_id: (area as any).id,
      function_name: opts.function_name,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      ok: false,
      summary: { error: "parse_error", raw_preview: text.slice(0, 400) },
    } as never);
    return { ok: false, error: "parse_error" };
  }

  // Apply: create todos
  const created: string[] = [];
  const pickedTodos: Array<{
    todo_id: string;
    title: string;
    notes: string;
    priority: "P0" | "P1" | "P2" | null;
    source_id: string | null;
  }> = [];
  for (const pick of plan.picks) {
    let projectId: string | null = null;
    if (pick.project_slug) {
      const { data: p } = await admin
        .from("projects")
        .select("id")
        .eq("user_id", userId)
        .eq("slug", pick.project_slug)
        .maybeSingle();
      projectId = (p as any)?.id ?? null;
      if (!projectId) {
        console.warn(
          `[picker:${opts.function_name}] project_slug "${pick.project_slug}" not found for user ${userId}; todo will be orphan (project_id=null). Pick title: "${pick.title}". Seed the project to fix.`,
        );
      }
    }
    const { data: todo } = await admin
      .from("todos")
      .insert({
        user_id: userId,
        area_id: (area as any).id,
        project_id: projectId,
        title: pick.title,
        notes: pick.notes,
        priority: pick.priority ?? null,
        deadline: pick.deadline ?? null,
        state: "anytime",
        metadata: {
          surfaced_by: opts.function_name,
          surfaced_at: startedAt,
        },
      } as never)
      .select()
      .single();
    if (todo) {
      created.push((todo as any).id);
      pickedTodos.push({
        todo_id: (todo as any).id,
        title: pick.title,
        notes: pick.notes,
        priority: (pick.priority ?? null) as "P0" | "P1" | "P2" | null,
        source_id: pick.source_id ?? null,
      });
      // Surfaced-from link if available
      if (pick.source_table && pick.source_id) {
        await admin.from("surfaced_from").insert({
          todo_id: (todo as any).id,
          source_table: pick.source_table,
          source_id: pick.source_id,
          surfaced_by: opts.function_name,
        } as never);
      }
      // Tags
      for (const tagName of pick.tags ?? []) {
        const clean = tagName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
        if (!clean) continue;
        let { data: tag } = await admin
          .from("tags")
          .select("id")
          .eq("user_id", userId)
          .eq("name", clean)
          .maybeSingle();
        if (!tag) {
          const ins = await admin
            .from("tags")
            .insert({ user_id: userId, name: clean } as never)
            .select("id")
            .single();
          tag = ins.data as any;
        }
        if ((tag as any)?.id) {
          await admin.from("todo_tags").insert({
            todo_id: (todo as any).id,
            tag_id: (tag as any).id,
          } as never);
        }
      }
    }
  }

  const { data: runRow } = await admin
    .from("picker_runs")
    .insert({
      area_id: (area as any).id,
      function_name: opts.function_name,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      ok: true,
      summary: {
        summary_text: plan.summary,
        picks_count: plan.picks.length,
        created_ids: created,
        tools_used: toolsUsed,
        usage,
      },
    } as never)
    .select("id")
    .single();

  return {
    ok: true,
    plan,
    created,
    pickedTodos,
    pickerRunId: (runRow as any)?.id ?? null,
    userId,
    areaId: (area as any).id,
    tools_used: toolsUsed,
    usage,
  };
}
