// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * Pull the cache-friendly context blocks every Sonnet call needs:
 *   - Areas + Projects catalog
 *   - Global + scoped memory entries (Claude.md + style guides + foundational refs)
 *
 * When `areaSlug` is provided, memory is scoped to `global + area:<slug>` -
 * cuts the always-bundled memory from ~45KB to ~10-15KB per call, sharpens
 * Sonnet's focus. If areaSlug is omitted (e.g. the router), all memory ships.
 */
export async function buildContextBundle(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  areaSlug?: string,
): Promise<string> {
  const supa = createClient(supabaseUrl, serviceRoleKey, {
    db: { schema: "hmart" },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Memory query: scope-filter when areaSlug provided
  let memoryQuery = supa
    .from("memory_entries")
    .select("kind,scope,title,body")
    .eq("user_id", userId)
    .in("kind", ["user_rule", "reference", "style_guide"]);
  if (areaSlug) {
    memoryQuery = memoryQuery.in("scope", ["global", `area:${areaSlug}`]);
  }

  const [areas, projects, memory] = await Promise.all([
    supa.from("areas").select("slug,name,position").eq("user_id", userId),
    supa
      .from("projects")
      .select("slug,name,area_id,deadline,cadence,cadence_target,notes")
      .eq("user_id", userId),
    memoryQuery,
  ]);

  const areaByIdLines = (areas.data ?? [])
    .sort((a: any, b: any) => a.position - b.position)
    .map((a: any) => `- ${a.slug}: ${a.name}`)
    .join("\n");

  const projectLines = (projects.data ?? [])
    .map((p: any) => {
      const meta: string[] = [];
      if (p.deadline) meta.push(`deadline ${p.deadline}`);
      if (p.cadence) meta.push(`cadence ${p.cadence_target ?? 1}/${p.cadence}`);
      const notes = (p.notes ?? "").trim().slice(0, 200);
      return `- ${p.slug}: ${p.name}${meta.length ? ` [${meta.join(", ")}]` : ""}${notes ? `\n  ${notes}` : ""}`;
    })
    .join("\n");

  const memoryLines = (memory.data ?? [])
    .map(
      (m: any) =>
        `## ${m.kind} - ${m.title} (${m.scope ?? "global"})\n${m.body}`,
    )
    .join("\n\n");

  return [
    "# Areas",
    areaByIdLines,
    "",
    "# Projects",
    projectLines,
    "",
    areaSlug
      ? `# Memory (scoped: global + area:${areaSlug})`
      : "# Memory (rules, style, references)",
    memoryLines,
  ].join("\n");
}
