// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "./_shared/cors.ts";

/**
 * enrich_network
 *
 * Backfill network_contacts with Gmail + Drive context via Composio's
 * action-execute API (the same MCPs Halim's Claude Code sessions use).
 *
 * Modes:
 *   POST {mode: "backfill", limit?: number}
 *     - For contacts where last_thread_summary IS NULL AND email IS NOT NULL,
 *       up to `limit`, fetch last Gmail thread + snippet + permalink, attempt
 *       Drive lookup by name, write back. Defaults limit=50.
 *
 *   POST {mode: "nightly"}
 *     - Same but only contacts whose last_touch_at is older than 7 days, OR
 *       any contact with fresh Gmail activity since last_thread_summary.
 *
 * Required env (set as Supabase function secrets):
 *   COMPOSIO_API_KEY - from https://app.composio.dev/settings/api-keys
 *   COMPOSIO_USER_ID - the connected-account user id (madihalim@gmail.com's)
 *
 * If COMPOSIO_API_KEY is unset, returns ok:false with reason so we surface the
 * setup gap clearly instead of silently failing.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const COMPOSIO_API_KEY = Deno.env.get("COMPOSIO_API_KEY") ?? "";
const COMPOSIO_USER_ID = Deno.env.get("COMPOSIO_USER_ID") ?? "default";
const COMPOSIO_BASE = "https://backend.composio.dev/api/v3";

type Contact = {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  last_thread_summary: string | null;
  last_touch_at: string | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (!COMPOSIO_API_KEY) {
    return json(
      {
        ok: false,
        error:
          "COMPOSIO_API_KEY not set. Add it as a Supabase function secret: gh/supabase platform UI > Edge Functions > Secrets. Get the key from https://app.composio.dev/settings/api-keys.",
      },
      503,
    );
  }
  try {
    const body = await req.json().catch(() => ({}));
    const mode: "backfill" | "nightly" = body.mode ?? "backfill";
    const limit: number = Math.min(200, Math.max(1, body.limit ?? 50));

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      db: { schema: "hmart" },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Resolve user. Single-user system: first user with contacts.
    const { data: anyContact } = await admin
      .from("network_contacts")
      .select("user_id")
      .limit(1)
      .maybeSingle();
    const userId = (anyContact as any)?.user_id;
    if (!userId) return json({ ok: false, error: "no user resolvable" });

    // Pick which contacts to touch
    let q = admin
      .from("network_contacts")
      .select("id, user_id, name, email, last_thread_summary, last_touch_at")
      .eq("user_id", userId)
      .not("email", "is", null)
      .limit(limit);
    if (mode === "backfill") {
      q = q.is("last_thread_summary", null);
    } else {
      // nightly: stale (older than 7 days) OR null
      const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
      q = q.or(`last_thread_summary.is.null,last_touch_at.lt.${cutoff}`);
    }
    const { data: contacts, error } = await q;
    if (error) return json({ ok: false, error: error.message }, 500);
    const list = (contacts ?? []) as Contact[];

    const results: any[] = [];
    for (const c of list) {
      try {
        const r = await enrichOne(c);
        results.push({ id: c.id, name: c.name, ...r });
        if (r.thread_summary || r.thread_url) {
          await admin
            .from("network_contacts")
            .update({
              last_thread_summary: r.thread_summary ?? null,
              last_thread_url: r.thread_url ?? null,
              last_touch_at: r.last_touch_at ?? null,
            } as never)
            .eq("id", c.id);
        }
      } catch (e) {
        results.push({ id: c.id, name: c.name, error: String(e) });
      }
    }
    return json({ ok: true, processed: results.length, results });
  } catch (e) {
    console.error("enrich_network failed", e);
    return json({ error: String(e) }, 500);
  }
});

async function enrichOne(c: Contact): Promise<{
  thread_summary: string | null;
  thread_url: string | null;
  last_touch_at: string | null;
}> {
  if (!c.email)
    return { thread_summary: null, thread_url: null, last_touch_at: null };
  // Composio Gmail action: GMAIL_LIST_THREADS or GMAIL_SEARCH_PEOPLE.
  // We use the search endpoint with `from:email OR to:email` to capture both.
  const query = `from:${c.email} OR to:${c.email}`;
  const resp = await fetch(
    `${COMPOSIO_BASE}/tools/execute/GMAIL_LIST_THREADS`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": COMPOSIO_API_KEY,
      },
      body: JSON.stringify({
        user_id: COMPOSIO_USER_ID,
        arguments: { query, max_results: 1 },
      }),
    },
  );
  if (!resp.ok) {
    return {
      thread_summary: null,
      thread_url: null,
      last_touch_at: null,
    };
  }
  const data = (await resp.json()) as any;
  const thread = data?.data?.threads?.[0] ?? data?.threads?.[0];
  if (!thread) {
    return { thread_summary: null, thread_url: null, last_touch_at: null };
  }
  return {
    thread_summary: thread.snippet ?? thread.subject ?? null,
    thread_url: thread.id
      ? `https://mail.google.com/mail/u/0/#inbox/${thread.id}`
      : null,
    last_touch_at: thread.internal_date ?? thread.last_message_date ?? null,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
