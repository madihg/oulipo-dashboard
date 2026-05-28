#!/usr/bin/env tsx
/**
 * Vault -> hmart schema importer.
 *
 * Usage:
 *   tsx migration/import-vault.ts --dry-run     # parse everything, write reports, no SQL apply
 *   tsx migration/import-vault.ts --apply       # emit SQL ready to apply via Supabase MCP
 *
 * See VAULT_MIGRATION_PLAN.md for the conceptual mapping.
 *
 * Two-pass design:
 *  Pass 1 (deterministic):  YAML frontmatter + `## Tasks` / `## Hooks` / `## Doing` / `## Done` sections
 *  Pass 2 (Sonnet inference): latent tasks + reservoir updates from prose
 *                             (only for project / person / health-decision / wealth-plan files)
 *
 * Outputs (migration/output/):
 *   - dry-run-report.md            human-readable counts + per-file breakdown
 *   - inferred-tasks.csv           every body-inferred task + verbatim evidence quote
 *   - proposed-inserts.sql         SQL ready for `execute_sql` via Supabase MCP
 *   - reservoir-updates.json       per-row field updates from inference (network maintenance dates etc.)
 */

import path from "node:path";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// Config
// =============================================================================

const VAULT_ROOT = "/Users/halim/Documents/second-brain";
const OUTPUT_DIR = path.join(__dirname, "output");
const PLACEHOLDER_USER_ID = "00000000-0000-0000-0000-000000000001";

const AREA_MAP: Record<
  string,
  { slug: string; name: string; position: number }
> = {
  "A0. Structure": { slug: "__global", name: "(global)", position: 0 }, // sentinel - files here become global memory_entries
  "A1. Learn": { slug: "learn", name: "learn", position: 4 },
  "A2. Make": { slug: "make", name: "make", position: 5 },
  "A2. Write": { slug: "write", name: "write", position: 8 },
  "A3. Share": { slug: "share", name: "share", position: 7 },
  "A4. Apply": { slug: "apply", name: "apply", position: 2 },
  "A5. Network": { slug: "network", name: "network", position: 6 },
  "X0. Earn": { slug: "earn", name: "earn", position: 3 },
  "X1. Mindset": { slug: "admin", name: "admin", position: 1 }, // mindset folded into admin
  "X2. Health": { slug: "admin", name: "admin", position: 1 },
  "X3. Wealth": { slug: "admin", name: "admin", position: 1 },
  "X4. Admin": { slug: "admin", name: "admin", position: 1 },
  "00. To Do": { slug: "__capture", name: "(capture)", position: 0 }, // sentinel
};

const SKIP_FILE_PATTERNS = [
  /-Briefing\.md$/i,
  /Briefing\.md$/,
  /-Briefing-Proposal\.md$/i,
  /Strategy-Briefing\.md$/i,
  /Week of \d{4}-\d{2}-\d{2}\.md$/,
  /Conflicted copy/i,
  /\.DS_Store/,
];

// Files that get the Sonnet inference pass for latent tasks.
const INFERENCE_PASS_PREFIXES = ["P0", "P1", "P2", "PN", "PX"];
const INFERENCE_PASS_AREAS = new Set([
  "learn",
  "make",
  "write",
  "share",
  "apply",
  "network",
  "earn",
  "admin",
]);

// Stable deterministic UUIDs from a name (UUID v5-ish via SHA-256 first 16 bytes)
function uuid5(namespace: string, name: string): string {
  const h = createHash("sha256")
    .update(namespace)
    .update("\x1f")
    .update(name)
    .digest();
  const b = [...h.subarray(0, 16)];
  b[6] = (b[6]! & 0x0f) | 0x50; // version 5
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = b.map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const AREA_UUID = (slug: string) => uuid5("hmart-area", slug);

// Cache of resolved project_ids per file.rel_path so structural pass and inference pass
// emit FK-consistent rows. Populated by parseProject; consulted by inference paths.
const PROJECT_ID_BY_FILE = new Map<string, string>();
function resolveProjectId(
  file: ClassifiedFile,
  fm?: Record<string, unknown>,
): string {
  const cached = PROJECT_ID_BY_FILE.get(file.rel_path);
  if (cached) return cached;
  const id =
    fm && validUuid(fm["id"])
      ? (fm["id"] as string)
      : uuid5("hmart-project", file.rel_path);
  PROJECT_ID_BY_FILE.set(file.rel_path, id);
  return id;
}

// =============================================================================
// Types
// =============================================================================

type FileClass =
  | "project" // Pn / Px / PN markdown
  | "person" // A5. Network person file (frontmatter type=person)
  | "wiki" // A1. Learn/1. Wikis/*
  | "make_wiki" // A2. Make/1. Wikis/* (form-* / theme-*)
  | "write_active" // A2. Write/Active/*
  | "write_completed" // A2. Write/Completed/*
  | "apply_backlog" // A4. Apply/_Backlog_.md
  | "network_backlog" // A5. Network/_Backlog_.md
  | "share_backlog" // A3. Share/_Backlog_.md
  | "learn_lit_backlog"
  | "learn_tech_backlog"
  | "make_backlog" // A2. Make/_Backlog_.md (if exists) - or other area generic backlog
  | "generic_backlog"
  | "capture" // 00. To Do/Capture.md
  | "raw_kindle"
  | "raw_notes"
  | "raw_transcripts"
  | "raw_web"
  | "raw_matter"
  | "memory_global" // root Claude.md, _Shortcuts_, A0. Structure/*
  | "memory_area" // per-area CLAUDE.md / _Strategy_ / _Resources_
  | "memory_decision" // X2. Health/*Decision*.md, *Audit*.md, *Deep Research*.md, X3. Wealth/2026 Tax Plan etc.
  | "memory_okrs" // 00. To Do/OKRs.md
  | "skip"; // briefings, conflicts

interface ClassifiedFile {
  abs_path: string;
  rel_path: string; // relative to VAULT_ROOT
  area_dir: string; // e.g. "A2. Make"
  area_slug: string; // e.g. "make"
  file_class: FileClass;
  filename: string;
  obsidian_uri: string;
}

interface ParsedRow {
  table: string;
  id?: string;
  values: Record<string, unknown>;
  source_path: string; // for traceability
  source_section?: string;
  inferred?: boolean;
}

interface InferenceTask {
  table: "todos";
  title: string;
  priority_guess: "P0" | "P1" | "P2" | null;
  deadline_guess: string | null;
  source_file: string;
  source_section: string;
  evidence_quote: string;
  confidence: number;
}

interface ReservoirUpdate {
  table: string;
  match_key: { field: string; value: string };
  field_updates: Record<string, unknown>;
  source_file: string;
  source_section: string;
  evidence_quote: string;
}

interface InferenceResult {
  explicit_tasks_seen: number;
  latent_tasks: InferenceTask[];
  reservoir_updates: ReservoirUpdate[];
}

// =============================================================================
// Vault walker + classifier
// =============================================================================

function walk(root: string): string[] {
  const out: string[] = [];
  function visit(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith(".")) continue;
      if (name === "Templates" || name === "node_modules") continue;
      const p = path.join(dir, name);
      let s;
      try {
        s = statSync(p);
      } catch {
        continue;
      }
      if (s.isDirectory()) visit(p);
      else if (s.isFile() && name.endsWith(".md")) out.push(p);
    }
  }
  visit(root);
  return out.sort();
}

function classifyFile(abs: string): ClassifiedFile {
  const rel = path.relative(VAULT_ROOT, abs);
  const parts = rel.split(path.sep);
  const filename = parts[parts.length - 1]!;
  const area_dir = parts[0]!;
  const area_meta = AREA_MAP[area_dir] ?? {
    slug: "__unknown",
    name: "(unknown)",
    position: 99,
  };
  const obsidian_uri = `obsidian://open?vault=second-brain&file=${encodeURI(rel.replace(/\.md$/, "")).replace(/\+/g, "%2B")}`;

  // Skip patterns first
  for (const pat of SKIP_FILE_PATTERNS) {
    if (pat.test(rel) || pat.test(filename)) {
      return base("skip");
    }
  }

  function base(fc: FileClass): ClassifiedFile {
    return {
      abs_path: abs,
      rel_path: rel,
      area_dir,
      area_slug: area_meta.slug,
      file_class: fc,
      filename,
      obsidian_uri,
    };
  }

  // Backlogs (specific area-keyed)
  if (filename === "_Backlog_.md") {
    if (area_dir === "A4. Apply") return base("apply_backlog");
    if (area_dir === "A5. Network") return base("network_backlog");
    if (area_dir === "A3. Share") return base("share_backlog");
    return base("generic_backlog");
  }
  if (filename === "_Backlog Lit_.md") return base("learn_lit_backlog");
  if (filename === "_Backlog Tech_.md") return base("learn_tech_backlog");

  // Raw
  if (rel.includes(`A1. Learn${path.sep}0. raw${path.sep}kindle${path.sep}`))
    return base("raw_kindle");
  if (rel.includes(`A1. Learn${path.sep}0. raw${path.sep}notes${path.sep}`))
    return base("raw_notes");
  if (
    rel.includes(`A1. Learn${path.sep}0. raw${path.sep}transcripts${path.sep}`)
  )
    return base("raw_transcripts");
  if (rel.includes(`A1. Learn${path.sep}0. raw${path.sep}web${path.sep}`))
    return base("raw_web");
  if (rel.includes(`A1. Learn${path.sep}0. raw${path.sep}matter${path.sep}`))
    return base("raw_matter");

  // Wikis
  if (rel.startsWith(`A1. Learn${path.sep}1. Wikis${path.sep}`))
    return base("wiki");
  if (rel.startsWith(`A2. Make${path.sep}1. Wikis${path.sep}`))
    return base("make_wiki");

  // Writes
  if (rel.startsWith(`A2. Write${path.sep}Active${path.sep}`))
    return base("write_active");
  if (rel.startsWith(`A2. Write${path.sep}Completed${path.sep}`))
    return base("write_completed");

  // Capture
  if (rel === `00. To Do${path.sep}Capture.md`) return base("capture");
  if (rel === `00. To Do${path.sep}OKRs.md`) return base("memory_okrs");

  // Memory: per-area CLAUDE, Strategy, Resources, Workflow
  if (
    filename === "CLAUDE.md" ||
    filename === "_Strategy_.md" ||
    filename === "_Resources_.md" ||
    filename === "_Workflow_.md" ||
    filename === "_Seeds_.md"
  ) {
    return base("memory_area");
  }

  // Memory: root + A0. Structure (global rules / strategy / style)
  if (
    area_dir === "A0. Structure" ||
    filename === "Claude.md" ||
    filename === "_Shortcuts_.md" ||
    filename === "Clarinet-P0s.md"
  ) {
    return base("memory_global");
  }

  // Health / Wealth / Earn decision / research / audit files (memory)
  if (
    /Decision\.md$/i.test(filename) ||
    /Audit/i.test(filename) ||
    /Deep Research/i.test(filename) ||
    /Buy List/i.test(filename) ||
    /Health Protocol\.md$/i.test(filename) ||
    /Tax Plan\.md$/i.test(filename) ||
    /Mum Transfer/i.test(filename) ||
    /Strategies\.md$/i.test(filename)
  ) {
    return base("memory_decision");
  }

  // Network person files (have frontmatter type=person, but we'll classify by location + non-prefix filename)
  if (area_dir === "A5. Network" && !/^(P[0-9XN]|_)/.test(filename)) {
    return base("person");
  }

  // Project files (Pn/Px/PN prefixes in active area folders)
  if (INFERENCE_PASS_PREFIXES.some((p) => filename.startsWith(`${p} `))) {
    return base("project");
  }

  // Fallback: treat as memory_area for the right area
  return base("memory_area");
}

// =============================================================================
// Parse helpers
// =============================================================================

function slugify(input: string, maxLen = 60): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, maxLen)
    .replace(/^-|-$/g, "");
}

function projectSlugFromFilename(filename: string): string {
  return slugify(filename.replace(/^P[0-9XN]\s+/i, "").replace(/\.md$/, ""));
}

function projectNameFromFilename(filename: string): string {
  return filename.replace(/^P[0-9XN]\s+/i, "").replace(/\.md$/, "");
}

interface Section {
  level: number;
  heading: string;
  body: string; // body text (lines after heading until next heading of same/lower level)
  body_with_subs: string;
  start_line: number;
  end_line: number;
}

function parseSections(md: string): Section[] {
  const lines = md.split(/\r?\n/);
  const headings: { line: number; level: number; heading: string }[] = [];
  const inFence: { open: boolean } = { open: false };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (/^```/.test(l)) inFence.open = !inFence.open;
    if (inFence.open) continue;
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(l);
    if (m)
      headings.push({ line: i, level: m[1]!.length, heading: m[2]!.trim() });
  }
  const out: Section[] = [];
  for (let i = 0; i < headings.length; i++) {
    const cur = headings[i]!;
    const sameOrShallower = headings.find(
      (h, j) => j > i && h.level <= cur.level,
    );
    const shallower = headings.find((h, j) => j > i && h.level < cur.level);
    const endA = (sameOrShallower ? sameOrShallower.line : lines.length) - 1;
    const endB = (shallower ? shallower.line : lines.length) - 1;
    out.push({
      level: cur.level,
      heading: cur.heading,
      body: lines
        .slice(cur.line + 1, endA + 1)
        .join("\n")
        .trim(),
      body_with_subs: lines
        .slice(cur.line + 1, endB + 1)
        .join("\n")
        .trim(),
      start_line: cur.line,
      end_line: endA,
    });
  }
  return out;
}

function findSection(
  secs: Section[],
  headingLike: string,
): Section | undefined {
  const n = headingLike.toLowerCase();
  return secs.find((s) => s.heading.toLowerCase() === n);
}

// Parse a single `- [ ] [P0] title | Deadline: 2026-05-04` style line
function parseTaskLine(line: string): {
  title: string;
  done: boolean;
  priority: "P0" | "P1" | "P2" | null;
  deadline: string | null;
  completed_at: string | null;
} | null {
  const m =
    /^- \[( |x)\]\s+(?:\[(P[0-3])\]\s*)?(.+?)(?:\s*\|\s*Deadline:\s*(\d{4}-\d{2}-\d{2}))?(?:\s*✅\s*(\d{4}-\d{2}-\d{2}))?\s*$/.exec(
      line,
    );
  if (!m) return null;
  let title = (m[3] ?? "").trim();
  // Strip trailing inline status markers like "**SHIPPED 2026-05-01**" - keep them in title actually for fidelity
  let priority = (m[2] ?? null) as "P0" | "P1" | "P2" | null;
  if (priority && !["P0", "P1", "P2"].includes(priority)) priority = "P2";
  return {
    title,
    done: m[1] === "x",
    priority,
    deadline: m[4] ?? null,
    completed_at: m[5] ?? null,
  };
}

// =============================================================================
// Per-type parsers
// =============================================================================

// Result accumulators
class Accum {
  rows: ParsedRow[] = [];
  errors: { file: string; error: string }[] = [];
  per_file_counts: Record<string, Record<string, number>> = {};
  inferred_csv: InferenceTask[] = [];
  reservoir_updates: ReservoirUpdate[] = [];

  add(row: ParsedRow) {
    this.rows.push(row);
    const counts = (this.per_file_counts[row.source_path] ??= {});
    counts[row.table] = (counts[row.table] ?? 0) + 1;
  }
}

function parseProject(file: ClassifiedFile, raw: string, acc: Accum): void {
  const { data: fm, content: body } = matter(raw);
  const project_id = resolveProjectId(file, fm as Record<string, unknown>);
  const slug = projectSlugFromFilename(file.filename);
  const name = projectNameFromFilename(file.filename);
  const area_id = AREA_UUID(file.area_slug);
  const status =
    (fm.status as string) === "now"
      ? "active"
      : ((fm.status as string) ?? "active");

  acc.add({
    table: "projects",
    id: project_id,
    source_path: file.rel_path,
    values: {
      id: project_id,
      user_id: "<<USER_ID>>",
      area_id,
      slug,
      name,
      notes: body.trim(),
      state: ["active", "someday", "completed", "cancelled"].includes(status)
        ? status
        : "active",
      deadline: coerceDate(fm.deadline),
      obsidian_uri: file.obsidian_uri,
    },
  });

  // make_pieces twin row for projects in Make area
  if (file.area_slug === "make") {
    const piece_id = uuid5("hmart-make-piece", file.rel_path);
    const sections = parseSections(body);
    const firstPara =
      body
        .replace(/^---[\s\S]*?---/, "")
        .split(/\n\n/)
        .map((p) => p.trim())
        .find((p) => p && !p.startsWith("#")) ?? "";
    acc.add({
      table: "make_pieces",
      id: piece_id,
      source_path: file.rel_path,
      values: {
        id: piece_id,
        user_id: "<<USER_ID>>",
        slug,
        name,
        piece_kind: "Piece",
        status: status === "active" ? "active" : "someday",
        deadline: coerceDate(fm.deadline),
        brief: firstPara,
        notes: body.trim(),
      },
    });
    // unused var lint - intentionally compute sections for future hook
    void sections;
  }

  // Tasks from ## Tasks section
  const sections = parseSections(body);
  const tasks_sec = findSection(sections, "Tasks");
  if (tasks_sec) {
    const lines = tasks_sec.body.split(/\n/);
    let pos = 0;
    for (const line of lines) {
      const t = parseTaskLine(line);
      if (!t) continue;
      const todo_id = uuid5("hmart-todo", `${file.rel_path}#${pos}:${t.title}`);
      acc.add({
        table: "todos",
        id: todo_id,
        source_path: file.rel_path,
        source_section: "## Tasks",
        values: {
          id: todo_id,
          user_id: "<<USER_ID>>",
          area_id,
          project_id,
          title: t.title,
          state: t.done ? "completed" : "anytime",
          priority: t.priority,
          deadline: t.deadline,
          completed_at: t.completed_at,
          position: pos,
          obsidian_uri: file.obsidian_uri,
          metadata: { source: "explicit", source_section: "## Tasks" },
        },
      });
      pos++;
    }
  }
}

function parsePerson(file: ClassifiedFile, raw: string, acc: Accum): void {
  const { data: fm, content: body } = matter(raw);
  const id = validUuid(fm.id) ? fm.id : uuid5("hmart-person", file.rel_path);
  const name =
    body.match(/^#\s+(.+)$/m)?.[1]?.trim() ??
    file.filename.replace(/\.md$/, "");
  // category inference: simple heuristic from body
  const lowerBody = body.toLowerCase();
  let category: string = "other";
  if (/podcast|guest|episode/.test(lowerBody)) category = "podcast";
  else if (
    /journalist|editor|magazine|publication|writer|author/.test(lowerBody)
  )
    category = "publication";
  else if (/gallery|curator|exhibition|museum/.test(lowerBody))
    category = "gallery";
  else if (
    /researcher|university|professor|berkeley|stanford|mit|cs(td|stms)/.test(
      lowerBody,
    )
  )
    category = "curator";
  else category = "peer";

  const tier = typeof fm.tier === "number" ? fm.tier : 4;
  const status_map: Record<string, string> = {
    "warm-reconnect": "in_relationship",
    "in-relationship": "in_relationship",
    responded: "responded",
    contacted: "contacted",
    lead: "lead",
    dormant: "dormant",
  };
  const status = status_map[(fm.status as string) ?? "lead"] ?? "lead";

  const email_match = body.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  );
  acc.add({
    table: "network_contacts",
    id,
    source_path: file.rel_path,
    values: {
      id,
      user_id: "<<USER_ID>>",
      name,
      category,
      tier,
      email: email_match?.[0] ?? null,
      status,
      last_touch_at: coerceDate(fm.last_connected),
      notes: body.trim(),
    },
  });
}

const SEEN_WIKI_IDS = new Set<string>();
function parseWiki(file: ClassifiedFile, raw: string, acc: Accum): void {
  const { data: fm, content: body } = matter(raw);
  // If frontmatter id is already used by another file (copy-paste artifact in vault),
  // fall back to deterministic uuid5 from the path so we don't lose the row.
  let id: string;
  if (validUuid(fm.id) && !SEEN_WIKI_IDS.has(fm.id as string)) {
    id = fm.id as string;
  } else {
    id = uuid5("hmart-wiki", file.rel_path);
  }
  SEEN_WIKI_IDS.add(id);
  const tag = (fm.tag as string) ?? file.filename.replace(/\.md$/, "");
  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? tag;
  const synthesis_match = body.match(/^> (.+(?:\n> .+)*)/m);
  const synthesis = synthesis_match?.[1]?.replace(/^> /gm, "").trim() ?? null;
  const priority = ["P0", "P1", "P2", "dormant"].includes(fm.priority as string)
    ? (fm.priority as string)
    : "P2";
  acc.add({
    table: "learn_wikis",
    id,
    source_path: file.rel_path,
    values: {
      id,
      user_id: "<<USER_ID>>",
      tag,
      title,
      priority,
      synthesis,
      body: body.trim(),
      sources_count: typeof fm.sources === "number" ? fm.sources : 0,
      last_ingest_at: coerceDate(fm.last_ingest),
      cross_refs: Array.isArray(fm.related) ? fm.related : [],
      frontmatter: fm,
    },
  });
}

function parseWriteDraft(
  file: ClassifiedFile,
  raw: string,
  acc: Accum,
  state: "active" | "completed",
): void {
  const { data: fm, content: body } = matter(raw);
  const id = validUuid(fm.id) ? fm.id : uuid5("hmart-write", file.rel_path);
  const title =
    body.match(/^#\s+(.+)$/m)?.[1]?.trim() ??
    file.filename.replace(/\.md$/, "");
  const slug = slugify(title);
  acc.add({
    table: "write_drafts",
    id,
    source_path: file.rel_path,
    values: {
      id,
      user_id: "<<USER_ID>>",
      slug,
      title,
      state,
      wikis_used: [], // resolve later by tag -> wiki id
      obsidian_uri: file.obsidian_uri,
      last_touched_at: coerceDate(fm.last_touched),
      shipped_at: state === "completed" ? coerceDate(fm.shipped_at) : null,
      notes: body.trim(),
      // tag list preserved as raw frontmatter array for later resolve step
    },
  });
}

function parseCapture(file: ClassifiedFile, raw: string, acc: Accum): void {
  const sections = parseSections(raw);
  const pending = findSection(sections, "Pending");
  const routed = findSection(sections, "Routed");
  function rowsFromSection(
    sec: Section | undefined,
    state: "pending" | "routed",
  ) {
    if (!sec) return;
    for (const line of sec.body.split(/\n/)) {
      const m = /^- (.+?)(?:\s+→\s+(.+))?$/.exec(line.trim());
      if (!m) continue;
      let raw_text = (m[1] ?? "").trim();
      const dest = m[2] ?? null;
      // trailing ", YYYY-MM-DD"
      const date_m = /,\s*(\d{4}-\d{2}-\d{2})\s*$/.exec(dest ?? "");
      const created_at = date_m ? date_m[1] : null;
      const inference = dest
        ? dest.replace(/,\s*\d{4}-\d{2}-\d{2}\s*$/, "").trim()
        : null;
      const id = uuid5(
        "hmart-capture",
        `${file.rel_path}#${raw_text}#${dest ?? ""}`,
      );
      acc.add({
        table: "captures",
        id,
        source_path: file.rel_path,
        values: {
          id,
          user_id: "<<USER_ID>>",
          raw_text,
          source: "obsidian",
          state,
          inference_summary: inference,
          created_at: created_at ?? "1970-01-01",
        },
      });
    }
  }
  rowsFromSection(pending, "pending");
  rowsFromSection(routed, "routed");
}

function parseMemory(
  file: ClassifiedFile,
  raw: string,
  acc: Accum,
  kind: "user_rule" | "project_rule" | "feedback" | "reference" | "style_guide",
  scope: string,
): void {
  const id = uuid5("hmart-memory", file.rel_path);
  const title_match = raw.match(/^#\s+(.+)$/m);
  const title = title_match?.[1]?.trim() ?? file.filename.replace(/\.md$/, "");
  acc.add({
    table: "memory_entries",
    id,
    source_path: file.rel_path,
    values: {
      id,
      user_id: "<<USER_ID>>",
      kind,
      scope,
      title,
      body: raw.trim(),
      source_file: `~/Documents/second-brain/${file.rel_path}`,
    },
  });
}

// Backlog parsers (apply / network / share / learn-lit / learn-tech)
//
// Each backlog has a recognizable section structure (## Goal, ## Doing, ## To Do, ## Backlog, ## Done, ## To-dos for Claude).
// We parse bullets under each section and emit typed reservoir rows.

function parseBacklogBullets(
  text: string,
): { line: string; raw: string; checked: boolean }[] {
  const out: { line: string; raw: string; checked: boolean }[] = [];
  const lines = text.split(/\n/);
  let cur: { line: string; raw: string; checked: boolean } | null = null;
  for (const l of lines) {
    const m = /^- \[( |x)\]\s+(.+)$/.exec(l);
    if (m) {
      if (cur) out.push(cur);
      cur = { line: m[2]!, raw: l, checked: m[1] === "x" };
    } else if (cur && /^\s+\S/.test(l)) {
      cur.line += "\n" + l.trim();
      cur.raw += "\n" + l;
    } else if (l.trim() === "" && cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function parseApplyBacklog(
  file: ClassifiedFile,
  raw: string,
  acc: Accum,
): void {
  const { content: body } = matter(raw);
  const sections = parseSections(body);
  const doing = findSection(sections, "Doing");
  const todo = findSection(sections, "To Do");
  const done = findSection(sections, "Done");
  const sectionMap: [Section | undefined, string][] = [
    [doing, "doing"],
    [todo, "watchlist"],
    [done, "applied"],
  ];
  for (const [sec, status] of sectionMap) {
    if (!sec) continue;
    for (const b of parseBacklogBullets(sec.body)) {
      // Extract priority, deadline, name
      const prio_m = /\[P([0-3])\]/.exec(b.line);
      const dl_m = /Deadline:\s*(\d{4}-\d{2}-\d{2})/.exec(b.line);
      const name_m = /\*\*([^*]+)\*\*/.exec(b.line);
      const url_m = /(https?:\/\/\S+)/.exec(b.line);
      const kind = /residency/i.test(b.line)
        ? "residency"
        : /fellowship/i.test(b.line)
          ? "fellowship"
          : /grant|award|prize/i.test(b.line)
            ? "grant"
            : /submission|journal|publication/i.test(b.line)
              ? "submission"
              : /podcast/i.test(b.line)
                ? "podcast_pitch"
                : "other";
      const name = name_m?.[1] ?? b.line.slice(0, 80);
      const id = uuid5("hmart-apply", `${file.rel_path}#${name}`);
      acc.add({
        table: "apply_opportunities",
        id,
        source_path: file.rel_path,
        source_section: `## ${sec.heading}`,
        values: {
          id,
          user_id: "<<USER_ID>>",
          kind,
          name,
          deadline: dl_m?.[1] ?? null,
          rolling: /rolling/i.test(b.line),
          url: url_m?.[1] ?? null,
          fit_note:
            b.line
              .split(/\*\*[^*]+\*\*/)[1]
              ?.replace(/^\s*-\s*/, "")
              .trim()
              ?.slice(0, 280) ?? null,
          status: b.checked
            ? status === "applied"
              ? "applied"
              : "skipped"
            : status,
          priority: prio_m ? `P${prio_m[1]}` : null,
          notes: b.raw,
        },
      });
    }
  }
}

function parseNetworkBacklog(
  file: ClassifiedFile,
  raw: string,
  acc: Accum,
): void {
  const { content: body } = matter(raw);
  const sections = parseSections(body);
  // Tier sections (## Tier 0 / Tier 1 / Tier 2 / Tier 4) + Cold funnel
  for (const sec of sections) {
    const tier_m = /Tier\s*([0-4])/i.exec(sec.heading);
    const isCold = /cold\s*funnel/i.test(sec.heading);
    if (!tier_m && !isCold) continue;
    const tier = tier_m ? Number(tier_m[1]) : 4;
    for (const b of parseBacklogBullets(sec.body)) {
      const name_m = /\*\*([^*]+)\*\*/.exec(b.line);
      const name = name_m?.[1] ?? b.line.slice(0, 80);
      const email_m = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.exec(
        b.line,
      );
      const url_m = /(https?:\/\/\S+)/.exec(b.line);
      const id = uuid5("hmart-contact", `${file.rel_path}#${name}`);
      const category = /podcast/i.test(b.line)
        ? "podcast"
        : /publication|magazine|editor|journal/i.test(b.line)
          ? "publication"
          : /gallery|curator|exhibition/i.test(b.line)
            ? "gallery"
            : /peer|artist|collaborator/i.test(b.line)
              ? "peer"
              : "other";
      acc.add({
        table: "network_contacts",
        id,
        source_path: file.rel_path,
        source_section: `## ${sec.heading}`,
        values: {
          id,
          user_id: "<<USER_ID>>",
          name,
          category,
          tier: tier === 0 ? 1 : tier, // tier 0 in vault = highest priority -> tier 1
          email: email_m?.[0] ?? null,
          website: url_m?.[1] ?? null,
          status: isCold ? "lead" : "in_relationship",
          notes: b.raw,
        },
      });
    }
  }
}

function parseShareBacklog(
  file: ClassifiedFile,
  raw: string,
  acc: Accum,
): void {
  const { content: body } = matter(raw);
  const sections = parseSections(body);
  // ## Doing + ## To Do + nested under ## Backlog
  const candidate_sections_raw = sections.filter(
    (s) =>
      /^(Doing|To Do)$/i.test(s.heading) ||
      s.body.includes("- [ ]") ||
      s.body.includes("- [x]"),
  );
  // Keep only leaf sections so a parent's body doesn't re-capture
  // bullets that belong to its nested subsections.
  const candidate_sections = candidate_sections_raw.filter(
    (s) =>
      !sections.some(
        (other) =>
          other.start_line > s.start_line &&
          other.end_line <= s.end_line &&
          other.level > s.level,
      ),
  );
  for (const sec of candidate_sections) {
    // Skip non-share-item sections (the very-long "To-dos for Claude" section in Share backlog is per-research-task; treat separately)
    if (/to-?dos for claude/i.test(sec.heading)) continue;
    for (const b of parseBacklogBullets(sec.body)) {
      const prio_m = /\[P([0-3])\]/.exec(b.line);
      const name_m = /\*\*([^*]+)\*\*/.exec(b.line);
      const date_m = /(\d{4}-\d{2}-\d{2})/.exec(b.line);
      const name = name_m?.[1] ?? b.line.slice(0, 100);
      // Arc detection
      const arc_m = /(CultureHub LA|culturehub)/i.exec(b.line);
      const arc_slug = arc_m ? "culturehub-la-2026" : null;
      // Touchpoint
      const tp = /post 1|announce/i.test(b.line)
        ? "announce"
        : /post 2|during/i.test(b.line)
          ? "during"
          : /post 3|post 4|post 5|after|reactions|teaser/i.test(b.line)
            ? "after"
            : null;
      // Status
      const status = b.checked
        ? "shipped"
        : /DRAFTED INLINE/i.test(b.line)
          ? "drafted"
          : /LOCKED/i.test(b.line)
            ? "locked"
            : /SLOT-SKIP/i.test(b.line)
              ? "slot_skipped"
              : /suggested/i.test(b.line)
                ? "suggested"
                : "backlog";
      // Format
      const format = /reel/i.test(b.line)
        ? "ig_reel"
        : /carousel/i.test(b.line)
          ? "ig_carousel"
          : /substack/i.test(b.line)
            ? "substack_post"
            : "ig_single";
      const kind = /reshare/i.test(b.line)
        ? "reshare"
        : /substack/i.test(b.line)
          ? "substack_essay"
          : /announce|prize|residency announce/i.test(b.line)
            ? "announcement"
            : /quote/i.test(b.line)
              ? "quote_card"
              : "work_share";
      const id = uuid5(
        "hmart-share",
        `${file.rel_path}#${sec.heading}#${b.raw}`,
      );
      acc.add({
        table: "share_items",
        id,
        source_path: file.rel_path,
        source_section: `## ${sec.heading}`,
        values: {
          id,
          user_id: "<<USER_ID>>",
          title: name,
          hook: null,
          kind,
          format,
          status,
          priority: prio_m ? `P${prio_m[1]}` : null,
          arc_slug,
          touchpoint: tp,
          target_slot_at: date_m?.[1] ?? null,
          notes: b.raw,
        },
      });
    }
  }
}

function parseLearnBacklog(
  file: ClassifiedFile,
  raw: string,
  acc: Accum,
  kind: "lit" | "tech",
): void {
  const { content: body } = matter(raw);
  const sections = parseSections(body);
  // Iterate leaf sections only (no nested deeper section) to avoid
  // visiting the same bullet twice when a parent section's body
  // includes the children's content.
  const leaves = sections.filter(
    (s) =>
      !sections.some(
        (other) =>
          other.start_line > s.start_line &&
          other.end_line <= s.end_line &&
          other.level > s.level,
      ),
  );
  for (const sec of leaves) {
    if (/to-?dos for claude/i.test(sec.heading)) continue;
    if (/^goal/i.test(sec.heading)) continue;
    for (const b of parseBacklogBullets(sec.body)) {
      const prio_m = /\[P([0-3])\]/.exec(b.line);
      const url_m = /(https?:\/\/\S+)/.exec(b.line);
      const tag_m = [...b.line.matchAll(/#([\w-]+)/g)].map((m) => m[1]!);
      const dl_m = /Deadline:\s*(\d{4}-\d{2}-\d{2})/.exec(b.line);
      const name_m =
        /\*\*([^*]+)\*\*/.exec(b.line) ?? /\[([^\]]+)\]\(/.exec(b.line);
      const title = name_m?.[1] ?? b.line.slice(0, 120);
      // Disambiguate by raw line so same-titled bullets with different
      // URLs (or descriptions) get distinct IDs.
      const id = uuid5(
        "hmart-learn",
        `${file.rel_path}#${sec.heading}#${b.raw}`,
      );
      acc.add({
        table: "learn_items",
        id,
        source_path: file.rel_path,
        source_section: `## ${sec.heading}`,
        values: {
          id,
          user_id: "<<USER_ID>>",
          kind,
          title,
          url: url_m?.[1] ?? null,
          source: file.rel_path,
          tags: tag_m,
          priority: prio_m ? `P${prio_m[1]}` : null,
          deadline: dl_m?.[1] ?? null,
          status: b.checked
            ? "done"
            : /^doing$/i.test(sec.heading)
              ? "doing"
              : "backlog",
          notes: b.raw,
        },
      });
    }
  }
}

// =============================================================================
// Sonnet inference pass
// =============================================================================

const INFERENCE_MAX_TOKENS = 4096;
const INFERENCE_CACHE = path.join(OUTPUT_DIR, ".inference-cache.jsonl");

function loadInferenceCache(): Map<
  string,
  { latent_tasks: InferenceTask[]; reservoir_updates: ReservoirUpdate[] }
> {
  const out = new Map();
  if (!existsSync(INFERENCE_CACHE)) return out;
  const txt = readFileSync(INFERENCE_CACHE, "utf8");
  for (const line of txt.split(/\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      out.set(entry.file, {
        latent_tasks: entry.latent_tasks ?? [],
        reservoir_updates: entry.reservoir_updates ?? [],
      });
    } catch {
      /* skip bad cache line */
    }
  }
  return out;
}

function appendInferenceCache(
  file: string,
  latent_tasks: InferenceTask[],
  reservoir_updates: ReservoirUpdate[],
) {
  const line = JSON.stringify({ file, latent_tasks, reservoir_updates }) + "\n";
  writeFileSync(INFERENCE_CACHE, line, { flag: "a" });
}

async function runInferencePass(
  file: ClassifiedFile,
  raw: string,
  acc: Accum,
  sonnetClient: any,
): Promise<void> {
  // Strip frontmatter + ## Tasks section so we only feed the prose to the model
  const { content: body } = matter(raw);
  const sections = parseSections(body);
  const taskSec = findSection(sections, "Tasks");
  const taskLines = taskSec
    ? taskSec.body.split(/\n/).filter(Boolean).length
    : 0;
  let prose = body;
  if (taskSec) {
    // Remove the ## Tasks section text from the prose we feed to Sonnet
    const before = body.split(/\n/).slice(0, taskSec.start_line).join("\n");
    const after = body
      .split(/\n/)
      .slice(taskSec.end_line + 1)
      .join("\n");
    prose = (before + "\n" + after).trim();
  }
  if (prose.length < 200) return; // not enough to bother

  const systemPrompt = `You are extracting LATENT TASKS from Halim Madi's prose markdown notes. These are project files, person files, decision docs - dense with reflections, hooks, roadmaps that often contain real action items NOT captured in any "## Tasks" checkbox section.

Return JSON with this exact shape:
{
  "latent_tasks": [
    {
      "title": "short imperative-form task title (start with a verb, ~10-20 words)",
      "priority_guess": "P0" | "P1" | "P2" | null,
      "deadline_guess": "YYYY-MM-DD" | null,
      "source_section": "the ## section heading where you found it, or 'prose' if no section",
      "evidence_quote": "verbatim 1-2 sentence quote from the source that justifies this task - max 240 chars",
      "confidence": 0.0 to 1.0
    }
  ],
  "reservoir_updates": []
}

Rules:
- Be CONSERVATIVE. Only extract concrete, actionable items. Skip philosophical reflections, descriptions of past work, definitions.
- Each task must have an evidence_quote that is verbatim text from the source (within 240 chars).
- For person files (## Hooks sections): each hook is usually a latent action ("propose op-ed pairing", "schedule Bowles lunch", etc.). Extract those.
- For project files: scan sections like ## Reflections, ## Roadmap, ## Priority focus, ## About, ## Next steps for directives.
- No em dashes anywhere. Use hyphen with spaces.
- If nothing actionable, return {"latent_tasks": [], "reservoir_updates": []}.

JSON only, no prose.`;

  const userPrompt = `File: ${file.rel_path}
Area: ${file.area_slug}
Explicit ## Tasks section had ${taskLines} bullets (already captured separately - DO NOT re-extract those).

Prose to analyze:
---
${prose.slice(0, 16000)}
---`;

  let parsed: {
    latent_tasks?: InferenceTask[];
    reservoir_updates?: ReservoirUpdate[];
  };
  try {
    const response = await sonnetClient.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: INFERENCE_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = response.content[0];
    if (!block || block.type !== "text") return;
    let text = block.text.trim();
    text = text
      .replace(/^```json?\s*/, "")
      .replace(/```$/, "")
      .trim();
    parsed = JSON.parse(text);
  } catch (err) {
    acc.errors.push({
      file: file.rel_path,
      error: `inference: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }
  try {
    const project_id = resolveProjectId(file);
    const area_id = AREA_UUID(file.area_slug);
    let pos = 1000; // start latent tasks at position 1000 so they sort after explicit ones
    for (const lt of parsed.latent_tasks ?? []) {
      acc.inferred_csv.push(lt);
      const todo_id = uuid5(
        "hmart-todo-inferred",
        `${file.rel_path}#${lt.title}`,
      );
      acc.add({
        table: "todos",
        id: todo_id,
        source_path: file.rel_path,
        source_section: lt.source_section,
        inferred: true,
        values: {
          id: todo_id,
          user_id: "<<USER_ID>>",
          area_id,
          project_id: file.file_class === "project" ? project_id : null,
          title: lt.title,
          state: "anytime",
          priority: lt.priority_guess,
          deadline: lt.deadline_guess,
          position: pos++,
          obsidian_uri: file.obsidian_uri,
          notes: `Inferred from ${file.rel_path} > ${lt.source_section}\n\nEvidence: ${lt.evidence_quote}`,
          metadata: {
            source: "body-inferred",
            source_file: file.rel_path,
            source_section: lt.source_section,
            evidence_quote: lt.evidence_quote,
            confidence: lt.confidence,
          },
        },
      });
    }
    for (const ru of parsed.reservoir_updates ?? []) {
      acc.reservoir_updates.push(ru);
    }
    // Persist to cache so subsequent runs skip this file
    appendInferenceCache(
      file.rel_path,
      parsed.latent_tasks ?? [],
      parsed.reservoir_updates ?? [],
    );
  } catch (err) {
    acc.errors.push({
      file: file.rel_path,
      error: `inference: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

function applyCachedInference(
  file: ClassifiedFile,
  cached: {
    latent_tasks: InferenceTask[];
    reservoir_updates: ReservoirUpdate[];
  },
  acc: Accum,
): void {
  const project_id = resolveProjectId(file);
  const area_id = AREA_UUID(file.area_slug);
  let pos = 1000;
  for (const lt of cached.latent_tasks) {
    acc.inferred_csv.push(lt);
    const todo_id = uuid5(
      "hmart-todo-inferred",
      `${file.rel_path}#${lt.title}`,
    );
    acc.add({
      table: "todos",
      id: todo_id,
      source_path: file.rel_path,
      source_section: lt.source_section,
      inferred: true,
      values: {
        id: todo_id,
        user_id: "<<USER_ID>>",
        area_id,
        project_id: file.file_class === "project" ? project_id : null,
        title: lt.title,
        state: "anytime",
        priority: lt.priority_guess,
        deadline: lt.deadline_guess,
        position: pos++,
        obsidian_uri: file.obsidian_uri,
        notes: `Inferred from ${file.rel_path} > ${lt.source_section}\n\nEvidence: ${lt.evidence_quote}`,
        metadata: {
          source: "body-inferred",
          source_file: file.rel_path,
          source_section: lt.source_section,
          evidence_quote: lt.evidence_quote,
          confidence: lt.confidence,
        },
      },
    });
  }
  for (const ru of cached.reservoir_updates) acc.reservoir_updates.push(ru);
}

// =============================================================================
// SQL builder
// =============================================================================

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "'{}'";
    const items = v.map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(",");
    return `'{${items}}'`;
  }
  if (typeof v === "object")
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validUuid(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s);
}
function coerceDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") {
    const m = /(\d{4}-\d{2}-\d{2})/.exec(v);
    return m ? m[1]! : null;
  }
  return null;
}

function rowToInsert(row: ParsedRow): string {
  const keys = Object.keys(row.values);
  const cols = keys.join(", ");
  const vals = keys.map((k) => sqlValue(row.values[k])).join(", ");
  return `insert into hmart.${row.table} (${cols}) values (${vals}) on conflict (id) do nothing;`;
}

function emitSql(acc: Accum): string {
  const lines: string[] = [];
  lines.push("-- Hmart vault import - generated by migration/import-vault.ts");
  lines.push("-- Replace <<USER_ID>> with your auth.users.id before applying.");
  lines.push("-- Run inside a single transaction:");
  lines.push("begin;");
  lines.push("");
  // Seed areas first
  const seenAreas = new Set<string>();
  for (const row of acc.rows) {
    const area_slug = (row.values["area_slug"] as string | undefined) ?? null;
    void area_slug;
  }
  lines.push("-- 1. Areas");
  const areaSlugs = [
    "admin",
    "apply",
    "earn",
    "learn",
    "make",
    "network",
    "share",
    "write",
  ];
  for (const s of areaSlugs) {
    if (seenAreas.has(s)) continue;
    seenAreas.add(s);
    lines.push(
      `insert into hmart.areas (id, user_id, slug, name, position) values ('${AREA_UUID(s)}', '<<USER_ID>>', '${s}', '${s}', ${areaSlugs.indexOf(s) + 1}) on conflict (id) do nothing;`,
    );
  }
  lines.push("");
  // Then in dependency order: projects, make_pieces, headings, todos, etc.
  const byTable: Record<string, ParsedRow[]> = {};
  for (const row of acc.rows) {
    (byTable[row.table] ??= []).push(row);
  }
  const orderedTables = [
    "make_pieces",
    "projects",
    "headings",
    "todos",
    "checklist_items",
    "tags",
    "todo_tags",
    "repeating_rules",
    "captures",
    "claude_tasks",
    "picker_runs",
    "memory_entries",
    "network_contacts",
    "apply_opportunities",
    "learn_items",
    "learn_wikis",
    "write_drafts",
    "outings_events",
    "share_items",
    "surfaced_from",
  ];
  for (const t of orderedTables) {
    if (!byTable[t]) continue;
    lines.push(`-- ${t} (${byTable[t]!.length} rows)`);
    for (const r of byTable[t]!) lines.push(rowToInsert(r));
    lines.push("");
  }
  lines.push("commit;");
  return lines.join("\n");
}

// =============================================================================
// Report writers
// =============================================================================

function writeDryRunReport(acc: Accum, files: ClassifiedFile[]): void {
  const totals: Record<string, number> = {};
  for (const r of acc.rows) totals[r.table] = (totals[r.table] ?? 0) + 1;
  const explicit_todos = acc.rows.filter(
    (r) => r.table === "todos" && !r.inferred,
  ).length;
  const inferred_todos = acc.rows.filter(
    (r) => r.table === "todos" && r.inferred,
  ).length;
  const classified: Record<string, number> = {};
  for (const f of files)
    classified[f.file_class] = (classified[f.file_class] ?? 0) + 1;

  const lines: string[] = [];
  lines.push("# Vault -> hmart dry-run report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Vault root: ${VAULT_ROOT}`);
  lines.push(`Total .md files seen: ${files.length}`);
  lines.push("");
  lines.push("## File classification");
  for (const [cls, n] of Object.entries(classified).sort(
    (a, b) => b[1] - a[1],
  )) {
    lines.push(`- ${cls.padEnd(20)} ${n}`);
  }
  lines.push("");
  lines.push("## Proposed rows by table");
  for (const [t, n] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${t.padEnd(22)} ${n}`);
  }
  lines.push("");
  lines.push(`Explicit todos (from ## Tasks): **${explicit_todos}**`);
  lines.push(`Sonnet-inferred todos:          **${inferred_todos}**`);
  lines.push(
    `Reservoir field updates:        **${acc.reservoir_updates.length}**`,
  );
  lines.push(`Errors:                         **${acc.errors.length}**`);
  lines.push("");
  if (acc.errors.length) {
    lines.push("## Errors");
    for (const e of acc.errors) lines.push(`- ${e.file}: ${e.error}`);
    lines.push("");
  }
  lines.push("## Per-file breakdown");
  for (const f of files) {
    const counts = acc.per_file_counts[f.rel_path];
    if (!counts) {
      if (f.file_class !== "skip") lines.push(`- (no rows)  ${f.rel_path}`);
      continue;
    }
    const parts = Object.entries(counts)
      .map(([t, n]) => `${t}:${n}`)
      .join(" ");
    lines.push(`- ${parts.padEnd(60)} ${f.rel_path}`);
  }
  writeFileSync(path.join(OUTPUT_DIR, "dry-run-report.md"), lines.join("\n"));
}

function writeInferredCsv(acc: Accum): void {
  const lines: string[] = [];
  lines.push(
    "source_file,source_section,priority_guess,deadline_guess,confidence,title,evidence_quote",
  );
  for (const t of acc.inferred_csv) {
    const csv = (s: string) =>
      `"${String(s).replace(/"/g, '""').replace(/\n/g, " ")}"`;
    lines.push(
      [
        csv(t.evidence_quote ? "(see evidence)" : "?"),
        csv(t.source_section),
        csv(t.priority_guess ?? ""),
        csv(t.deadline_guess ?? ""),
        String(t.confidence ?? ""),
        csv(t.title),
        csv(t.evidence_quote),
      ].join(","),
    );
  }
  writeFileSync(path.join(OUTPUT_DIR, "inferred-tasks.csv"), lines.join("\n"));
}

// =============================================================================
// Main
// =============================================================================

async function loadDotenv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const txt = readFileSync(envPath, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");
  const dryRun = !apply;
  const skipInference = args.has("--no-inference");

  await loadDotenv();
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(
    `mode: ${apply ? "APPLY" : "DRY-RUN"}${skipInference ? " (no Sonnet inference)" : ""}`,
  );
  console.log(`vault: ${VAULT_ROOT}`);

  const all_paths = walk(VAULT_ROOT);
  console.log(`scanning ${all_paths.length} .md files...`);
  const files = all_paths.map(classifyFile);
  const acc = new Accum();

  const inferenceFiles: ClassifiedFile[] = [];

  for (const f of files) {
    if (f.file_class === "skip") continue;
    let raw: string;
    try {
      raw = readFileSync(f.abs_path, "utf8");
    } catch (e) {
      acc.errors.push({
        file: f.rel_path,
        error: `read: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }

    try {
      switch (f.file_class) {
        case "project":
          parseProject(f, raw, acc);
          if (INFERENCE_PASS_AREAS.has(f.area_slug)) inferenceFiles.push(f);
          break;
        case "person":
          parsePerson(f, raw, acc);
          inferenceFiles.push(f);
          break;
        case "wiki":
          parseWiki(f, raw, acc);
          break;
        case "make_wiki":
          parseMemory(f, raw, acc, "reference", `area:make`);
          break;
        case "write_active":
          parseWriteDraft(f, raw, acc, "active");
          break;
        case "write_completed":
          parseWriteDraft(f, raw, acc, "completed");
          break;
        case "apply_backlog":
          parseApplyBacklog(f, raw, acc);
          break;
        case "network_backlog":
          parseNetworkBacklog(f, raw, acc);
          break;
        case "share_backlog":
          parseShareBacklog(f, raw, acc);
          break;
        case "learn_lit_backlog":
          parseLearnBacklog(f, raw, acc, "lit");
          break;
        case "learn_tech_backlog":
          parseLearnBacklog(f, raw, acc, "tech");
          break;
        case "generic_backlog":
        case "make_backlog":
          parseMemory(f, raw, acc, "reference", `area:${f.area_slug}`);
          break;
        case "capture":
          parseCapture(f, raw, acc);
          break;
        case "raw_kindle":
        case "raw_notes":
        case "raw_transcripts":
        case "raw_web":
        case "raw_matter":
          parseMemory(f, raw, acc, "reference", `area:learn`);
          break;
        case "memory_global":
          parseMemory(f, raw, acc, "user_rule", "global");
          break;
        case "memory_area":
          if (f.filename.toLowerCase().includes("claude.md"))
            parseMemory(f, raw, acc, "project_rule", `area:${f.area_slug}`);
          else parseMemory(f, raw, acc, "reference", `area:${f.area_slug}`);
          break;
        case "memory_decision":
          parseMemory(f, raw, acc, "reference", `area:${f.area_slug}`);
          inferenceFiles.push(f);
          break;
        case "memory_okrs":
          parseMemory(f, raw, acc, "reference", "global");
          break;
      }
    } catch (e) {
      acc.errors.push({
        file: f.rel_path,
        error: `parse: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  console.log(
    `structural pass: ${acc.rows.length} rows, ${acc.errors.length} errors`,
  );

  // Inference pass with caching: cache hits skip the API call
  if (
    !skipInference &&
    inferenceFiles.length > 0 &&
    process.env.ANTHROPIC_API_KEY
  ) {
    const cache = loadInferenceCache();
    const toRun: ClassifiedFile[] = [];
    let cached = 0;
    for (const f of inferenceFiles) {
      const hit = cache.get(f.rel_path);
      if (hit) {
        applyCachedInference(f, hit, acc);
        cached++;
      } else {
        toRun.push(f);
      }
    }
    console.log(
      `inference pass: ${inferenceFiles.length} files total, ${cached} cached, ${toRun.length} to call Sonnet for...`,
    );
    if (toRun.length > 0) {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const sonnet = new Anthropic();
      const CONCURRENCY = 5;
      let done = 0;
      const queue = [...toRun];
      async function worker() {
        while (queue.length > 0) {
          const f = queue.shift();
          if (!f) break;
          const raw = readFileSync(f.abs_path, "utf8");
          await runInferencePass(f, raw, acc, sonnet);
          done++;
          if (done % 5 === 0 || done === toRun.length) {
            console.log(`  inference progress: ${done}/${toRun.length}`);
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    }
    console.log(
      `inference complete: ${acc.inferred_csv.length} latent tasks extracted (${cached} from cache, ${toRun.length - acc.errors.filter((e) => e.error.startsWith("inference")).length} new)`,
    );
  } else if (skipInference) {
    console.log("inference pass: skipped (--no-inference)");
  } else {
    console.log("inference pass: skipped (ANTHROPIC_API_KEY not set)");
  }

  // Outputs
  writeDryRunReport(acc, files);
  writeInferredCsv(acc);
  writeFileSync(path.join(OUTPUT_DIR, "proposed-inserts.sql"), emitSql(acc));
  writeFileSync(
    path.join(OUTPUT_DIR, "reservoir-updates.json"),
    JSON.stringify(acc.reservoir_updates, null, 2),
  );

  console.log("");
  console.log(`dry-run output written to ${OUTPUT_DIR}/`);
  console.log("  - dry-run-report.md");
  console.log("  - inferred-tasks.csv");
  console.log("  - proposed-inserts.sql");
  console.log("  - reservoir-updates.json");
  if (apply) {
    console.log("");
    console.log(
      "APPLY MODE: this script does not directly apply SQL to Supabase.",
    );
    console.log(
      "Review the .sql file, replace <<USER_ID>> with your auth.users.id, then apply via the MCP execute_sql tool or psql.",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
