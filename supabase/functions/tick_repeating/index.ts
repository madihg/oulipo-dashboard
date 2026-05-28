// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * tick_repeating
 *
 * Runs hourly via Supabase cron. For each repeating_rules row where
 * next_fire_at <= now(), creates the next instance of the parent todo
 * (a fresh row, state=anytime, completed_at=null), advances next_fire_at,
 * and writes last_fired_at.
 *
 * Rule shapes accepted in repeating_rules.rule jsonb:
 *   { type: "every", interval: "day"|"week"|"month", count: N, on?: ["mon",...] }
 *   { type: "after_completion", delay_days: N }
 *
 * Also handles "fire now on completion" for after_completion rules: the trigger
 * `on_todo_completed` in 0001_hmart_init.sql sets next_fire_at = now() when the
 * parent is marked completed, so this function picks it up on the next tick.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    db: { schema: "hmart" },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date();
  const nowIso = now.toISOString();

  const { data: due, error } = await admin
    .from("repeating_rules")
    .select("*, todo:todos(*)")
    .lte("next_fire_at", nowIso);
  if (error) {
    return json({ ok: false, error: error.message }, 500);
  }

  const results: any[] = [];
  for (const r of (due ?? []) as any[]) {
    const todo = r.todo;
    if (!todo) continue;
    try {
      // Clone the parent into a fresh instance
      const {
        id: _omit,
        completed_at: _omit2,
        position: _omit3,
        created_at: _omit4,
        ...rest
      } = todo;
      const next = {
        ...rest,
        state: "anytime",
        completed_at: null,
      };
      const { data: created, error: insErr } = await admin
        .from("todos")
        .insert(next as never)
        .select()
        .single();
      if (insErr) throw insErr;

      const newNextFire = computeNextFire(r.rule, now);
      const { error: updErr } = await admin
        .from("repeating_rules")
        .update({
          last_fired_at: nowIso,
          next_fire_at: newNextFire ? newNextFire.toISOString() : null,
        } as never)
        .eq("id", r.id);
      if (updErr) throw updErr;

      results.push({ rule_id: r.id, created_id: created?.id });
    } catch (e) {
      results.push({ rule_id: r.id, error: String(e) });
    }
  }
  return json({ ok: true, fired: results.length, results });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function computeNextFire(rule: any, from: Date): Date | null {
  if (!rule || typeof rule !== "object") return null;
  if (rule.type === "every") {
    const n = Math.max(1, Number(rule.count ?? 1));
    const next = new Date(from);
    switch (rule.interval) {
      case "day":
        next.setUTCDate(next.getUTCDate() + n);
        break;
      case "week":
        next.setUTCDate(next.getUTCDate() + 7 * n);
        break;
      case "month":
        next.setUTCMonth(next.getUTCMonth() + n);
        break;
      case "year":
        next.setUTCFullYear(next.getUTCFullYear() + n);
        break;
      default:
        return null;
    }
    return next;
  }
  if (rule.type === "after_completion") {
    // Don't schedule a next fire until the new instance is itself completed;
    // the on_todo_completed trigger sets next_fire_at again then.
    return null;
  }
  return null;
}
