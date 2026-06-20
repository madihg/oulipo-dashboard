// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { callClaude, extractJson } from "../_shared/anthropic.ts";
import { buildContextBundle } from "../_shared/context.ts";

/**
 * enrich_todo
 *
 * Fire-and-forget enrichment of a freshly-created todo. Reads the todo, asks
 * Sonnet for a short "suggested" notes block (and an optional deadline, only
 * when very confident) using the user's context (areas/projects/memory + recent
 * todos in the area), and writes it back APPEND-ONLY.
 *
 * Safety contract:
 *  - never edits title/priority (priority is only ever a stashed hint)
 *  - never clobbers user-typed notes (append only when notes are empty)
 *  - idempotent: metadata.enriched guards against double-runs
 *  - if anything fails, the todo is left exactly as the user typed it
 */

type EnrichResult = {
  suggested_notes: string;
  deadline: string | null;
  priority: "P0" | "P1" | "P2" | null;
  confidence: number;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json();
    const todoId: string | undefined = body.todo_id ?? body.record?.id;
    if (!todoId) return json({ error: "todo_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      db: { schema: "hmart" },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: todo, error: tErr } = await admin
      .from("todos")
      .select("*")
      .eq("id", todoId)
      .single();
    if (tErr || !todo) {
      return json({ error: `todo not found: ${tErr?.message}` }, 404);
    }

    const meta = ((todo.metadata as any) ?? {}) as Record<string, unknown>;
    if (meta.enriched === true) {
      return json({ ok: true, skipped: "already_enriched" });
    }

    const userId = todo.user_id as string;

    // Resolve area / project for scoping + the prompt.
    const [{ data: area }, { data: project }] = await Promise.all([
      todo.area_id
        ? admin
            .from("areas")
            .select("slug,name")
            .eq("id", todo.area_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      todo.project_id
        ? admin
            .from("projects")
            .select("slug,name")
            .eq("id", todo.project_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const areaSlug = (area as any)?.slug as string | undefined;

    // Recent open todos in the same area = pattern context (deadlines, naming).
    let recentLines = "";
    if (todo.area_id) {
      const { data: recent } = await admin
        .from("todos")
        .select("title,priority,deadline")
        .eq("area_id", todo.area_id)
        .neq("state", "completed")
        .neq("id", todoId)
        .order("created_at", { ascending: false })
        .limit(20);
      recentLines = (recent ?? [])
        .map(
          (r: any) =>
            `- ${r.title}${r.priority ? ` [${r.priority}]` : ""}${r.deadline ? ` (due ${r.deadline})` : ""}`,
        )
        .join("\n");
    }

    const contextBundle = await buildContextBundle(
      SUPABASE_URL,
      SERVICE_ROLE_KEY,
      userId,
      areaSlug,
    );
    const today = new Date().toISOString().slice(0, 10);

    const system = [
      { type: "text" as const, text: SYSTEM_PROMPT },
      {
        type: "text" as const,
        text: contextBundle,
        cache_control: { type: "ephemeral" as const },
      },
    ];

    const userMsg =
      `Today is ${today}.\n` +
      `New task title: """${todo.title}"""\n` +
      (area
        ? `Area: ${(area as any).slug} (${(area as any).name})\n`
        : "Area: (unfiled)\n") +
      (project ? `Project: ${(project as any).slug}\n` : "") +
      (recentLines
        ? `\nRecent open todos in this area:\n${recentLines}\n`
        : "") +
      `\nReturn the JSON now.`;

    const { text } = await callClaude({
      apiKey: ANTHROPIC_API_KEY,
      system,
      maxTokens: 700,
      temperature: 0,
      messages: [{ role: "user", content: userMsg }],
    });
    const result = extractJson<EnrichResult>(text);
    if (!result) return json({ ok: false, reason: "parse_error" });

    // Re-read right before writing - the user may have typed in the meantime.
    const { data: fresh } = await admin
      .from("todos")
      .select("notes,metadata,deadline")
      .eq("id", todoId)
      .single();
    const freshMeta = ((fresh?.metadata as any) ?? {}) as Record<
      string,
      unknown
    >;
    if (freshMeta.enriched === true) {
      return json({ ok: true, skipped: "already_enriched" });
    }
    const freshNotes = (fresh?.notes ?? "").trim();
    const block = (result.suggested_notes ?? "").trim();
    const goodConfidence = (result.confidence ?? 0) > 0.7;

    const patch: Record<string, unknown> = {
      metadata: {
        ...freshMeta,
        enriched: true,
        enriched_at: new Date().toISOString(),
        enrichment_confidence: result.confidence ?? 0,
        enrichment_model: "claude-sonnet-4-5-20250929",
      },
    };

    if (freshNotes === "" && block && goodConfidence) {
      // Notes empty -> safe to append the suggestion (clearly labelled).
      patch.notes = `## suggested (claude)\n${block}`;
    } else if (block) {
      // User already has notes (or low confidence): stash for a future UI
      // affordance; never touch the user's text.
      (patch.metadata as any).suggestions_pending = result;
    }

    // Deadline: only when very confident AND the user hasn't set one.
    if (
      result.deadline &&
      /^\d{4}-\d{2}-\d{2}$/.test(result.deadline) &&
      (result.confidence ?? 0) > 0.85 &&
      !fresh?.deadline
    ) {
      patch.deadline = result.deadline;
    }

    await admin
      .from("todos")
      .update(patch as never)
      .eq("id", todoId);

    return json({
      ok: true,
      enriched: true,
      confidence: result.confidence ?? 0,
      deadline: (patch.deadline as string) ?? null,
      appended: patch.notes !== undefined,
    });
  } catch (e) {
    console.error("enrich_todo failed", e);
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

const SYSTEM_PROMPT = `You enrich a freshly-captured todo in Hmart Kanban, a personal task system (Things 3 model) for a poet / artist / maker. You are given one task title plus the user's context (areas, projects, memory rules/style, recent todos in the area).

Your job - be genuinely useful, never noisy:
1. Draft a SHORT suggested notes block (2-5 lines): the concrete next step, prep work, or context that makes acting on this task cheaper. For an outreach/network task, draft the opening sentence. For an apply task, note the deadline / what's needed. For a buy/admin task, keep it to a crisp next action.
2. Infer ONE deadline (YYYY-MM-DD) ONLY if the title clearly implies timing (e.g. "by friday", "end of august"). Otherwise null. Anchor relative dates to the provided "Today".
3. Optionally hint a priority (P0/P1/P2) if the title clearly signals urgency; else null.
4. Give a confidence 0..1 on how useful these suggestions are.

Return STRICT JSON only - no prose, no fences:
{
  "suggested_notes": string,
  "deadline": "YYYY-MM-DD" | null,
  "priority": "P0" | "P1" | "P2" | null,
  "confidence": number
}

Rules:
- You only SUGGEST. Never restate the title. Never write filler.
- Voice: warm, precise, lowercase.
- Em-dashes are banned. Use a hyphen with spaces.
- If the title is too vague to add real value, set confidence < 0.7 and keep suggested_notes short or empty.`;
