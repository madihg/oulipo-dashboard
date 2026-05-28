// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "./_shared/cors.ts";

/**
 * search_memory - Anthropic-tool-shaped Edge Function.
 *
 * The picker/router calls this mid-thinking when they need a specific rule
 * or style guide that isn't in their bundled context. Returns the top N
 * matches by simple ILIKE relevance (v1; pgvector semantic search is a
 * clean follow-up when the corpus grows).
 *
 * Input schema (Anthropic-tool style):
 *   {
 *     "query": string (required),
 *     "scope": string[] (optional, e.g. ["global","area:network"]),
 *     "kinds": ("user_rule"|"project_rule"|"feedback"|"reference"|"style_guide")[] (optional),
 *     "limit": number (default 5)
 *   }
 *
 * Output:
 *   { "results": [{ kind, scope, title, snippet, source_file }] }
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json();
    const query: string = body.query ?? "";
    if (!query.trim()) return json({ error: "query required" }, 400);
    const scope: string[] | undefined = body.scope;
    const kinds: string[] | undefined = body.kinds;
    const limit: number = Math.min(20, Math.max(1, body.limit ?? 5));
    // user_id is optional - for single-user system, accept it or default to first user with memory_entries
    let userId: string | undefined = body.user_id;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      db: { schema: "hmart" },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (!userId) {
      const { data } = await admin
        .from("memory_entries")
        .select("user_id")
        .limit(1)
        .maybeSingle();
      userId = (data as any)?.user_id;
    }
    if (!userId) return json({ error: "no user_id resolvable" }, 400);

    const safe = query.replace(/[%_]/g, "\\$&");
    let q = admin
      .from("memory_entries")
      .select("kind, scope, title, body, source_file")
      .eq("user_id", userId)
      .or(`title.ilike.%${safe}%,body.ilike.%${safe}%`)
      .limit(limit * 3); // overfetch, then post-filter + rank
    if (scope?.length) q = q.in("scope", scope);
    if (kinds?.length) q = q.in("kind", kinds);
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const lower = query.toLowerCase();
    const ranked = (data ?? [])
      .map((r: any) => ({
        ...r,
        score:
          (r.title.toLowerCase().includes(lower) ? 3 : 0) +
          (r.body.toLowerCase().includes(lower) ? 1 : 0) +
          (r.body.length > 0 ? 0.001 / Math.log10(r.body.length + 10) : 0),
      }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, limit)
      .map((r: any) => ({
        kind: r.kind,
        scope: r.scope,
        title: r.title,
        snippet: snippetAround(r.body, lower, 400),
        source_file: r.source_file,
      }));

    return json({ results: ranked });
  } catch (e) {
    console.error("search_memory failed", e);
    return json({ error: String(e) }, 500);
  }
});

function snippetAround(body: string, lowerQuery: string, len: number): string {
  if (!body) return "";
  const idx = body.toLowerCase().indexOf(lowerQuery);
  if (idx < 0) return body.slice(0, len);
  const start = Math.max(0, idx - Math.floor(len / 3));
  const end = Math.min(body.length, start + len);
  const prefix = start > 0 ? "… " : "";
  const suffix = end < body.length ? " …" : "";
  return prefix + body.slice(start, end) + suffix;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
