#!/usr/bin/env tsx
/**
 * cleanup-admin.ts - fix the admin area-level stray todos.
 *
 * The collapse migration skipped 91 loose todos that live directly under admin
 * (area_id=admin, project_id=null, no metadata.collapsed_from). They are
 * health/wealth content that duplicates checklists already collapsed into other
 * areas' tasks. This classifies each stray against the full checklist inventory:
 *   delete -> semantic duplicate of an existing checklist item
 *   move   -> unique action belonging to another area (re-parent area_id)
 *   keep   -> genuinely admin
 *
 * Safety: JSON backup before any write. --dry-run prints, --apply writes.
 *
 *   SBP_TOKEN=sbp_... ANTHROPIC_API_KEY=sk-... tsx migration/cleanup-admin.ts --dry-run
 *   SBP_TOKEN=sbp_... ANTHROPIC_API_KEY=sk-... tsx migration/cleanup-admin.ts --apply
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const PROJECT_REF = "smytgqkgomsfyurskpcl";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const MGMT_TOKEN = process.env.SUPABASE_MGMT_TOKEN ?? process.env.SBP_TOKEN;
const APPLY =
  process.argv.includes("--apply") && !process.argv.includes("--dry-run");
const MODEL = "claude-sonnet-4-6";

type Stray = {
  id: string;
  title: string;
  notes: string | null;
  priority: string | null;
  state: string;
  deadline: string | null;
};
type Classification = {
  id: string;
  action: "delete" | "move" | "keep";
  target_area: string | null;
  duplicate_of: string | null;
  reason: string;
};

async function mgmtQuery(sql: string): Promise<any[]> {
  const resp = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MGMT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!resp.ok)
    throw new Error(`mgmt query failed: ${resp.status} ${await resp.text()}`);
  return (await resp.json()) as any[];
}

async function getServiceRole(): Promise<string> {
  const resp = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys`,
    { headers: { Authorization: `Bearer ${MGMT_TOKEN}` } },
  );
  const keys = (await resp.json()) as any[];
  const sr = keys.find((k) => k.name === "service_role")?.api_key;
  if (!sr) throw new Error("could not resolve service_role key");
  return sr;
}

function extractJsonArray<T>(text: string): T[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T[];
  } catch {
    return null;
  }
}

async function main() {
  if (!MGMT_TOKEN) throw new Error("SBP_TOKEN / SUPABASE_MGMT_TOKEN required");
  if (!process.env.ANTHROPIC_API_KEY)
    throw new Error("ANTHROPIC_API_KEY required");

  // 1. Pull admin strays.
  const strays = (await mgmtQuery(
    `select t.id, t.title, t.notes, t.priority, t.state, t.deadline
     from hmart.todos t join hmart.areas a on a.id=t.area_id
     where a.slug='admin' and t.project_id is null
       and not (t.metadata ? 'collapsed_from')
       and t.state not in ('completed','cancelled','logbook')
     order by t.title`,
  )) as Stray[];

  // 2. Pull the checklist inventory (what already exists), grouped by area::task.
  const inventory = (await mgmtQuery(
    `select a.slug as area, t.title as task, ci.title as item
     from hmart.checklist_items ci
     join hmart.todos t on t.id=ci.todo_id
     join hmart.areas a on a.id=t.area_id
     order by a.slug, t.title`,
  )) as { area: string; task: string; item: string }[];

  // Also the area-level task titles themselves (a stray may dup a whole task).
  const tasks = (await mgmtQuery(
    `select a.slug as area, t.title as task
     from hmart.todos t join hmart.areas a on a.id=t.area_id
     where t.project_id is null and (t.metadata ? 'collapsed_from')
     order by a.slug, t.title`,
  )) as { area: string; task: string }[];

  const areas = (await mgmtQuery(`select id, slug from hmart.areas`)) as {
    id: string;
    slug: string;
  }[];
  const areaIdBySlug = new Map(areas.map((a) => [a.slug, a.id]));

  console.log(
    `admin strays: ${strays.length}, checklist items: ${inventory.length}, tasks: ${tasks.length}, mode: ${APPLY ? "APPLY" : "DRY-RUN"}`,
  );

  // Build the inventory text (cacheable context).
  const invByArea = new Map<string, string[]>();
  for (const r of inventory) {
    const k = r.area;
    if (!invByArea.has(k)) invByArea.set(k, []);
    invByArea.get(k)!.push(`${r.task} :: ${r.item}`);
  }
  for (const t of tasks) {
    const k = t.area;
    if (!invByArea.has(k)) invByArea.set(k, []);
    invByArea.get(k)!.push(`${t.task} (task)`);
  }
  const inventoryText = [...invByArea.entries()]
    .map(
      ([area, items]) => `## ${area}\n${items.map((i) => `- ${i}`).join("\n")}`,
    )
    .join("\n\n");

  const anthropic = new Anthropic();
  const SYSTEM = `You triage stray to-dos that were mis-filed under the "admin" area of a personal task manager. Each stray must be classified against the EXISTING inventory of tasks + checklist items (which already capture the real work, organized by area).

For each stray return one object:
{ "id": string,
  "action": "delete" | "move" | "keep",
  "target_area": "health" | "wealth" | "mindset" | "make" | "network" | "share" | "apply" | "learn" | "earn" | "write" | null,
  "duplicate_of": "<area :: task :: item>" | null,
  "reason": string }

Rules:
- "delete": the stray is already captured by an existing checklist item or task (same action, even if reworded). Set duplicate_of to the matching inventory line. PREFER delete when a clear match exists.
- "move": the stray is a real, unique action that clearly belongs to another area but is NOT already captured. Set target_area. (Do not set duplicate_of.)
- "keep": genuinely an admin/logistics item with no better home. Rare.
- Health = body/medical/supplements/surgery/knee/gut/brain/sleep/longevity. Wealth = taxes/s-corp/401k/HSA/insurance-financial/property-tax/invoicing.
- reason: <= 8 words. duplicate_of: just the matching item text (short).
- Return ONLY a JSON array, no prose, no fences.

EXISTING INVENTORY (by area):
${inventoryText}`;

  // Chunk to avoid output-token truncation; inventory stays cached across calls.
  const CHUNK = 25;
  const classifications: Classification[] = [];
  for (let i = 0; i < strays.length; i += CHUNK) {
    const batch = strays.slice(i, i + CHUNK);
    const userPrompt = `Classify these ${batch.length} admin strays:\n\n${batch
      .map(
        (s) =>
          `id=${s.id} | (${s.priority ?? "--"}${s.deadline ? `, due ${s.deadline}` : ""}) ${s.title}`,
      )
      .join("\n")}\n\nReturn the JSON array now.`;
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = extractJsonArray<Classification>(text);
    if (!parsed) {
      console.error(
        `could not parse batch ${i / CHUNK}. raw:\n`,
        text.slice(0, 600),
      );
      process.exit(1);
    }
    classifications.push(...parsed);
    console.log(`  classified batch ${i / CHUNK + 1} (${parsed.length})`);
  }

  const byId = new Map(classifications.map((c) => [c.id, c]));
  const counts = { delete: 0, move: 0, keep: 0, unmatched: 0 };
  const moveByArea: Record<string, number> = {};

  for (const s of strays) {
    const c = byId.get(s.id);
    if (!c) {
      counts.unmatched++;
      console.log(`UNMATCHED (kept): ${s.title}`);
      continue;
    }
    // Backstop: only delete when a duplicate is named.
    if (c.action === "delete" && !c.duplicate_of) c.action = "keep";
    counts[c.action]++;
    if (c.action === "move" && c.target_area)
      moveByArea[c.target_area] = (moveByArea[c.target_area] ?? 0) + 1;
    if (!APPLY) {
      console.log(
        `[${c.action}${c.target_area ? `->${c.target_area}` : ""}] ${s.title}${c.duplicate_of ? `  (dup: ${c.duplicate_of})` : ""}`,
      );
    }
  }

  console.log(
    `\nplan: delete ${counts.delete}, move ${counts.move} (${JSON.stringify(moveByArea)}), keep ${counts.keep}, unmatched ${counts.unmatched}`,
  );

  if (!APPLY) {
    console.log("\ndry-run only, no writes.");
    return;
  }

  // 3. Backup, then apply.
  const sr = await getServiceRole();
  const db: SupabaseClient = createClient(SUPABASE_URL, sr, {
    db: { schema: "hmart" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const outDir = join(import.meta.dirname, "output");
  mkdirSync(outDir, { recursive: true });
  const backupPath = join(outDir, `pre-admin-cleanup-${Date.now()}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify({ strays, classifications }, null, 2),
  );
  console.log(`backup written: ${backupPath} (${strays.length} strays)`);

  const toDelete: string[] = [];
  for (const s of strays) {
    const c = byId.get(s.id);
    if (!c) continue;
    if (c.action === "delete" && c.duplicate_of) {
      toDelete.push(s.id);
    } else if (c.action === "move" && c.target_area) {
      const aid = areaIdBySlug.get(c.target_area);
      if (!aid) {
        console.warn(
          `move skipped (unknown area ${c.target_area}): ${s.title}`,
        );
        continue;
      }
      const { error } = await db
        .from("todos")
        .update({ area_id: aid } as never)
        .eq("id", s.id);
      if (error) console.error(`move failed for ${s.title}:`, error.message);
    }
  }
  if (toDelete.length) {
    // delete in chunks (cascade clears checklist/tags/surfaced_from)
    for (let i = 0; i < toDelete.length; i += 50) {
      const chunk = toDelete.slice(i, i + 50);
      const { error } = await db.from("todos").delete().in("id", chunk);
      if (error) console.error("delete chunk failed:", error.message);
    }
  }

  console.log(
    `\napplied. deleted ${counts.delete}, moved ${counts.move}, kept ${counts.keep}.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
