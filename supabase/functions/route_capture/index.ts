// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { callClaude, extractJson } from "../_shared/anthropic.ts";
import { buildContextBundle } from "../_shared/context.ts";

/**
 * route_capture
 *
 * Triggered either by:
 *   (a) HTTP POST {capture_id} from the web/mobile client after writing to
 *       captures table, or
 *   (b) Supabase database webhook on captures INSERT (configured outside Git).
 *
 * Reads the capture, asks Sonnet to classify + decide what prep work it can
 * do right now, creates the routed todo with the prep work embedded in notes,
 * and marks the capture routed (or needs_review if confidence < 0.7).
 *
 * Future work (US-013 stretch): wire Drive, Gmail, web fetch tool calls so
 * Sonnet ACTUALLY executes prep work, not just describes it. For v1 we let
 * Sonnet propose and embed; tool calls land in a follow-up patch.
 */

type RouteDecision = {
  intent: "for-user" | "for-claude" | "needs-review";
  area_slug: string | null;
  project_slug: string | null;
  title: string;
  priority: "P0" | "P1" | "P2" | null;
  deadline: string | null;
  tags: string[];
  state: "today" | "anytime" | "inbox" | "someday";
  notes: string;
  confidence: number;
  reasoning: string;
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
    // Accept either {capture_id} or full webhook payload {record: {id, ...}}
    const captureId: string | undefined = body.capture_id ?? body.record?.id;
    if (!captureId) {
      return json({ error: "capture_id required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      db: { schema: "hmart" },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: capture, error: capErr } = await admin
      .from("captures")
      .select("*")
      .eq("id", captureId)
      .single();
    if (capErr || !capture) {
      return json({ error: `capture not found: ${capErr?.message}` }, 404);
    }
    if (capture.state === "routed") {
      return json({ ok: true, already_routed: true });
    }

    // Mark routing so the UI shows "Claude is thinking..."
    await admin
      .from("captures")
      .update({ state: "routing" } as never)
      .eq("id", captureId);

    const userId = capture.user_id as string;
    const contextBundle = await buildContextBundle(
      SUPABASE_URL,
      SERVICE_ROLE_KEY,
      userId,
    );

    const system = [
      {
        type: "text" as const,
        text: SYSTEM_PROMPT,
      },
      {
        type: "text" as const,
        text: contextBundle,
        cache_control: { type: "ephemeral" as const },
      },
    ];

    const decision = await classify(capture.raw_text as string, system);

    if (!decision) {
      await admin
        .from("captures")
        .update({
          state: "needs_review",
          reasoning: "router could not parse JSON",
        } as never)
        .eq("id", captureId);
      return json({ ok: false, reason: "parse_error" });
    }

    if (decision.intent === "needs-review" || decision.confidence < 0.7) {
      await admin
        .from("captures")
        .update({
          state: "needs_review",
          reasoning: decision.reasoning,
          confidence: decision.confidence,
        } as never)
        .eq("id", captureId);
      return json({ ok: true, state: "needs_review", decision });
    }

    // Resolve area/project ids
    const [{ data: area }, { data: project }] = await Promise.all([
      decision.area_slug
        ? admin
            .from("areas")
            .select("id")
            .eq("user_id", userId)
            .eq("slug", decision.area_slug)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      decision.project_slug
        ? admin
            .from("projects")
            .select("id, area_id")
            .eq("user_id", userId)
            .eq("slug", decision.project_slug)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const areaId = (project?.area_id as string | undefined) ?? area?.id ?? null;

    const notes = [`> from inbox: "${capture.raw_text}"`, "", decision.notes]
      .filter(Boolean)
      .join("\n");

    const { data: todo, error: todoErr } = await admin
      .from("todos")
      .insert({
        user_id: userId,
        area_id: areaId,
        project_id: project?.id ?? null,
        title: decision.title,
        notes,
        state: decision.state,
        priority: decision.priority,
        deadline: decision.deadline,
      } as never)
      .select()
      .single();

    if (todoErr || !todo) {
      await admin
        .from("captures")
        .update({
          state: "failed",
          reasoning: `insert failed: ${todoErr?.message}`,
        } as never)
        .eq("id", captureId);
      return json({ ok: false, error: todoErr?.message }, 500);
    }

    // Attach tags if any (create-on-miss)
    if (decision.tags?.length) {
      for (const tagName of decision.tags) {
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
        if (tag?.id) {
          await admin
            .from("todo_tags")
            .insert({ todo_id: todo.id, tag_id: tag.id } as never);
        }
      }
    }

    await admin
      .from("captures")
      .update({
        state: "routed",
        routed_to_todo_id: todo.id,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
      } as never)
      .eq("id", captureId);

    return json({ ok: true, todo_id: todo.id, decision });
  } catch (e) {
    console.error("route_capture failed", e);
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

const SYSTEM_PROMPT = `You are the inbox router for Hmart Kanban, a personal task system that mirrors Things 3 augmented with Claude.

You will receive ONE captured line from a user. Your job:
1. Decide which Area > Project it belongs in (use the catalog provided).
2. Decide what kind of work it is and what should land in the todo NOTES to make the next human step as cheap as possible.
3. Decide priority, state, deadline if obvious from the line.
4. Suggest a small set of tags (lowercase, hyphenated).
5. Return STRICT JSON only - no prose, no fences.

Schema:
{
  "intent": "for-user" | "for-claude" | "needs-review",
  "area_slug": string | null,
  "project_slug": string | null,
  "title": string (cleaned, imperative, short),
  "priority": "P0" | "P1" | "P2" | null,
  "deadline": "YYYY-MM-DD" | null,
  "tags": string[],
  "state": "today" | "anytime" | "inbox" | "someday",
  "notes": string (concise: what's the prep work / context / draft),
  "confidence": number 0..1,
  "reasoning": string (one sentence)
}

Rules:
- Never invent area_slug / project_slug; if you cannot match with high confidence, return intent="needs-review" and put best guess in reasoning.
- If the line is ambiguous, confidence < 0.7 -> needs-review.
- If the line says "today", "tomorrow", a specific date - parse it into deadline.
- For Share-area items, draft the first-pass caption in notes per the style guide.
- For Network/contact items, draft the opening sentence of an email in notes.
- For Apply items, surface the deadline if known.
- For Learn items, suggest 1-2 tags from the existing taxonomy if any match.
- For ambiguous "buy X" - admin area, status anytime.
- Em-dashes are banned in user-facing output. Use a hyphen with spaces.

The user is a poet/artist/maker. Voice is warm, precise, lowercase.`;

async function classify(
  raw: string,
  system: any[],
): Promise<RouteDecision | null> {
  const { text } = await callClaude({
    apiKey: ANTHROPIC_API_KEY,
    system,
    maxTokens: 1024,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: `Capture line:\n"""${raw}"""\n\nReturn the JSON now.`,
      },
    ],
  });
  return extractJson<RouteDecision>(text);
}
