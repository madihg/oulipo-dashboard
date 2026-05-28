#!/usr/bin/env tsx
/**
 * consolidate-area.ts - fold loose area-level tasks into coherent parent tasks.
 *
 * After the admin cleanup, ~29 health + ~12 wealth items were MOVED into those
 * areas but landed as standalone tasks instead of subtasks. This folds each
 * loose task (project_id null, no metadata.collapsed_from) into the right
 * existing parent task's checklist - or, when nothing fits, groups loose items
 * into a new coherent parent task. One Sonnet pass per area.
 *
 * Safety: JSON backup before any write. --dry-run prints, --apply writes.
 *
 *   SBP_TOKEN=sbp_... ANTHROPIC_API_KEY=sk-... tsx migration/consolidate-area.ts --dry-run
 *   SBP_TOKEN=sbp_... ANTHROPIC_API_KEY=sk-... tsx migration/consolidate-area.ts --apply
 *   (optional) --areas=health,wealth   (default: health,wealth)
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
const areasArg = process.argv.find((a) => a.startsWith("--areas="));
const AREAS = areasArg
  ? areasArg.split("=")[1]!.split(",")
  : ["health", "wealth"];

type Loose = {
  id: string;
  title: string;
  notes: string | null;
  priority: string | null;
  deadline: string | null;
};
type Parent = { id: string; title: string; items: string[] };
type Assign = {
  loose_id: string;
  action: "fold" | "new" | "keep";
  parent_id: string | null;
  new_group: string | null;
  item: string;
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
  const s = text.indexOf("["),
    e = text.lastIndexOf("]");
  if (s < 0 || e < 0) return null;
  try {
    return JSON.parse(text.slice(s, e + 1)) as T[];
  } catch {
    return null;
  }
}

const SYSTEM_BASE = `You consolidate loose to-dos in an area of a personal task manager. Each loose to-do should become a CHECKLIST ITEM under the parent task it belongs to. Parent tasks (with their current checklist items) are listed.

For each loose to-do return one object:
{ "loose_id": string,
  "action": "fold" | "new" | "keep",
  "parent_id": string | null,     // required when action=fold
  "new_group": string | null,     // a short lowercase task title when action=new
  "item": string }                // the checklist-item phrasing (crisp action; keep any "(due YYYY-MM-DD)")

Rules:
- PREFER "fold" into the most relevant existing parent (match by subject: knee/surgery -> knee task; gut -> gut; brain/memory/supplements -> brain or longevity; taxes -> complete taxes; s-corp/payroll -> s-corp; property tax -> property tax challenge; retirement/HSA/401k -> a wealth parent or a new "retirement accounts" group).
- Use "new" only when several loose items share a theme with NO matching parent; give them the same new_group so they cluster into one new task.
- "keep" only if it is genuinely a standalone task that fits no parent and forms no group.
- Preserve urgent deadlines inside the item text.
- Return ONLY a JSON array.`;

async function main() {
  if (!MGMT_TOKEN) throw new Error("SBP_TOKEN / SUPABASE_MGMT_TOKEN required");
  if (!process.env.ANTHROPIC_API_KEY)
    throw new Error("ANTHROPIC_API_KEY required");
  const anthropic = new Anthropic();

  let db: SupabaseClient | null = null;
  const backup: Record<string, unknown> = {};

  for (const areaSlug of AREAS) {
    const parentsRaw = (await mgmtQuery(
      `select t.id, t.title from hmart.todos t join hmart.areas a on a.id=t.area_id
       where a.slug='${areaSlug}' and t.project_id is null and (t.metadata ? 'collapsed_from')
       order by t.title`,
    )) as { id: string; title: string }[];
    const checklist = (await mgmtQuery(
      `select ci.todo_id, ci.title from hmart.checklist_items ci
       join hmart.todos t on t.id=ci.todo_id join hmart.areas a on a.id=t.area_id
       where a.slug='${areaSlug}' and t.project_id is null and (t.metadata ? 'collapsed_from')`,
    )) as { todo_id: string; title: string }[];
    const loose = (await mgmtQuery(
      `select t.id, t.title, t.notes, t.priority, t.deadline from hmart.todos t join hmart.areas a on a.id=t.area_id
       where a.slug='${areaSlug}' and t.project_id is null and not (t.metadata ? 'collapsed_from')
       and t.state not in ('completed','cancelled','logbook') order by t.title`,
    )) as Loose[];

    const parents: Parent[] = parentsRaw.map((p) => ({
      id: p.id,
      title: p.title,
      items: checklist.filter((c) => c.todo_id === p.id).map((c) => c.title),
    }));
    backup[areaSlug] = { parents, loose };

    console.log(
      `\n# ${areaSlug}: ${parents.length} parents, ${loose.length} loose (mode: ${APPLY ? "APPLY" : "DRY-RUN"})`,
    );
    if (loose.length === 0) continue;

    const parentText = parents
      .map(
        (p) =>
          `- ${p.id} :: ${p.title}\n${p.items.map((i) => `    · ${i}`).join("\n")}`,
      )
      .join("\n");
    const system = `${SYSTEM_BASE}\n\nPARENT TASKS in "${areaSlug}":\n${parentText}`;
    const userPrompt = `Loose to-dos to consolidate:\n${loose
      .map(
        (l) =>
          `loose_id=${l.id} | (${l.priority ?? "--"}${l.deadline ? `, due ${l.deadline}` : ""}) ${l.title}`,
      )
      .join("\n")}\n\nReturn the JSON array now.`;

    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const assigns = extractJsonArray<Assign>(text);
    if (!assigns) {
      console.error(`parse failed for ${areaSlug}:\n`, text.slice(0, 600));
      process.exit(1);
    }

    const byId = new Map(assigns.map((a) => [a.loose_id, a]));
    const counts = { fold: 0, new: 0, keep: 0 };
    const parentTitle = new Map(parents.map((p) => [p.id, p.title]));
    for (const l of loose) {
      const a = byId.get(l.id);
      if (!a) {
        console.log(`  [keep] ${l.title} (unmatched)`);
        continue;
      }
      counts[a.action]++;
      if (!APPLY) {
        const tgt =
          a.action === "fold"
            ? `-> ${parentTitle.get(a.parent_id ?? "") ?? a.parent_id}`
            : a.action === "new"
              ? `-> new: ${a.new_group}`
              : "";
        console.log(`  [${a.action}${tgt}] ${a.item}`);
      }
    }
    console.log(
      `  plan: fold ${counts.fold}, new ${counts.new}, keep ${counts.keep}`,
    );

    if (!APPLY) continue;

    // ---- apply ----
    // Write the backup BEFORE any mutation (cumulative across areas).
    {
      const outDir = join(import.meta.dirname, "output");
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        join(outDir, "pre-consolidate-latest.json"),
        JSON.stringify(backup, null, 2),
      );
    }
    if (!db) {
      db = createClient(SUPABASE_URL, await getServiceRole(), {
        db: { schema: "hmart" },
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    const userId = (
      await mgmtQuery(
        `select user_id from hmart.areas where slug='${areaSlug}' limit 1`,
      )
    )[0]?.user_id;
    const areaId = (
      await mgmtQuery(
        `select id from hmart.areas where slug='${areaSlug}' limit 1`,
      )
    )[0]?.id;

    // position offset per parent = current max
    const posByParent = new Map<string, number>();
    for (const p of parents) posByParent.set(p.id, p.items.length);

    const deleteIds: string[] = [];
    const newGroups = new Map<
      string,
      { items: string[]; priority: string | null }
    >();

    for (const l of loose) {
      const a = byId.get(l.id);
      if (!a || a.action === "keep") continue;
      if (a.action === "fold" && a.parent_id) {
        const pos = posByParent.get(a.parent_id) ?? 0;
        posByParent.set(a.parent_id, pos + 1);
        await db.from("checklist_items").insert({
          todo_id: a.parent_id,
          title: a.item,
          done: false,
          position: pos,
        } as never);
        deleteIds.push(l.id);
      } else if (a.action === "new" && a.new_group) {
        const g = newGroups.get(a.new_group) ?? {
          items: [],
          priority: l.priority,
        };
        g.items.push(a.item);
        if (l.priority === "P0") g.priority = "P0";
        newGroups.set(a.new_group, g);
        deleteIds.push(l.id);
      }
    }
    // create new grouped parent tasks
    for (const [title, g] of newGroups) {
      const { data: task } = await db
        .from("todos")
        .insert({
          user_id: userId,
          area_id: areaId,
          project_id: null,
          title,
          priority: g.priority,
          state: "anytime",
          metadata: {
            consolidated: true,
            consolidated_at: new Date().toISOString(),
          },
        } as never)
        .select("id")
        .single();
      const tid = (task as any)?.id;
      if (tid) {
        await db.from("checklist_items").insert(
          g.items.map((it, i) => ({
            todo_id: tid,
            title: it,
            done: false,
            position: i,
          })) as never,
        );
      }
    }
    // delete folded/grouped loose todos
    for (let i = 0; i < deleteIds.length; i += 50) {
      await db
        .from("todos")
        .delete()
        .in("id", deleteIds.slice(i, i + 50));
    }
    console.log(
      `  applied: folded+grouped ${deleteIds.length}, new tasks ${newGroups.size}`,
    );
  }

  if (APPLY && db) {
    const outDir = join(import.meta.dirname, "output");
    mkdirSync(outDir, { recursive: true });
    const p = join(outDir, `pre-consolidate-${Date.now()}.json`);
    writeFileSync(p, JSON.stringify(backup, null, 2));
    console.log(`\nbackup written: ${p}`);
  } else if (!APPLY) {
    console.log("\ndry-run only, no writes.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
