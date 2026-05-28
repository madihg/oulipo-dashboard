#!/usr/bin/env tsx
/**
 * collapse-projects.ts - one-time project->task paradigm migration.
 *
 * Collapses the 3-level tree (Area -> Project -> Todo) into 2 levels
 * (Area -> Task). Each project becomes a single task directly under its area
 * (project_id = null); its child todos fold into that task's checklist + notes
 * via one Sonnet call per project, merging obvious duplicates.
 *
 * Safety:
 *   - --apply writes a full JSON backup to migration/output/ before any delete.
 *   - Idempotent: each new task carries metadata.collapsed_from = <project_id>;
 *     a project is skipped if its task already exists (safe to re-run).
 *   - priority / deadline / state are recomputed in code from raw children as a
 *     backstop, so Sonnet cannot drop an urgent deadline.
 *
 * Run:
 *   SBP_TOKEN=sbp_... ANTHROPIC_API_KEY=sk-... tsx migration/collapse-projects.ts --dry-run
 *   SBP_TOKEN=sbp_... ANTHROPIC_API_KEY=sk-... tsx migration/collapse-projects.ts --apply
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const PROJECT_REF = "smytgqkgomsfyurskpcl";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const MGMT_TOKEN = process.env.SUPABASE_MGMT_TOKEN ?? process.env.SBP_TOKEN;
// --apply writes; --dry-run (or no flag) only prints. --dry-run wins if both given.
const APPLY =
  process.argv.includes("--apply") && !process.argv.includes("--dry-run");
const MODEL = "claude-sonnet-4-6";

type Priority = "P0" | "P1" | "P2" | null;
type Todo = {
  id: string;
  title: string;
  notes: string | null;
  priority: Priority;
  state: string;
  deadline: string | null;
  completed_at: string | null;
  position: number;
};
type Project = {
  id: string;
  user_id: string;
  area_id: string | null;
  slug: string;
  name: string;
  deadline: string | null;
};
type Fold = {
  title: string;
  notes: string | null;
  priority: Priority;
  deadline: string | null;
  state: string;
  checklist: { title: string; done: boolean }[];
};

const SYSTEM = `You collapse a project (with many granular child to-dos) into ONE task with a checklist, for a personal task manager modeled on Things 3.

Return ONLY strict JSON, no prose, no fences:
{
  "title": string,            // the project's real subject, lowercase voice ok
  "notes": string | null,     // synthesize the descriptive / context detail that is NOT itself an action step; null if none
  "checklist": [ { "title": string, "done": boolean } ]  // one item per child action step
}

Rules:
- Every OPEN child to-do becomes one unchecked checklist item, phrased as a crisp action.
- Every COMPLETED child to-do becomes a checked item (done: true) so history is preserved.
- MERGE obvious duplicates (e.g. three identical "send slack dm to ben" rows -> one item). Within this project only.
- Content that is context/reference rather than an action goes into notes, not the checklist.
- No em dashes (use " - "). Keep titles tight. Do not invent steps that aren't in the input.`;

function deriveBackstop(todos: Todo[]): {
  priority: Priority;
  deadline: string | null;
  state: string;
} {
  const open = todos.filter(
    (t) => !["completed", "cancelled", "logbook"].includes(t.state),
  );
  const rank: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
  let priority: Priority = null;
  for (const t of open) {
    if (
      t.priority &&
      (priority === null || rank[t.priority]! < rank[priority]!)
    )
      priority = t.priority;
  }
  const deadlines = open
    .map((t) => t.deadline)
    .filter((d): d is string => !!d)
    .sort();
  const deadline = deadlines[0] ?? null;
  const state = open.some((t) => t.state === "today") ? "today" : "anytime";
  return { priority, deadline, state };
}

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

function extractJson<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

async function foldProject(
  anthropic: Anthropic,
  project: Project,
  todos: Todo[],
): Promise<Fold> {
  const childLines = todos
    .map(
      (t) =>
        `- [${["completed", "logbook"].includes(t.state) ? "x" : " "}] (${t.priority ?? "--"}${t.deadline ? `, due ${t.deadline}` : ""}) ${t.title}${t.notes ? `\n    note: ${t.notes.replace(/\n/g, " ").slice(0, 300)}` : ""}`,
    )
    .join("\n");
  const userPrompt = `Project: ${project.name}\n\nChild to-dos:\n${childLines || "(none)"}\n\nReturn the JSON fold now.`;

  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const parsed =
    extractJson<Omit<Fold, "priority" | "deadline" | "state">>(text);
  const backstop = deriveBackstop(todos);
  if (!parsed) {
    // Fallback: mechanical fold
    return {
      title: project.name,
      notes: null,
      checklist: todos.map((t) => ({
        title: t.title,
        done: ["completed", "logbook"].includes(t.state),
      })),
      ...backstop,
    };
  }
  return {
    title: parsed.title || project.name,
    notes: parsed.notes ?? null,
    checklist: Array.isArray(parsed.checklist) ? parsed.checklist : [],
    priority: backstop.priority,
    deadline: project.deadline ?? backstop.deadline,
    state: backstop.state,
  };
}

async function main() {
  if (!MGMT_TOKEN) throw new Error("SBP_TOKEN / SUPABASE_MGMT_TOKEN required");
  if (!process.env.ANTHROPIC_API_KEY)
    throw new Error("ANTHROPIC_API_KEY required");

  const anthropic = new Anthropic();

  // 1. Read all projects + their todos.
  const projects = (await mgmtQuery(
    `select id, user_id, area_id, slug, name, deadline from hmart.projects order by area_id, position`,
  )) as Project[];
  const allTodos = (await mgmtQuery(
    `select id, project_id, title, notes, priority, state, deadline, completed_at, position from hmart.todos where project_id is not null order by position`,
  )) as (Todo & { project_id: string })[];
  const byProject = new Map<string, Todo[]>();
  for (const t of allTodos) {
    const list = byProject.get(t.project_id) ?? [];
    list.push(t);
    byProject.set(t.project_id, list);
  }

  console.log(
    `projects: ${projects.length}, project-todos: ${allTodos.length}, mode: ${APPLY ? "APPLY" : "DRY-RUN"}`,
  );

  let db: SupabaseClient | null = null;
  const done = new Set<string>();
  if (APPLY) {
    const sr = await getServiceRole();
    db = createClient(SUPABASE_URL, sr, {
      db: { schema: "hmart" },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // 2. Backup before any write.
    const outDir = join(import.meta.dirname, "output");
    mkdirSync(outDir, { recursive: true });
    const backupPath = join(outDir, `pre-collapse-backup-${Date.now()}.json`);
    writeFileSync(
      backupPath,
      JSON.stringify({ projects, todos: allTodos }, null, 2),
    );
    console.log(`backup written: ${backupPath} (${allTodos.length} todos)`);

    // Idempotency: which projects already collapsed?
    const existing = (await mgmtQuery(
      `select metadata->>'collapsed_from' as pid from hmart.todos where metadata ? 'collapsed_from'`,
    )) as { pid: string }[];
    for (const e of existing) if (e.pid) done.add(e.pid);
  }

  let collapsed = 0;
  for (const project of projects) {
    const todos = byProject.get(project.id) ?? [];
    if (APPLY && done.has(project.id)) {
      console.log(`skip (already collapsed): ${project.name}`);
      continue;
    }
    const fold = await foldProject(anthropic, project, todos);

    if (!APPLY) {
      console.log(
        `\n=== ${project.name} (${todos.length} todos -> ${fold.checklist.length} items, ${fold.priority ?? "--"}${fold.deadline ? `, due ${fold.deadline}` : ""}) ===`,
      );
      for (const item of fold.checklist)
        console.log(`  [${item.done ? "x" : " "}] ${item.title}`);
      if (fold.notes) console.log(`  notes: ${fold.notes.slice(0, 160)}`);
      continue;
    }

    // 3. Apply: insert task, checklist, delete old todos + project.
    const { data: task, error: e1 } = await db!
      .from("todos")
      .insert({
        user_id: project.user_id,
        area_id: project.area_id,
        project_id: null,
        title: fold.title,
        notes: fold.notes,
        priority: fold.priority,
        deadline: fold.deadline,
        state: fold.state,
        metadata: {
          collapsed_from: project.id,
          collapsed_at: new Date().toISOString(),
        },
      } as never)
      .select("id")
      .single();
    if (e1 || !task) {
      console.error(`insert task failed for ${project.name}:`, e1?.message);
      continue;
    }
    const taskId = (task as any).id;
    if (fold.checklist.length) {
      const rows = fold.checklist.map((c, i) => ({
        todo_id: taskId,
        title: c.title,
        done: !!c.done,
        position: i,
      }));
      const { error: e2 } = await db!
        .from("checklist_items")
        .insert(rows as never);
      if (e2)
        console.error(
          `checklist insert failed for ${project.name}:`,
          e2.message,
        );
    }
    // delete old child todos (cascade clears their checklist/tags/surfaced_from)
    const ids = todos.map((t) => t.id);
    if (ids.length) {
      const { error: e3 } = await db!.from("todos").delete().in("id", ids);
      if (e3)
        console.error(`delete todos failed for ${project.name}:`, e3.message);
    }
    const { error: e4 } = await db!
      .from("projects")
      .delete()
      .eq("id", project.id);
    if (e4)
      console.error(`delete project failed for ${project.name}:`, e4.message);

    collapsed++;
    console.log(
      `collapsed: ${project.name} -> task ${taskId} (${fold.checklist.length} items)`,
    );
  }

  console.log(
    `\ndone. ${APPLY ? `collapsed ${collapsed} projects.` : "dry-run only, no writes."}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
