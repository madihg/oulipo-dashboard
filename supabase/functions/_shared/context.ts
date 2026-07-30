// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * Pull the cache-friendly context blocks every Sonnet call needs:
 *   - Areas + Projects catalog
 *   - Layered memory: rules (user_rule + project_rule), style guides,
 *     references, and running context notes (wiki), resolved
 *     global -> area -> project with the most specific layer LAST so it
 *     reads as overriding the general ones.
 *
 * When `areaSlug` is provided, memory is scoped to global + area:<slug>
 * (+ project:<slug> when projectSlug is also given) - cuts the bundle from
 * ~45KB to ~10-15KB per call, sharpens focus. If areaSlug is omitted
 * (e.g. the router), all memory ships.
 */
export async function buildContextBundle(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  areaSlug?: string,
  projectSlug?: string,
): Promise<string> {
  const supa = createClient(supabaseUrl, serviceRoleKey, {
    db: { schema: "hmart" },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Memory query: scope-filter when areaSlug provided. project_rule and wiki
  // are the per-scope instructions + running note - they MUST ship (rules
  // used to be silently dropped here, which is why they never "fired").
  let memoryQuery = supa
    .from("memory_entries")
    .select("kind,scope,title,body")
    .eq("user_id", userId)
    .in("kind", [
      "user_rule",
      "project_rule",
      "reference",
      "style_guide",
      "wiki",
    ]);
  if (areaSlug) {
    const scopes = ["global", `area:${areaSlug}`];
    if (projectSlug) scopes.push(`project:${projectSlug}`);
    memoryQuery = memoryQuery.in("scope", scopes);
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

  // Layer order: global first, then area, then project - most specific last,
  // so the reader treats later entries as overriding earlier ones.
  const layerRank = (scope: string | null): number => {
    if (!scope || scope === "global") return 0;
    if (scope.startsWith("area:")) return 1;
    if (scope.startsWith("project:")) return 2;
    return 3;
  };
  const memoryLines = (memory.data ?? [])
    .sort(
      (a: any, b: any) =>
        layerRank(a.scope) - layerRank(b.scope) ||
        String(a.kind).localeCompare(String(b.kind)),
    )
    .map(
      (m: any) =>
        `## ${m.kind} - ${m.title} (${m.scope ?? "global"})\n${m.body}`,
    )
    .join("\n\n");

  const scopeLabel = areaSlug
    ? `scoped: global + area:${areaSlug}${projectSlug ? ` + project:${projectSlug}` : ""}`
    : "rules, wikis, style, references";
  return [
    "# Areas",
    areaByIdLines,
    "",
    "# Projects",
    projectLines,
    "",
    `# Memory (${scopeLabel}; layered global -> area -> project, most specific wins)`,
    memoryLines,
  ].join("\n");
}
