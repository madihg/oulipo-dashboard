# Vault → Supabase migration plan

Lossless port of `~/Documents/second-brain` into the `hmart` schema in `oulipo_main`.

**Promise.** Every line in every active markdown file becomes one or more rows in Supabase. Generated artifacts (briefings) and sync-conflict files are skipped explicitly and named below. The vault stays on disk unchanged through this phase; we archive only after you sign off.

## Two-pass extraction (added 2026-05-18 after Halim flagged latent tasks in prose)

`## Tasks` checkboxes are the explicit surface. But high-density prose files (project bodies, person Hooks sections, health decision docs, wealth plans) carry **latent tasks** the deterministic parser will miss: a Reflections paragraph that says "reimagine the Singulars page so a smart stranger gets it in <1s" is a real P0 todo, not just notes. Same with Nina Beguš's `## Hooks` section ("propose Bowles lunch in July 15-Aug 31 window, gated by knee surgery 2026-05-28").

The importer runs **two passes per high-density file**:

1. **Structural pass (no LLM, pure parser):** frontmatter + `## Tasks` checkboxes + `## Hooks` / `## Doing` / `## Done` sections → explicit todos / reservoir rows.
2. **Inference pass (Sonnet, ~80 files):** the rest of the body → latent todos + reservoir updates, each with `metadata.source = 'body-inferred'`, `metadata.source_file`, `metadata.source_section`, `metadata.evidence_quote` (verbatim), `metadata.confidence`. The dry-run report includes a reviewable CSV of every inferred task so you accept/reject before apply.

### Which files get the LLM pass

| File class                                    | Inference pass?                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| Pn / Px / PN project files (~60)              | YES - every section before/after `## Tasks` (Reflections, Roadmap, About, etc.) |
| Network person files (~9)                     | YES - `## Hooks` and "Why P0" are full of pending actions phrased as discussion |
| Health decision / audit / research files (~6) | YES - dense with buy-list items and protocol changes                            |
| Wealth tax-plan / strategy files (~3)         | YES                                                                             |
| Wikis (`learn_wikis` body)                    | NO - reference material, not action items. Override per-wiki if needed.         |
| Write drafts                                  | NO - longform writing, not tasks.                                               |
| Raw notes / kindle / transcripts              | NO - inputs, not commitments.                                                   |
| Style guides / CLAUDE.md / strategy docs      | NO - rule books.                                                                |
| Capture.md routed log                         | NO - already routed; destinations are already rows elsewhere.                   |

~80 LLM passes total. At Sonnet pricing (~3k in / 1k out each), ~$1.50-3 for the full extraction. Cheap.

### Revised row count (with inference)

- Explicit todos (from `## Tasks` checkboxes): ~250
- LLM-inferred todos (`metadata.source='body-inferred'`): ~250
- Reservoir entries (network / apply / share / learn / make / write / outings): ~300
- Memory + reference entries: ~200
- **Total: ~1,000 rows across the hmart schema**

### Reservoir updates from prose

Some inference-pass extractions update existing reservoir rows instead of creating new todos. Example from Nina Beguš's `## Hooks`:

```json
{
  "kind": "network_contact_update",
  "target_id": "7d4e8c2a-9f1b-4d7e-...",
  "field_updates": {
    "next_proposed_meeting": "Bowles lunch, July 15-Aug 31 2026, gated by knee surgery 2026-05-28 recovery"
  }
}
```

These appear in the dry-run report under a separate "Reservoir field updates" section.

---

## File inventory (439 .md files total)

| Category                                                                                                                   |               Count | Destination                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Project files (Pn / Px / PN) across all areas                                                                              |                 ~60 | `hmart.projects` + `hmart.todos` (parsed `## Tasks`) + `hmart.make_pieces` (for Make area) + 1 `memory_entries` row for the long body                  |
| Per-area `_Backlog_.md` (apply / network / share / make / write / learn-lit / learn-tech / health / wealth / admin)        |                  10 | Typed reservoir tables (`apply_opportunities`, `network_contacts`, `share_items`, `make_pieces`, `learn_items`, etc.)                                  |
| Per-area `_Strategy_.md`                                                                                                   |                   4 | `memory_entries` (kind=reference, scope=area:slug)                                                                                                     |
| Per-area `_Resources_.md`                                                                                                  |                   2 | `memory_entries` (kind=reference, scope=area:slug)                                                                                                     |
| Per-area `CLAUDE.md` (root + each area + Invisible)                                                                        |                  12 | `memory_entries` (kind=user_rule for root, kind=project_rule for areas)                                                                                |
| `A0. Structure/Style/*.md`                                                                                                 | (TBD - count below) | `memory_entries` (kind=style_guide)                                                                                                                    |
| `A0. Structure/Priorities Q2 2026.md` + `Funnel Strategy.md` + `_Strategy_.md`                                             |                   3 | `memory_entries` (kind=reference, scope=global)                                                                                                        |
| `A0. Structure/Today/*.md`                                                                                                 |               (TBD) | `memory_entries` (kind=reference, scope=global)                                                                                                        |
| `A1. Learn/1. Wikis/*.md`                                                                                                  |                  49 | `hmart.learn_wikis`                                                                                                                                    |
| `A1. Learn/0. raw/kindle/*.md`                                                                                             |                 124 | `hmart.memory_entries` (kind=reference, scope=area:learn, source_file=path)                                                                            |
| `A1. Learn/0. raw/notes/*.md`                                                                                              |                  26 | `hmart.memory_entries` (kind=reference, scope=area:learn)                                                                                              |
| `A1. Learn/0. raw/transcripts/*.md`                                                                                        |                  16 | `hmart.memory_entries` (kind=reference, scope=area:learn)                                                                                              |
| `A1. Learn/_Backlog Lit_.md`                                                                                               |                   1 | `hmart.learn_items` (one row per bullet in Doing/To Do/Backlog sections)                                                                               |
| `A1. Learn/_Backlog Tech_.md`                                                                                              |                   1 | `hmart.learn_items`                                                                                                                                    |
| `A1. Learn/index.md`, `log.md`, `_Material - Research_.md`, `_Seeds_.md`, `LLM Wiki - source idea.md`, `PRD - LLM Wiki.md` |                   6 | `memory_entries` (kind=reference, scope=area:learn)                                                                                                    |
| `A2. Make/1. Wikis/*.md` (form-_ and theme-_)                                                                              |                 ~20 | `memory_entries` (kind=reference, scope=area:make) - the taxonomy of forms and themes Halim works with                                                 |
| `A2. Make/0. raw/*.md`                                                                                                     |               (TBD) | `memory_entries` (kind=reference, scope=area:make)                                                                                                     |
| `A2. Write/Active/*.md`                                                                                                    |                   2 | `hmart.write_drafts` (state=active, obsidian_uri set)                                                                                                  |
| `A2. Write/Completed/*.md`                                                                                                 |                   4 | `hmart.write_drafts` (state=completed, shipped_at parsed if present)                                                                                   |
| `A2. Write/_Backlog_.md` + `CLAUDE.md`                                                                                     |                   2 | `memory_entries`                                                                                                                                       |
| `A3. Share/_Backlog_.md`                                                                                                   |                   1 | `hmart.share_items` (one row per Doing/Backlog entry; arc_slug parsed for LA premiere etc.; draft fields populated from inline drafts)                 |
| `A3. Share/_Resources_.md` + `_Strategy_.md`                                                                               |                   2 | `memory_entries`                                                                                                                                       |
| `A5. Network/_Backlog_.md`                                                                                                 |                   1 | `hmart.network_contacts` (cold-funnel + tiered contacts; tier from `## Tier 1` headings; hook from row text)                                           |
| `A5. Network/<Person>.md` (e.g. Nina Beguš)                                                                                |                   9 | `hmart.network_contacts` (one row each; rich detail from frontmatter + body)                                                                           |
| `A4. Apply/_Backlog_.md`                                                                                                   |                   1 | `hmart.apply_opportunities` (one row per Doing/To Do/Done item; kind inferred; deadline parsed)                                                        |
| `A4. Apply/Onassis ONX Relay/*.md` (subfolder per submission)                                                              |                   6 | One `apply_opportunities` row for Onassis + memory_entries for the supporting docs (pitch deck, budget, rider, etc.)                                   |
| `A4. Apply/Oxford AFP/*.md` (subfolder per submission)                                                                     |                  ~5 | Same pattern                                                                                                                                           |
| `X0. Earn/P*.md` + `Invisible/`, `Invoicing/`, `Teaching '27/`                                                             |                 ~19 | `hmart.projects` + `hmart.todos`; `Invisible/memory.md` → memory_entries (kind=project_rule, scope=project:invisible); `Invisible/CLAUDE.md` similarly |
| `X2. Health/P*.md`                                                                                                         |                 ~10 | `hmart.projects` (under admin area, project per body part / topic) + todos parsed                                                                      |
| `X2. Health/Health Protocol.md`, `*Decision.md`, `*Audit*.md`, `*Deep Research*.md`, `Gut Buy List*.md`                    |                  ~5 | `memory_entries` (kind=reference, scope=project:health)                                                                                                |
| `X3. Wealth/P*.md` + `*.jsx` files                                                                                         |                  ~8 | `hmart.projects` + `hmart.todos`; .jsx files captured as `memory_entries` with full body (treated as text)                                             |
| `X4. Admin/P*.md`, `Credentials.md`                                                                                        |                   5 | `hmart.projects` + `hmart.todos`                                                                                                                       |
| `X1. Mindset/*.md`                                                                                                         |                   6 | `memory_entries` (kind=user_rule, scope=area:mindset) - these are identity/principle docs                                                              |
| `00. To Do/Capture.md`                                                                                                     |                   1 | `hmart.captures` (## Pending → state=pending; ## Routed → state=routed, with destination → inference_summary, parsed date → created_at)                |
| `00. To Do/OKRs.md`                                                                                                        |                   1 | `memory_entries` (kind=reference, scope=global)                                                                                                        |
| `00. To Do/Strategy-Briefing.md`, `Week of *.md`                                                                           |                   3 | Skip (generated artifacts)                                                                                                                             |
| Root `Claude.md`, `_Shortcuts_.md`, `Clarinet-P0s.md`                                                                      |                   3 | `memory_entries` (kind=user_rule, scope=global)                                                                                                        |
| **Skipped: All `*-Briefing.md` files**                                                                                     |                 ~12 | These are pickers' output - they regenerate from Supabase data on the first picker run                                                                 |
| **Skipped: All `Capture (Conflicted copy iPhone *)` files**                                                                |                   2 | Sync conflicts - manually verify nothing was lost before delete                                                                                        |

Total active rows after migration: ~600 across all tables. Reference memory_entries: ~200.

---

## Worked example #1 — Project file → projects + make_pieces + todos + memory_entry

**Source:** `~/Documents/second-brain/A2. Make/P0 Singulars.md` (134 lines)

**Frontmatter:**

```yaml
id: fedfb58f-5437-4be2-9450-209e4926e0f4
type: project
area: A2. Make
status: now
priority: P0
```

**Becomes:**

```sql
-- 1 hmart.projects row
insert into hmart.projects (id, user_id, area_id, slug, name, notes, state, position, obsidian_uri)
values (
  'fedfb58f-5437-4be2-9450-209e4926e0f4',  -- preserve vault id (lossless link)
  '<your auth.users.id>',
  (select id from hmart.areas where slug='make' and user_id='<...>'),
  'singulars',                              -- slugified from filename minus P0 prefix
  'Singulars',
  '<full body text from "# P0 Singulars" through "## About Singulars", verbatim>',
  'active',                                  -- mapped from frontmatter status: now
  0,
  'obsidian://open?vault=second-brain&file=A2.%20Make%2FP0%20Singulars'
);

-- 1 hmart.make_pieces row (because area=make)
insert into hmart.make_pieces (user_id, slug, name, piece_kind, status, brief, notes)
values (
  '<...>', 'singulars', 'Singulars', 'Piece', 'active',
  'The umbrella project for Halim''s flagship art practice. Singulars is a series of live human-vs-machine poetry performances...',  -- first paragraph
  '<full body again - both fields keep the content since make_pieces is the evergreen identity and projects is the work to advance it>'
);

-- 7 hmart.todos rows (parsed from ## Tasks)
insert into hmart.todos (user_id, area_id, project_id, title, priority, deadline, state) values
('<...>', '<make-area>', '<singulars-project>',
  'Begin live testing of the Singulars build on Monday 2026-05-04 - exercise chat / battle, voting, model-status admin, end-of-day "day done" path',
  'P0', '2026-05-04', 'anytime'),
('<...>', '<make-area>', '<singulars-project>',
  'Land evals before any further expansion - LM-arena-for-poetry framing + per-model evaluator. Block multi-poet build until this exists',
  'P0', '2026-05-15', 'anytime'),
('<...>', '<make-area>', '<singulars-project>',
  'Ship Multi-poet variant for the Currents context (login + login-gated voting). Where shows: confirm one of Asian Art Museum / Maryland / Santa Fe Currents. **Gated by evals work above.**',
  'P0', null, 'anytime'),
-- ... 4 more from the rest of ## Tasks
```

**What's preserved:** vault UUID (so vault file ↔ Supabase row is verifiable), full body text (twice intentionally - project.notes for daily reading, make_pieces.notes for evergreen identity), every task line verbatim, priority, deadline, obsidian_uri so the "Open in Obsidian" button works in Hmart Kanban.

**What's lost:** nothing.

---

## Worked example #2 — Person file → network_contacts

**Source:** `~/Documents/second-brain/A5. Network/Nina Begus.md`

**Frontmatter + body:**

```yaml
id: 7d4e8c2a-9f1b-4d7e-a2b6-1e9c3f5a8d72
type: person
area: A5. Network
priority: P0
tier: TBD
status: warm-reconnect
created: 2026-05-08
last_connected: 2025-11-13
```

Body: 40+ lines describing relationship, hooks, attendee circle, etc.

**Becomes:**

```sql
insert into hmart.network_contacts (
  id, user_id, name, category, tier, email, status, hook,
  last_touch_at, warm_bridge, notes
) values (
  '7d4e8c2a-9f1b-4d7e-a2b6-1e9c3f5a8d72',
  '<...>',
  'Nina Beguš',
  'curator',                              -- inferred from "UC Berkeley researcher" + "Comparative Literature"
  1,                                       -- frontmatter says TBD, but body says "most warmly disposed academic" + has explicit collab offer → tier 1
  'nbegus@berkeley.edu',                   -- extracted from body
  'in_relationship',                       -- frontmatter status=warm-reconnect → mapped to in_relationship (was contacted, responded, now active)
  '*Artificial Humanities* book launch - propose either an op-ed pairing or a virtual conversation Halim can host on his Substack.',
  '2025-11-13T00:00:00Z',                  -- frontmatter last_connected
  null,                                    -- no warm bridge to Nina herself; she IS the bridge
  '<full body verbatim - "Why P0", "Hooks", "Schmidt Sciences x UC Berkeley convening attendee circle", etc. Preserved end-to-end in notes>'
);

-- PLUS: from the embedded attendee list section (Berkeley researchers etc.),
-- additional 5-15 network_contacts rows for Stuart Russell, David Bamman, etc.
-- Each with warm_bridge='Nina Beguš' and tier=2 (introduced-via-Nina pool).
```

**What's preserved:** vault UUID, every field in frontmatter, full body verbatim in notes, plus the embedded attendee circle becomes their own network_contacts rows with warm_bridge linking back to Nina.

**What's lost:** nothing - the body text stays verbatim in `notes`. Future enrichment (tier confirmation, hook updates) happens in Supabase going forward.

---

## Worked example #3 — Apply backlog entry → apply_opportunities

**Source:** one bullet from `~/Documents/second-brain/A4. Apply/_Backlog_.md ## Doing`:

```
- [ ] picked 2026-04-30 [P0] **Headlands Center for the Arts AIR 2027** - Bay-Area-local interdisciplinary. Notification Dec 11, 2026. headlands.org / aapgh.org | Deadline: 2026-06-01
```

**Becomes:**

```sql
insert into hmart.apply_opportunities (
  user_id, kind, name, organization, deadline, rolling, url,
  fit_note, status, priority, notes
) values (
  '<...>', 'residency', 'Headlands Center for the Arts AIR 2027', 'Headlands Center for the Arts',
  '2026-06-01', false, 'https://headlands.org',
  'Bay-Area-local interdisciplinary. Notification Dec 11, 2026.',
  'doing',                                 -- in ## Doing section
  'P0', 'aapgh.org alternate URL'
);
```

Across the full backlog (Doing + To Do + Done + To-dos for Claude metadata): ~50 apply_opportunities rows. The MozFest entry's full description (8 tracks, format options, strongest track matches) lands verbatim in `notes`.

---

## Worked example #4 — Share backlog entry → share_items

**Source:** one bullet from `~/Documents/second-brain/A3. Share/_Backlog_.md ## Doing`:

```
- [ ] [P0] **CultureHub LA post 4 of 5 (Fri 2026-05-15 14:00 PT slot)** - audience reactions.
  **DRAFTED INLINE in Share-Briefing.md** (Work Share + Outreach hybrid caption, 190 words,
  6-slide carousel). **SHIP STATUS UNVERIFIED as of Mon 2026-05-18** ...
```

**Becomes:**

```sql
insert into hmart.share_items (
  user_id, source_piece_id, arc_slug, touchpoint,
  title, hook, kind, format, platform_targets,
  status, priority, target_slot_at, notes
) values (
  '<...>',
  (select id from hmart.make_pieces where slug='ive-always-wanted-to-become-everyone'),  -- CultureHub LA = this piece
  'culturehub-la-2026',                    -- parsed arc identifier
  'after',                                 -- post 4 of 5 = "after"-style touchpoint
  'CultureHub LA post 4 of 5 (Fri 2026-05-15 14:00 PT slot)',
  'audience reactions',
  'work_share', 'ig_carousel', '{ig}',
  'drafted',                               -- "DRAFTED INLINE" marker
  'P0', '2026-05-15',
  '<full bullet body verbatim incl. SHIP STATUS UNVERIFIED note>'
);
-- The actual drafted caption + hashtags will be pulled from Share-Briefing.md
-- in a second pass and populated into draft_caption + draft_hashtags.
```

Across the full Share backlog (~50 entries spanning Doing / Backlog / Reshare queue / Substack candidates / Workshop quote cards): ~50 `share_items` rows. The LA premiere arc's 5 posts share `arc_slug='culturehub-la-2026'`. Workshop quote cards each get kind='quote_card'.

---

## Worked example #5 — Wiki → learn_wikis

**Source:** `~/Documents/second-brain/A1. Learn/1. Wikis/ai-archetypes.md`

**Frontmatter:**

```yaml
id: 5c6d7e8f-9012-3456-7890-123456789012
type: wiki
tag: ai-archetypes
priority: P2
related:
  [
    ai-weird,
    ai-humanity,
    ai-uncanny,
    queer-temperatures,
    desire-waiting,
    intimate-joy,
    non-human,
  ]
sources: 2
last_ingest: 2026-05-10
```

**Becomes:**

```sql
insert into hmart.learn_wikis (
  id, user_id, tag, title, priority, synthesis, body,
  sources_count, last_ingest_at, cross_refs, frontmatter
) values (
  '5c6d7e8f-9012-3456-7890-123456789012', '<...>',
  'ai-archetypes', 'AI Archetypes', 'P2',
  '<the blockquote at the top, the "> The figures we cast LLMs as: lover, progeny, mentor..." paragraph>',
  '<everything after the blockquote - Argument, Lineage, Tensions, Source notes>',
  2, '2026-05-10',
  '{ai-weird, ai-humanity, ai-uncanny, queer-temperatures, desire-waiting, intimate-joy, non-human}',
  '<all frontmatter as jsonb>'
);
```

All 49 wikis port the same way. The bidirectional cross-refs in `related[]` give us a tag graph queryable via the existing pgvector / array operators.

---

## Worked example #6 — Write draft → write_drafts

**Source:** `~/Documents/second-brain/A2. Write/Active/Paper with Thomas.md`

**Frontmatter:**

```yaml
id: 9c4d8a3b-7e15-4f2a-bd96-3c5e1a8d7f42
type: draft
area: A2. Write
status: active
started: 2026-04-25
last_touched: 2026-05-18
wikis:
  [
    xenolinguistics,
    machine-conlang,
    computational-poetry-practice,
    yuk-hui,
    anthropology-not-ethnography,
    becoming,
    opacity,
  ]
```

**Becomes:**

```sql
insert into hmart.write_drafts (
  id, user_id, slug, title, state, wikis_used, obsidian_uri,
  last_touched_at, notes
) values (
  '9c4d8a3b-7e15-4f2a-bd96-3c5e1a8d7f42', '<...>',
  'paper-with-thomas', 'Paper with Thomas', 'active',
  -- wikis_used is uuid[] - we resolve the tag strings to learn_wikis.id values
  array(select id from hmart.learn_wikis where tag in (
    'xenolinguistics','machine-conlang','computational-poetry-practice',
    'yuk-hui','anthropology-not-ethnography','becoming','opacity'
  )),
  'obsidian://open?vault=second-brain&file=A2.%20Write%2FActive%2FPaper%20with%20Thomas',
  '2026-05-18T00:00:00Z',
  '<full essay body verbatim - the entire markdown content>'
);
```

Obsidian remains the longform editor for this file (per PRD US-019). Hmart Kanban tracks the draft as a row; clicking "Open in Obsidian" jumps to the actual editing surface.

---

## Worked example #7 — Capture log → captures

**Source:** one routed line from `~/Documents/second-brain/00. To Do/Capture.md ## Routed`:

```
- send magnesium supplements to max → X4. Admin/_Backlog_.md#To Do (P2, 05/18/2026; added recommended SKU note...), 2026-05-18
```

**Becomes:**

```sql
insert into hmart.captures (
  user_id, raw_text, source, state,
  inference_summary, reasoning, created_at
) values (
  '<...>', 'send magnesium supplements to max', 'obsidian', 'routed',
  'Routed to X4. Admin/_Backlog_.md#To Do (P2, 05/18/2026)',
  'added recommended SKU note - magnesium glycinate as default with Doctor''s Best / Thorne / Pure Encapsulations one-click links + dose guidance; flagged to swap to L-threonate for cognitive support or citrate for constipation; Halim confirms Max''s address and ships himself',
  '2026-05-18'
);
```

Capture.md has ~80 routed entries (the full audit trail of mobile captures from the past 2 weeks). Each becomes one captures row with state='routed'. The handful of `## Pending` lines (currently 1) becomes captures with state='pending', ready for the router to process.

---

## Worked example #8 — Root rules → memory_entries

**Source:** `~/Documents/second-brain/Claude.md` (root vault rules)

**Becomes:**

```sql
insert into hmart.memory_entries (
  user_id, kind, scope, title, body, source_file
) values (
  '<...>', 'user_rule', 'global', 'Vault Claude.md',
  '<full content verbatim>',
  '~/Documents/second-brain/Claude.md'
);
```

Same pattern for:

- `~/Documents/second-brain/A0. Structure/Style/Instagram.md` → kind=style_guide, scope=area:share
- `~/Documents/second-brain/A0. Structure/Style/Substack.md` → kind=style_guide, scope=area:share
- `~/Documents/second-brain/A0. Structure/Style/Email.md` → kind=style_guide, scope=area:network
- `~/Documents/second-brain/A0. Structure/Style/Notes.md` → kind=style_guide, scope=global
- `~/Documents/second-brain/A0. Structure/Funnel Strategy.md` → kind=reference, scope=global
- `~/Documents/second-brain/A0. Structure/Priorities Q2 2026.md` → kind=reference, scope=global
- `~/Documents/second-brain/A0. Structure/_Strategy_.md` → kind=reference, scope=global
- `~/.claude/CLAUDE.md` (global user rules) → kind=user_rule, scope=global
- `~/.claude/projects/-Users-halim-Documents-hmart/memory/*.md` → kind=user_rule, scope=global

---

## Lossless guarantees

After the bulk import, the script runs a verification pass:

1. **Row counts per table** vs expected (per the inventory above)
2. **For each project file**: assert `length(notes) > 0` and contains the original first heading text
3. **For each backlog file**: count `- [` bullets in the markdown vs count of typed rows + skipped rows; difference must be zero
4. **For each wiki**: assert frontmatter `id` matches the `learn_wikis.id` value
5. **For each captures row**: assert raw_text exists exactly in the source `Capture.md`
6. **Spot check 10 random rows** by reading the source file and confirming verbatim quote presence

The script outputs a `migration-report.md` with all counts and any anomalies.

---

## What the importer DOES NOT touch

- Existing `singulars.*`, `oulipo_dashboard.*`, `becoming_border.*`, `hatchings_eyes.*`, `wikitongues.*`, `public.*` schemas - zero changes
- The vault on disk - read only during migration; no files moved, renamed, or deleted
- The 2 `Capture (Conflicted copy iPhone *).md` files - listed for manual review before deletion
- All `*-Briefing.md` files - skipped (regenerate from Supabase on next picker run)

## Phase boundary

1. **Now**: I implement `migration/import-vault.ts` per this plan. Dry-run mode lists every file it would touch + every row it would insert (no DB writes). Apply mode runs the whole thing in a single transaction with per-step row-count assertions.
2. **You review** the dry-run output. If anything's off, we tune parsers and re-dry.
3. **You say go**. I apply. Verification report lands. Vault still untouched on disk.
4. **Verification window** (you set the length - a day? a week?): use Hmart Kanban against the migrated data while the vault still works as a fallback. Test the picker output, the inbox routing, the Today view.
5. **Archive only after you sign off**: vault moves to `~/Documents/hmart/hmart-kanban/migration/archive/second-brain-YYYY-MM-DD/`. Reversible by `mv` if needed.
