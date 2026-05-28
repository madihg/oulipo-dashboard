#!/usr/bin/env tsx
/**
 * import-network.ts
 *
 * Exhaustive import of /Users/halim/Documents/second-brain/A5. Network/
 * into hmart.network_contacts.
 *
 * Modes:
 *   --dry-run (default) writes migration/output/network-import.json for review.
 *   --apply             upserts to Supabase via the management API.
 *
 * Idempotent: uses (user_id, lower(name)) unique index. Re-running merges.
 *
 * Parses 4 layers of _Backlog_.md:
 *   1. Tiered Contacts (Tier 0-4)
 *   2. EO-May Cold funnel (5+5+5+5)
 *   3. Active Outreach by Category (16 subsections)
 *   4. To Process subsections + Berkeley cohort
 *
 * Plus per-person `.md` files (Nina Beguš today; treat each as authoritative
 * via frontmatter `tier`, `status`, `last_connected`).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VAULT_NETWORK = "/Users/halim/Documents/second-brain/A5. Network";
const BACKLOG_FILE = path.join(VAULT_NETWORK, "_Backlog_.md");
const OUTPUT_DIR = path.resolve(__dirname, "output");
const USER_ID = "df1577cd-f581-4d5c-95af-a07b1f0126f2";

type Tier = 0 | 1 | 2 | 3 | 4 | null;
type Category =
  | "podcast"
  | "publication"
  | "gallery"
  | "peer"
  | "curator"
  | "journalist"
  | "org"
  | "collector"
  | "other"
  | "fan_mail"
  | "fellow_artist"
  | "art_institution"
  | "residency"
  | "conference"
  | "ally"
  | "gather"
  | "marketing_partner"
  | "dialog"
  | "shows_stages"
  | "wikitongues"
  | "pm_corporate_workshop"
  | "money"
  | "cohort"
  | "tbd";
type Status =
  | "lead"
  | "contacted"
  | "responded"
  | "meeting_scheduled"
  | "in_relationship"
  | "dormant";

interface Contact {
  user_id: string;
  name: string;
  category: Category;
  category_label?: string;
  tier?: Tier;
  tier_cadence_label?: string;
  email?: string;
  phone?: string;
  twitter?: string;
  instagram?: string;
  website?: string;
  status?: Status;
  hook?: string;
  last_touch_at?: string;
  intro_source?: string;
  warm_bridge?: string;
  notes?: string;
  vault_section?: string;
  social?: Record<string, string>;
  aliases?: string[];
}

const CADENCE_LABEL: Record<number, string> = {
  0: "monthly",
  1: "quarterly",
  2: "biannual",
  3: "twice yearly",
  4: "yearly",
};

// =============================================================================
// Section parser - splits the backlog into headed sections
// =============================================================================

interface Section {
  level: number;
  heading: string;
  body: string;
  start_line: number;
  end_line: number;
}

function parseSections(md: string): Section[] {
  const lines = md.split(/\r?\n/);
  const headings: { line: number; level: number; heading: string }[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (/^```/.test(l)) inFence = !inFence;
    if (inFence) continue;
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
    const endA = (sameOrShallower ? sameOrShallower.line : lines.length) - 1;
    out.push({
      level: cur.level,
      heading: cur.heading,
      body: lines
        .slice(cur.line + 1, endA + 1)
        .join("\n")
        .trim(),
      start_line: cur.line,
      end_line: endA,
    });
  }
  return out;
}

function findSection(secs: Section[], heading: string): Section | undefined {
  const n = heading.toLowerCase();
  return secs.find((s) => s.heading.toLowerCase() === n);
}

// =============================================================================
// Bullet parser - top-level `- ` or `- [ ]` items; flush on blank/next bullet
// =============================================================================

interface Bullet {
  raw: string;
  text: string; // content after the leading `-` (and checkbox if present)
  checked: boolean | null; // null when no checkbox
}

function parseBullets(text: string): Bullet[] {
  const out: Bullet[] = [];
  const lines = text.split(/\n/);
  let cur: Bullet | null = null;
  for (const l of lines) {
    const cb = /^- \[( |x)\]\s+(.+)$/.exec(l);
    const plain = !cb ? /^- (.+)$/.exec(l) : null;
    if (cb) {
      if (cur) out.push(cur);
      cur = { raw: l, text: cb[2]!, checked: cb[1] === "x" };
    } else if (plain) {
      if (cur) out.push(cur);
      cur = { raw: l, text: plain[1]!, checked: null };
    } else if (cur && /^\s+\S/.test(l)) {
      cur.text += " " + l.trim();
      cur.raw += "\n" + l;
    } else if (l.trim() === "" && cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// =============================================================================
// Field extractors
// =============================================================================

function extractName(text: string): string | null {
  // Bold first: **Name** or **Name** (suffix)
  const bold = /\*\*([^*]+)\*\*/.exec(text);
  if (bold) {
    let name = bold[1]!.trim();
    // Strip trailing parenthetical that looks like an email or role
    name = name.replace(/\s+\([^)]+@[^)]+\)$/, "");
    name = name.replace(/\s+\([^)]+\)$/, "");
    return name;
  }
  // Fallback: leading non-list text before " - "
  const dash = text.split(/\s+-\s+/, 1)[0]?.trim();
  if (dash && dash.length < 80) return dash;
  return null;
}

function extractEmail(text: string): string | undefined {
  const m = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i.exec(text);
  return m?.[1]?.toLowerCase();
}

function extractWebsite(text: string): string | undefined {
  const m =
    /(https?:\/\/[^\s,)]+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s,)]*)?)/i.exec(
      text,
    );
  if (!m) return undefined;
  const v = m[1]!;
  // Reject if it's actually an email or markdown-link junk
  if (/@/.test(v)) return undefined;
  return v.replace(/[.,)]+$/, "");
}

function extractLastConnected(text: string): string | undefined {
  // "Last connected: March 2026" / "Last connected: 2026-05-04" / "Reached out 2025-09-15"
  const yyyy_mm_dd = /Last connected:\s*(\d{4}-\d{2}-\d{2})/i.exec(text);
  if (yyyy_mm_dd) return yyyy_mm_dd[1];
  const month = /Last connected:\s*([A-Za-z]+ \d{4})/i.exec(text);
  if (month) {
    const d = new Date(month[1]! + " 01");
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const reached =
    /(?:Reached out|Sent|Emailed|Spoke|Last contacted)[^\d]*(\d{4}-\d{2}-\d{2})/i.exec(
      text,
    );
  if (reached) return reached[1];
  return undefined;
}

function extractPriority(text: string): "P0" | "P1" | "P2" | null {
  const m = /\[(P[012])\]/i.exec(text);
  return (m?.[1]?.toUpperCase() as "P0" | "P1" | "P2") ?? null;
}

function extractInstagram(text: string): string | undefined {
  const m = /@([a-z0-9_.]+)\b/i.exec(text);
  if (m && !text.toLowerCase().includes(`@${m[1]!}.com`)) return m[1];
  return undefined;
}

function pickStatusFromText(text: string, checked: boolean | null): Status {
  const lc = text.toLowerCase();
  if (checked === true) return "in_relationship"; // closed/connected bullets in Done sections
  if (/\[pursuing\]/i.test(text)) return "contacted";
  if (/\[active\]/i.test(text)) return "contacted";
  if (/\[later\]/i.test(text)) return "lead";
  if (lc.includes("responded positively") || lc.includes("warm"))
    return "responded";
  if (
    lc.includes("draft ready") ||
    lc.includes("gmail draft") ||
    lc.includes("staged")
  )
    return "contacted";
  if (lc.includes("meeting") || lc.includes("coffee planned"))
    return "meeting_scheduled";
  return "lead";
}

// =============================================================================
// Category mapping - the vault subsection -> our widened enum
// =============================================================================

const SECTION_TO_CATEGORY: Record<string, Category> = {
  "fan mail": "fan_mail",
  "fellow artist": "fellow_artist",
  "art institution": "art_institution",
  gallery: "gallery",
  residency: "residency",
  conferences: "conference",
  "art workshop": "fellow_artist",
  "pm work / corporate workshops": "pm_corporate_workshop",
  wikitongues: "wikitongues",
  allies: "ally",
  gather: "gather",
  $$$: "money",
  "marketing partner": "marketing_partner",
  "dialog (requests)": "dialog",
  heart: "fan_mail",
  tbd: "tbd",
  "shows / stages": "shows_stages",
};

function categoryFromCold(heading: string): Category {
  // Cold funnel - infer category from bullet hints
  return "other";
}

function categoryFromCold5(text: string, fallback: Category): Category {
  const lc = text.toLowerCase();
  if (lc.includes("podcast")) return "podcast";
  if (
    lc.includes("publication") ||
    lc.includes("nytimes") ||
    lc.includes("artnews")
  )
    return "publication";
  if (lc.includes("gallery")) return "gallery";
  if (lc.includes("peer") || lc.includes("artist")) return "peer";
  if (lc.includes("residency")) return "residency";
  return fallback;
}

// =============================================================================
// Source parsers per section
// =============================================================================

function parseTier(
  section: Section,
  tier: Tier,
  contacts: Map<string, Contact>,
): void {
  for (const b of parseBullets(section.body)) {
    const name = extractName(b.text);
    if (!name) continue;
    const c: Contact = {
      user_id: USER_ID,
      name,
      category: "other",
      category_label: section.heading,
      tier,
      tier_cadence_label: tier !== null ? CADENCE_LABEL[tier] : undefined,
      email: extractEmail(b.text),
      website: extractWebsite(b.text),
      instagram: extractInstagram(b.text),
      status: pickStatusFromText(b.text, b.checked),
      last_touch_at: extractLastConnected(b.text),
      hook: b.text.slice(0, 280),
      notes: b.raw,
      vault_section: `Tiered Contacts > ${section.heading}`,
    };
    mergeContact(contacts, c);
  }
}

function parseColdFunnel(
  section: Section,
  contacts: Map<string, Contact>,
): void {
  for (const b of parseBullets(section.body)) {
    const name = extractName(b.text);
    if (!name) continue;
    const c: Contact = {
      user_id: USER_ID,
      name,
      category: categoryFromCold5(b.text, "other"),
      category_label: "Cold funnel EO-May 2026",
      email: extractEmail(b.text),
      website: extractWebsite(b.text),
      instagram: extractInstagram(b.text),
      status: pickStatusFromText(b.text, b.checked),
      hook: b.text.slice(0, 280),
      notes: b.raw,
      vault_section: `Cold funnel - EO-May 2026 push`,
    };
    mergeContact(contacts, c);
  }
}

function parseActiveOutreachByCategory(
  parentSection: Section,
  allSections: Section[],
  contacts: Map<string, Contact>,
): void {
  // Find the subsections (level=4) that belong to this parent
  for (const sec of allSections) {
    if (
      sec.level !== 4 ||
      sec.start_line < parentSection.start_line ||
      sec.start_line > parentSection.end_line
    )
      continue;
    const lc = sec.heading.toLowerCase().replace(/\\/g, "");
    const cat = SECTION_TO_CATEGORY[lc] ?? "other";
    for (const b of parseBullets(sec.body)) {
      const name = extractName(b.text);
      if (!name) continue;
      const c: Contact = {
        user_id: USER_ID,
        name,
        category: cat,
        category_label: sec.heading,
        email: extractEmail(b.text),
        website: extractWebsite(b.text),
        instagram: extractInstagram(b.text),
        status: pickStatusFromText(b.text, b.checked),
        hook: b.text.slice(0, 280),
        notes: b.raw,
        vault_section: `Active Outreach > ${sec.heading}`,
      };
      mergeContact(contacts, c);
    }
  }
}

function parseToProcess(
  parentSection: Section,
  allSections: Section[],
  contacts: Map<string, Contact>,
): void {
  for (const sec of allSections) {
    if (
      sec.level !== 4 ||
      sec.start_line < parentSection.start_line ||
      sec.start_line > parentSection.end_line
    )
      continue;
    const lc = sec.heading.toLowerCase();
    const isCohort = lc.includes("cohort") || lc.includes("berkeley");
    const cat: Category = isCohort ? "cohort" : "tbd";
    for (const b of parseBullets(sec.body)) {
      const name = extractName(b.text);
      if (!name) continue;
      const c: Contact = {
        user_id: USER_ID,
        name,
        category: cat,
        category_label: sec.heading,
        email: extractEmail(b.text),
        website: extractWebsite(b.text),
        instagram: extractInstagram(b.text),
        status: "lead",
        hook: b.text.slice(0, 280),
        notes: b.raw,
        vault_section: `To Process > ${sec.heading}`,
      };
      mergeContact(contacts, c);
    }
  }
}

// Per-person frontmatter status -> enum mapping. "warm-reconnect" etc are
// working labels and don't map 1:1 to the network_status enum.
const STATUS_FROM_FM: Record<string, Status> = {
  "warm-reconnect": "responded",
  "warm reconnect": "responded",
  warm: "responded",
  cold: "lead",
  pursuing: "contacted",
  active: "contacted",
};
function normalizeStatus(raw: string | undefined): Status {
  if (!raw) return "lead";
  const lc = raw.toLowerCase().trim();
  if (lc in STATUS_FROM_FM) return STATUS_FROM_FM[lc]!;
  const valid: Status[] = [
    "lead",
    "contacted",
    "responded",
    "meeting_scheduled",
    "in_relationship",
    "dormant",
  ];
  return (valid as string[]).includes(lc) ? (lc as Status) : "lead";
}

function parsePerPersonFile(
  file: string,
  contacts: Map<string, Contact>,
): void {
  const raw = readFileSync(file, "utf8");
  const { data: fm, content } = matter(raw);
  const name = (fm.name as string) ?? path.basename(file, ".md");
  const tier =
    typeof fm.tier === "number"
      ? (fm.tier as Tier)
      : typeof fm.tier === "string" && /^\d$/.test(fm.tier)
        ? (Number(fm.tier) as Tier)
        : null;
  const last_connected =
    typeof fm.last_connected === "string" ? fm.last_connected : undefined;
  const c: Contact = {
    user_id: USER_ID,
    name,
    category: "other",
    tier,
    tier_cadence_label:
      tier !== null && tier !== undefined ? CADENCE_LABEL[tier] : undefined,
    status: normalizeStatus(fm.status as string | undefined),
    last_touch_at: last_connected,
    notes: content.slice(0, 4000),
    vault_section: `per-person file: ${path.basename(file)}`,
  };
  mergeContact(contacts, c);
}

// =============================================================================
// Merge logic - dedup by lowercase name, prefer richer fields
// =============================================================================

function mergeContact(contacts: Map<string, Contact>, c: Contact): void {
  const key = c.name.toLowerCase();
  const existing = contacts.get(key);
  if (!existing) {
    contacts.set(key, c);
    return;
  }
  // Merge: prefer earlier values for primary fields, append vault_section
  const merged: Contact = {
    ...existing,
    email: existing.email ?? c.email,
    website: existing.website ?? c.website,
    instagram: existing.instagram ?? c.instagram,
    last_touch_at: existing.last_touch_at ?? c.last_touch_at,
    hook: existing.hook ?? c.hook,
    notes: (existing.notes ?? "") + "\n---\n" + (c.notes ?? ""),
    vault_section:
      (existing.vault_section ?? "") + " | " + (c.vault_section ?? ""),
    // Tier: keep first non-null
    tier: existing.tier ?? c.tier,
    tier_cadence_label: existing.tier_cadence_label ?? c.tier_cadence_label,
    // Status: upgrade towards "in_relationship" if seen
    status: pickHigherStatus(existing.status, c.status),
    // Category: keep first non-"other"/"tbd"
    category:
      existing.category !== "other" && existing.category !== "tbd"
        ? existing.category
        : c.category,
    category_label: existing.category_label ?? c.category_label,
    aliases: Array.from(
      new Set([...(existing.aliases ?? []), ...(c.aliases ?? [])]),
    ),
  };
  contacts.set(key, merged);
}

const STATUS_RANK: Record<string, number> = {
  lead: 0,
  contacted: 1,
  responded: 2,
  meeting_scheduled: 3,
  in_relationship: 4,
  dormant: -1,
};
function pickHigherStatus(a?: Status, b?: Status): Status | undefined {
  if (!a) return b;
  if (!b) return a;
  return (STATUS_RANK[a] ?? 0) >= (STATUS_RANK[b] ?? 0) ? a : b;
}

// =============================================================================
// Main
// =============================================================================

function main() {
  const apply = process.argv.includes("--apply");
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!existsSync(BACKLOG_FILE)) {
    console.error(`backlog not found: ${BACKLOG_FILE}`);
    process.exit(1);
  }

  const md = readFileSync(BACKLOG_FILE, "utf8");
  const secs = parseSections(md);
  const contacts = new Map<string, Contact>();

  // --- Tiered Contacts ---
  for (const [name, tier] of [
    ["Tier 0 - Monthly", 0],
    ["Tier 1 - Quarterly", 1],
    ["Tier 2 - Biannually", 2],
    ["Tier 3 - Twice yearly", 3],
    ["Tier 4 - Yearly", 4],
  ] as const) {
    const sec = findSection(secs, name);
    if (sec) parseTier(sec, tier as Tier, contacts);
  }

  // --- Cold funnel ---
  const cold = findSection(
    secs,
    "Cold funnel - EO-May 2026 push (drafts ready)",
  );
  if (cold) parseColdFunnel(cold, contacts);

  // --- Active Outreach by Category ---
  const active = findSection(secs, "Active Outreach by Category");
  if (active) parseActiveOutreachByCategory(active, secs, contacts);

  // --- To Process ---
  const toProcess = findSection(secs, "To Process (uncategorized inbox)");
  if (toProcess) parseToProcess(toProcess, secs, contacts);

  // --- Other top-level sections that might hold bullets ---
  for (const heading of [
    "Intros (double opt-in, drafts ready)",
    "Other outreach (drafts ready)",
    "SF Mozilla folx (sf-mozilla-folx)",
    "Standing practice (added from 5^4 coaching brief 2026-04-28)",
    "Add to newsletter outreach",
    "SF Peeps text thread",
    "ELO Academics",
    "Pending Actions",
    "Galleries (extra)",
  ]) {
    const s = findSection(secs, heading);
    if (!s) continue;
    for (const b of parseBullets(s.body)) {
      const name = extractName(b.text);
      if (!name) continue;
      const c: Contact = {
        user_id: USER_ID,
        name,
        category: "other",
        category_label: s.heading,
        email: extractEmail(b.text),
        website: extractWebsite(b.text),
        instagram: extractInstagram(b.text),
        status: pickStatusFromText(b.text, b.checked),
        hook: b.text.slice(0, 280),
        notes: b.raw,
        vault_section: s.heading,
      };
      mergeContact(contacts, c);
    }
  }

  // --- Done sections (closed loops; status=in_relationship) ---
  const done = findSection(secs, "Done");
  if (done) {
    for (const sub of secs) {
      if (
        sub.level !== 4 ||
        sub.start_line < done.start_line ||
        sub.start_line > done.end_line
      )
        continue;
      for (const b of parseBullets(sub.body)) {
        const name = extractName(b.text);
        if (!name) continue;
        const c: Contact = {
          user_id: USER_ID,
          name,
          category: "other",
          category_label: sub.heading.replace(/\(done\)/i, "").trim(),
          status: "in_relationship",
          last_touch_at: extractLastConnected(b.text),
          hook: b.text.slice(0, 280),
          notes: b.raw,
          vault_section: `Done > ${sub.heading}`,
        };
        mergeContact(contacts, c);
      }
    }
  }

  // --- Per-person files ---
  const perPersonCandidates = readdirSync(VAULT_NETWORK)
    .filter((f) => f.endsWith(".md"))
    .filter(
      (f) =>
        !f.startsWith("_") &&
        !f.startsWith("P0") &&
        !f.startsWith("P1") &&
        !f.startsWith("PN") &&
        !f.startsWith("PX") &&
        f !== "CLAUDE.md" &&
        f !== "Network-Briefing.md",
    );
  for (const fname of perPersonCandidates) {
    parsePerPersonFile(path.join(VAULT_NETWORK, fname), contacts);
  }

  const rows = Array.from(contacts.values());

  // Counts by category for sanity check
  const byCategory: Record<string, number> = {};
  const byTier: Record<string, number> = {};
  for (const c of rows) {
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
    const tk =
      c.tier === null || c.tier === undefined ? "null" : String(c.tier);
    byTier[tk] = (byTier[tk] ?? 0) + 1;
  }

  const summary = {
    total: rows.length,
    by_category: byCategory,
    by_tier: byTier,
    apply,
  };

  console.log(JSON.stringify(summary, null, 2));

  writeFileSync(
    path.join(OUTPUT_DIR, "network-import.json"),
    JSON.stringify({ rows, summary }, null, 2),
  );

  if (apply) {
    void applyUpserts(rows);
  } else {
    console.log(
      `\ndry-run complete. ${rows.length} contacts staged.\nreview ${path.join(OUTPUT_DIR, "network-import.json")}, then re-run with --apply.`,
    );
  }
}

async function applyUpserts(rows: Contact[]): Promise<void> {
  const url =
    process.env.SUPABASE_URL ?? "https://smytgqkgomsfyurskpcl.supabase.co";
  const token = process.env.SUPABASE_MGMT_TOKEN ?? process.env.SBP_TOKEN;
  if (!token) {
    console.error("SUPABASE_MGMT_TOKEN env var required for --apply");
    process.exit(1);
  }
  console.log(`upserting ${rows.length} rows via management API...`);
  // Chunk to avoid request size limits
  const CHUNK = 50;
  let landed = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const sql = buildUpsertSql(chunk);
    const resp = await fetch(
      `https://api.supabase.com/v1/projects/smytgqkgomsfyurskpcl/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      },
    );
    if (!resp.ok) {
      console.error(`chunk ${i}/${rows.length} failed:`, await resp.text());
      continue;
    }
    landed += chunk.length;
    console.log(
      `  chunk ${Math.floor(i / CHUNK) + 1}: ok (${landed}/${rows.length})`,
    );
  }
}

function sqlString(v: string | null | undefined): string {
  if (v === null || v === undefined) return "null";
  return `'${v.replace(/'/g, "''")}'`;
}
function sqlJson(v: unknown): string {
  if (v === null || v === undefined) return "null";
  return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
}
function sqlArray(v: string[] | undefined): string {
  if (!v || !v.length) return "'{}'::text[]";
  return `ARRAY[${v.map((s) => sqlString(s)).join(",")}]::text[]`;
}
function sqlInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "null";
  return String(v);
}

function buildUpsertSql(rows: Contact[]): string {
  const values = rows.map((r) => {
    return `(${[
      sqlString(r.user_id),
      sqlString(r.name),
      sqlString(r.category),
      sqlInt(r.tier ?? null),
      sqlString(r.email ?? null),
      sqlString(r.phone ?? null),
      sqlString(r.twitter ?? null),
      sqlString(r.instagram ?? null),
      sqlString(r.website ?? null),
      sqlString(r.status ?? "lead"),
      sqlString(r.hook ?? null),
      sqlString(r.last_touch_at ?? null),
      sqlString(r.warm_bridge ?? null),
      sqlString(r.notes ?? null),
      sqlString(r.category_label ?? null),
      sqlString(r.tier_cadence_label ?? null),
      sqlString(r.intro_source ?? null),
      sqlJson(r.social ?? {}),
      sqlArray(r.aliases ?? []),
      sqlString(r.vault_section ?? null),
    ].join(",")})`;
  });
  return `insert into hmart.network_contacts (
  user_id, name, category, tier, email, phone, twitter, instagram, website,
  status, hook, last_touch_at, warm_bridge, notes,
  category_label, tier_cadence_label, intro_source, social, aliases, vault_section
) values
${values.join(",\n")}
on conflict (user_id, lower(name)) do update set
  category = excluded.category,
  tier = coalesce(excluded.tier, hmart.network_contacts.tier),
  email = coalesce(excluded.email, hmart.network_contacts.email),
  twitter = coalesce(excluded.twitter, hmart.network_contacts.twitter),
  instagram = coalesce(excluded.instagram, hmart.network_contacts.instagram),
  website = coalesce(excluded.website, hmart.network_contacts.website),
  status = excluded.status,
  hook = coalesce(excluded.hook, hmart.network_contacts.hook),
  last_touch_at = coalesce(excluded.last_touch_at, hmart.network_contacts.last_touch_at),
  notes = excluded.notes,
  category_label = coalesce(excluded.category_label, hmart.network_contacts.category_label),
  tier_cadence_label = coalesce(excluded.tier_cadence_label, hmart.network_contacts.tier_cadence_label),
  vault_section = excluded.vault_section;`;
}

main();
