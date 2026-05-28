[PRD]

# PRD: Hmart Kanban

## 1. Overview

Hmart Kanban is a personal task manager built on the Things 3 model and augmented by Claude. It replaces Cowork's 18 scheduled tasks with one continuously-running pipeline: an Edge Function fires every 10 minutes per area, plus a reactive router on every inbox capture. Source of truth is Supabase Postgres; the daily surface is a Vue 3 PWA installable on iOS that captures into Inbox even when offline. Obsidian stays in the loop only as the longform editor for the Make / Write / Learn areas.

The current vault at `~/Documents/second-brain` and the existing `~/Documents/hmart/todo-app/` build get archived. New repo lives at `~/Documents/hmart/hmart-kanban/`. The single user is Halim; auth is Supabase magic link.

## 2. Goals

- Replace all 18 Cowork scheduled tasks with one Edge-Function pipeline + a reactive router.
- Match Things 3's full feature surface for v1: Areas, Projects, Todos, Checklist subtasks, Notes, Tags, Headings, Start Date, Deadline, Evening tag, Repeating, plus the views Today / Inbox / Anytime / Upcoming / Someday / Logbook.
- **Intelligently proactive Inbox**: every captured line is auto-routed AND auto-advanced by Claude using full Supabase context (memory, Claude.md, style guides, project state, recent emails, vault). Capture "share about the Currents exhibition" -> a todo lands in Share with the matched Drive folder, 3-5 image filenames, and paste-ready IG caption + Substack body already drafted. Capture "add contact Lele" -> Gmail draft created with shared context referenced. This is the bar: never stupid proactivity, always real prep work informed by what Claude knows about Halim.
- Per-area pickers refresh recommendations every 10 minutes (continuously running brains, one per area, porting every detail of the existing 18 Cowork scheduled tasks); per-area drafters available on-demand for additional artifact generation.
- **Memory + Claude.md live in Supabase** so the router and the pickers see the same context Cowork's Claude sees, and the system can propose enrichments as todos when a capture reveals something durable.
- Mobile PWA captures into Inbox while fully offline, IndexedDB-queued, syncs on reconnect.
- Migrate the entire vault (35 Claude prompts, all topic inboxes, all backlogs, network targets, apply listings, learn wikis, raw transcripts) into Supabase in one big-bang week-1 import.
- Halim's design system applied throughout - typography, tokens, motion, restraint.
- Stay free-tier on Supabase indefinitely (cap Edge Function invocations under 50k/month; cap realtime messages under 2M/month).

## 3. Quality Gates

These commands must pass for every user story:

- `pnpm typecheck` - TypeScript strict, zero errors
- `pnpm lint` - ESLint clean
- `pnpm test` - Vitest unit + integration tests green
- All stories that touch UI must additionally pass a manual visual check against the design system (run `pnpm dev`, click through the affected flow, screenshot if requested)

## 4. User Stories

### US-001: Repo scaffold + tooling

**Description:** As the builder, I want a fresh repo wired with Vite + Vue 3 + TypeScript + Pinia + vue-router + Tailwind + Supabase + Vitest + Playwright + Workbox PWA + Halim's design tokens, so every later story has a stable substrate.

**Acceptance Criteria:**

- [ ] `~/Documents/hmart/hmart-kanban/` initialized with `pnpm`, `pnpm-lock.yaml` committed
- [ ] `pnpm dev` boots Vite at `:5173` with an empty App.vue rendering
- [ ] `pnpm build` produces a PWA-ready `dist/` (manifest + service worker stubs present)
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` all pass (test file: `tests/sanity.test.ts` asserts 1+1=2)
- [ ] Design tokens imported from Halim's design system (CSS variables in `src/styles/tokens.css`)
- [ ] `.env.example` lists `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`
- [ ] README documents `pnpm install`, `pnpm dev`, `pnpm build`

### US-002: Supabase schema + RLS

**Description:** As the data layer, I want a Postgres schema that mirrors Things 3 plus AI augmentation columns, with Row-Level Security scoped to the authenticated user, so multi-device + future-multi-user is safe by default.

**Acceptance Criteria:**

- [ ] Tables created via migration file in `supabase/migrations/0001_init.sql`:
  - `areas` (id, user_id, slug, name, position, color, icon, created_at)
  - `projects` (id, user_id, area_id, slug, name, notes, deadline, state ['active','someday','completed','cancelled'], position, created_at)
  - `headings` (id, user_id, project_id, title, position)
  - `todos` (id, user_id, project_id, heading_id NULL, area_id, title, notes, state ['inbox','today','anytime','upcoming','someday','completed','cancelled','logbook'], priority ['P0','P1','P2', null], start_date, deadline, completed_at, evening BOOL, position, created_at)
  - `checklist_items` (id, todo_id, title, done, position)
  - `tags` (id, user_id, name, color)
  - `todo_tags` (todo_id, tag_id) join
  - `repeating_rules` (id, todo_id, rule jsonb, next_fire_at, last_fired_at)
  - `captures` (id, user_id, raw_text, source ['mobile','web','dispatch','obsidian'], state ['pending','routing','routed','needs_review','failed'], routed_to_todo_id NULL, reasoning, confidence, created_at)
  - `claude_tasks` (id, user_id, todo_id NULL, mode ['manual','auto','checkin'], prompt_text, status ['queued','running','completed','failed'], result_text, result_url, started_at, finished_at)
  - `picker_runs` (id, area_id, started_at, finished_at, ok BOOL, summary jsonb)
- [ ] RLS enabled on every table with policy `auth.uid() = user_id` (or via foreign-key chain to a user_id)
- [ ] Indexes: `todos(user_id, state)`, `todos(user_id, deadline)`, `captures(user_id, state, created_at)`, `claude_tasks(user_id, status)`
- [ ] `supabase db reset && supabase db push` runs cleanly
- [ ] TypeScript types generated via `supabase gen types typescript` committed to `src/types/database.ts`

### US-003: Supabase magic-link auth

**Description:** As Halim, I want to sign in once on each device with a magic link to my email, with the session persisted, so I never see a login screen again unless I log out.

**Acceptance Criteria:**

- [ ] `/login` route with email input + "Send magic link" button
- [ ] Magic-link callback handler at `/auth/callback` exchanges the code and stores the session in localStorage
- [ ] `useAuth()` composable exposes `{user, loading, signOut}`
- [ ] Any unauthenticated visit to the app shell redirects to `/login`
- [ ] Session refreshes silently in the background
- [ ] Sign-out clears local storage and redirects to `/login`

### US-004: Areas + Projects left nav

**Description:** As Halim, I want a left sidebar that lists Areas with their Projects nested under them, with the active route highlighted, so I can navigate the same way Things 3 lets me.

**Acceptance Criteria:**

- [ ] Sidebar shows the 8 areas in user-defined position order: Learn, Write, Make, Share, Apply, Network, Earn, Admin
- [ ] Each area is collapsible; state persists in localStorage
- [ ] Projects under each area show name, deadline countdown chip (if any), cadence chip (if repeating)
- [ ] Clicking an area routes to `/area/:slug` (shows all that area's todos)
- [ ] Clicking a project routes to `/project/:slug`
- [ ] "+ New project" button at the bottom of each area (modal: name + deadline + cadence)
- [ ] Data is fetched once on mount and kept fresh via Supabase Realtime subscription

### US-005: Project view with todo list

**Description:** As Halim, I want a project view that lists its todos, lets me add/edit/delete them, edit notes, set priority, start date, deadline, and mark complete, matching Things 3's todo UX.

**Acceptance Criteria:**

- [ ] `/project/:slug` shows the project name, notes (editable), and todos in position order
- [ ] Click a todo to expand: title (inline editable), notes (markdown textarea, autosave on blur), checklist subitems, tags, start date, deadline, repeating rule, priority
- [ ] Checkbox toggles completion with optimistic UI; `completed_at` timestamps server-side
- [ ] Drag-and-drop reorders todos within the project (uses `position` column)
- [ ] Delete via swipe (mobile) or `⌘⌫` (desktop) with undo toast
- [ ] "+ New todo" inline form at the bottom of the list
- [ ] All writes go through a Supabase RPC or direct table call with optimistic update + rollback on error

### US-006: Checklist subitems under todos

**Description:** As Halim, I want each todo to optionally have a flat checklist (Things-faithful, not nested), so I can break down a single task without creating fake projects.

**Acceptance Criteria:**

- [ ] Expanding a todo shows its `checklist_items` ordered by `position`
- [ ] "+ Add subitem" appends to the list
- [ ] Each subitem has its own checkbox; ticking does NOT auto-complete the parent (Things behavior)
- [ ] Reorder via drag handles
- [ ] Completed subitems strike through but stay visible

### US-007: Tags + Headings

**Description:** As Halim, I want cross-cutting tags on todos and headings as section dividers inside projects, matching Things 3's two organizational primitives beyond the area/project hierarchy.

**Acceptance Criteria:**

- [ ] Todo edit panel has a tag picker (autocomplete + create new with color)
- [ ] Tags render as chips on todo rows
- [ ] Tag filter chip in the top bar of any list view (Today, Project, Area)
- [ ] Headings within a project: "+ New heading" button creates a heading row; todos can be assigned to a heading; reorder by drag
- [ ] Heading rows visually distinct (slightly larger, uppercase, design system token)

### US-008: Today view

**Description:** As Halim, I want a Today view showing only the P0 todos scheduled for today, plus repeating instances due today, so I open the app to "what matters now."

**Acceptance Criteria:**

- [ ] `/today` (default route after login) queries `todos` where `state='today' OR start_date<=today` AND `priority='P0'`
- [ ] Section: "P0 today" (count). Below that: "P1 / P2 also scheduled today" (collapsible)
- [ ] Each todo shows its area + project breadcrumb chip
- [ ] "This Evening" section at the bottom for todos with `evening=true`
- [ ] Empty state: "Nothing P0 today" with a soft suggestion to check Inbox or Anytime

### US-009: Inbox view + manual triage

**Description:** As Halim, I want an Inbox view that shows captures pending classification or hitting needs-review, with one-click area/project assignment, so I can clear ambiguity quickly.

**Acceptance Criteria:**

- [ ] `/inbox` shows captures where `state IN ('pending','routing','needs_review')` newest first
- [ ] Each row shows raw text, source icon, confidence (if classified), reasoning (if needs-review)
- [ ] One-click "Send to project" picker (area > project > todo type), creates a todo and marks capture routed
- [ ] One-click "Send to Claude" creates a `claude_task` with mode picker (manual/auto/checkin)
- [ ] Bulk select + bulk assign

### US-010: Anytime / Upcoming / Someday / Logbook views

**Description:** As Halim, I want Things 3's other built-in lists, so the app is feature-complete for daily use.

**Acceptance Criteria:**

- [ ] `/anytime` lists todos with `state='anytime'` grouped by area
- [ ] `/upcoming` lists todos with `start_date > today` grouped by date
- [ ] `/someday` lists todos with `state='someday'`
- [ ] `/logbook` lists `completed` todos grouped by completion date, most recent first; infinite scroll
- [ ] All views share the same todo-row component; behavior is identical

### US-011: Repeating task engine

**Description:** As Halim, I want repeating todos that respawn on completion (or on schedule), so weekly health checkins and "Share 2 bits per week" actually recur without manual work.

**Acceptance Criteria:**

- [ ] `repeating_rules` row associates with a todo; `rule` jsonb supports `{type: 'every', interval: 'day'|'week'|'month', count: N, on: ['mon','wed']?}` and `{type: 'after_completion', delay_days: N}`
- [ ] Edge Function `tick_repeating` runs every hour via Supabase cron, checks `next_fire_at <= now()`, creates the next instance todo, updates `next_fire_at`
- [ ] Completing a `after_completion`-type todo also creates the next instance immediately
- [ ] Repeating todos visually marked with a small recurrence icon in lists

### US-012: Capture API + offline IndexedDB queue + service worker

**Description:** As Halim, I want to add a line to Inbox even with my phone in airplane mode, and have it sync to Supabase the moment I'm online, so capture friction is zero.

**Acceptance Criteria:**

- [ ] `POST /api/capture` Supabase Edge Function accepts `{raw_text, source}`; writes to `captures` table with `state='pending'`
- [ ] Service worker (Workbox `BackgroundSyncPlugin`) queues failed `/api/capture` POSTs offline; retries on `online` event
- [ ] Web app's capture form writes directly to IndexedDB first (instant feedback), then issues the POST in the background
- [ ] On reconnect, queued captures POST in FIFO order; each gets a `created_at` matching when the user typed it (not when sync happened)
- [ ] Capture form is reachable from a sticky `+` button in every view; keyboard `c` shortcut on desktop

### US-013: Inbox capture router + intelligent inferrer (Edge Function)

**Description:** As Halim, I want every Inbox line to be understood by Claude in context within seconds of arriving in Supabase. Classification (which Area > Project, what kind of work) is only the first step - Claude must also deduce what work it can do RIGHT NOW to advance the task, using my full Supabase context (memory, Claude.md, recent emails, vault content, project state), and produce the artifacts before I even read the todo. No execution-mode markers from me. Truly intelligent proactivity, not stupid proactivity.

**Acceptance Criteria:**

- [ ] Edge Function `route_capture` triggered by Supabase database webhook on `captures INSERT`
- [ ] Calls Claude Sonnet (not Haiku - this is the smart layer) with cached system prompt: areas/projects catalog + memory + Claude.md + the user's voice/style guides
- [ ] Sonnet decides simultaneously: (a) which area/project, (b) intent (todo only, todo with prep work, todo with full draft, reference-only note), (c) what concrete prep work it can do right now using available tools (Drive search, Gmail draft creation, web search, vault file lookup, prior-todo similarity search)
- [ ] If prep work is possible, the Edge Function does it BEFORE creating the todo: e.g. for "share about Currents exhibition," it finds the matching Drive folder, picks 3-5 images, drafts the IG caption against `Style/Instagram.md`, drafts the Substack post against `Style/Substack.md`, attaches all of it to the resulting todo
- [ ] Examples (must work end-to-end on day one):
  - "share about Currents exhibition" -> todo in Share with: matched Drive folder link, 3 image filenames, draft IG caption (paste-ready), draft Substack body (paste-ready)
  - "add contact Lele Gomes" -> todo in Network with: Gmail draft created (via Gmail MCP) referencing recent shared context, opt-out line included, "Open Gmail draft" button on the card
  - "research the latest from John Cayley" -> todo in Learn with: web search executed, 3-5 most relevant items summarized in notes, tag-matched against Halim's current writing in Write
  - "buy magnesium glycinate" -> todo in Admin with: Amazon search URL + brand + dose pre-filled
  - "draft Q3 wrap-up email" -> todo in Earn with: first-pass draft in notes, ready for Halim to edit
  - "the thing about the thing" -> stays in Inbox needs_review with reasoning, never silent-routed
- [ ] Confidence threshold < 0.7 -> stays `needs_review` in Inbox; never gets silent-routed
- [ ] The resulting todo's notes field contains both the original capture and the inferred work, clearly delimited
- [ ] Capture row records: `routed_to_todo_id`, `inference_summary` (one-line "what Claude did"), `tools_used` (array), `prep_duration_ms`
- [ ] Realtime push fires both on capture state change AND on todo creation, so the UI shows progress (`pending` -> `routing` -> "Claude is drafting your IG caption..." -> `routed`)

### US-014: Memory + Claude.md import + enrichment loop

**Description:** As Halim, I want my existing `~/.claude/CLAUDE.md`, my project memory files, and the vault's `Claude.md` imported into Supabase so the Inbox router and per-area pickers see the same context Cowork's Claude sees. I also want the system to propose enrichments back to me as todos when a captured line implies a durable new insight worth saving.

**Acceptance Criteria:**

- [ ] Tables: `memory_entries` (id, user_id, kind ['user_rule','project_rule','feedback','reference','style_guide'], scope ['global','area:slug','project:slug'], title, body, source_file, last_updated_at)
- [ ] One-shot import script `migration/import-memory.ts` ingests:
  - `~/.claude/CLAUDE.md` (kind=user_rule, scope=global)
  - `~/.claude/projects/-Users-halim-Documents-hmart/memory/*.md` (kind by filename pattern)
  - `~/Documents/second-brain/Claude.md` (kind=user_rule, scope=global)
  - `~/Documents/second-brain/A0. Structure/AI Workflows.md` + `_Strategy.md` + `Funnel Strategy.md` + `Priorities Q2 2026.md` (kind=reference)
  - `~/Documents/second-brain/A0. Structure/Style/*.md` (kind=style_guide, scope by filename: Instagram, Substack, Notes)
  - Per-area `Context.md` files (kind=reference, scope=area:slug)
- [ ] Router + pickers build their system prompt by concatenating relevant `memory_entries` (filtered by scope) on every run, prompt-cached
- [ ] When a router run produces an inference Claude considers durable (new fact, voice update, preference), it creates a "Review memory suggestion: ..." todo in Admin with the proposed diff. User accepts -> the diff is applied to `memory_entries`; user rejects -> the suggestion is logged and dropped
- [ ] Memory entries are queryable from the UI (`/memory` view, read-only for v1)
- [ ] No memory entry is ever written autonomously; all enrichments require a user-accepted todo

### US-015: Continuous per-area picker + actor Edge Functions (THE CORE)

**Description:** As Halim, I want each area to have its own Edge Function "brain" that runs every 10 minutes, reads the area's projects/todos/backlog from Supabase + all relevant cross-vault context, EXECUTES every Claude-finishable piece of work inline (drafts written, wikis appended, emails created, deliverables dropped at destination - never queued as prompts), and surfaces the result as enriched todos in Supabase. This is the consolidated replacement for the 18 Cowork scheduled tasks. The "Act, don't prompt" rule from the 2026-05-13 vault contract is binding: pickers FINISH the work that can be finished autonomously; only items requiring my hands remain pending.

**Architectural notes:**

- 8 area pickers + 1 strategy synthesizer + 1 nightly archiver = 10 cron Edge Functions
- Each picker runs Claude Sonnet via Claude Agent SDK (inside the Edge Function or via a worker proxy if SDK isn't Deno-native; verify in Phase 5.1)
- Each picker has access to (via tools the SDK exposes): Supabase via service-role client (read everything, write only its area + dependencies), Gmail MCP, Google Calendar MCP, Granola MCP, web fetch, Drive lookup
- All non-Supabase tool calls (Gmail, Calendar, Granola, Drive) must be wrapped behind a single MCP-proxy Edge Function so credentials stay server-side
- The full source-of-truth spec for each picker (transcribed verbatim from the Cowork SKILL.md files, with every rule, scoring weight, source path, style-guide reference, and constraint preserved) lives in `specs/pickers-source-spec.md` - written to the repo on plan exit. Below is the structured Supabase-port spec per function.

**The 10 Edge Functions:**

#### pick_admin (every 10 min)

- **Replaces:** admin-briefing (daily 6:09), outings-briefing (Mon 4am), outings-briefing-thursday (Thu 4am), health-briefing (Mon 6:05), health-protocol-monday (Mon 8am), wealth-briefing (Mon 6:01). Admin in Hmart Kanban = Wealth + Health + Outings + general admin per Halim's spec.
- **Reads:** all Admin-area projects + todos, memory entries scoped to admin/health/wealth/outings, `Health Protocol`-equivalent memory entries, recent Gmail label `City/_SF_` (≤8d via Gmail MCP), web fetches for 80+ SF venue/aggregator list (cached, refresh on Mon and Thu), tax-anchor dates, Things-3 due dates ONLY if migrated (defer - Hmart Kanban is the new Things)
- **Selection logic:**
  - For tax: countdown to filing deadline, URGENT-window crossings, S-corp setup, HSA funding, property tax, S-corp decision deadline
  - For health: P0 = Knee + Teeth/Gum + Gut + New Insurance (Halim is 37, APOE4 carrier, in active knee rehab post-MRI 2026-05-02); P1 = Memory + Longevity; P2 = Sleep/Hair/skin
  - For health-protocol-monday: weekly review surfacing daily supplement routine by time-of-day, knee phase status (Keith Baar collagen+vitamin C 60-min pre-PT timing rule), gut phase, memory layer (high-DHA fish oil gap, Citicoline, APOE4-specific evidence), open buy-list gaps (Legion Fortify, Carlson Maximum Omega 2000, CEREBIOME vs Neuralli decision, L-Glutamine, Phosphatidylserine), stop list status, bloodwork status (Function Health), one-line nudge
  - For outings: HIGH SIGNAL = art x tech, ideas+discourse, experimental performance, new/experimental music, niche cultural moments, SF-specific culture, curiosity-driven weirdness, politics + civic life, soundsystem music, photography, Singulars-aligned. LOW SIGNAL = mainstream pop concerts, sports unless community-tied, generic happy hours, celebrity comedy specials, generic startup demo nights. Top 3 picks rule = 3 across DIFFERENT categories (typically 1 gallery/art + 1 ideas/talk + 1 unique experience; don't pick 3 music events). Annual/seasonal flags for On-the-horizon section (Bay Area Dance Week, SF Cookbook Week, SFFILM, Carnaval, Frameline, Pride, Stern Grove, Outside Lands, Folsom, Mill Valley Film Fest, Hardly Strictly, Litquake, Day of the Dead, SF Silent Film, CAAMFest, Other Minds, SF Tape Music, Switchboard).
  - For general admin: P0 deadlines < 14d (URGENT), 15-60d (heads-up), no deadline (rolling actionable). Surface airline credits (Southwest ~$118, AA $0 as of 2026-05-07, JetBlue ~$150) BEFORE any flight-booking task.
- **Acts (executes inline, doesn't queue):**
  - Research clinic / vendor / product -> drops result in todo's notes + product link in `link` field
  - Score insurance options -> drops summary as a new note-kind todo linked to source
  - Draft letter to CPA -> creates Gmail draft via Gmail MCP, attaches draft text + Gmail thread link
  - Lookup return policy / supplement interaction -> drops finding in source todo's notes
  - Pick supplement product -> Amazon search URL with exact brand + dose: `https://www.amazon.com/s?k=<url-encoded brand + form + dose>` (e.g. `magnesium+l-threonate+magtein+2000mg`), stored in `link` field of the todo with `link_label: "Buy Magtein 2000mg"`. Use stored links from health context entries when present.
  - Update Health Protocol memory entry if drift detected (new supplement added mid-week, discontinued, dosage change)
- **Hard rules:** Tax + financial decisions: LLC bookkeeping, corporate credit card, S-Corp election live under Wealth (boundary rule). No em dashes. P0 only red, P1 amber, P2 blue, URGENT (<3 days) gets soft red background.

#### pick_apply (every 10 min)

- **Replaces:** apply-briefing (weekday 6:07)
- **Reads:** Apply-area todos + memory + the original Apply CLAUDE.md context (`A4. Apply/CLAUDE.md` migrated to memory_entries with scope=area:apply)
- **Selection:** P0 first, then deadline proximity. Surface every deadline within 14 days, sorted ascending. Move 4-5 items into `state='today'` (cap 5). Sort: P0 > P1 > P2; deadline secondary.
- **Acts:** Research fellowship -> drops summary in todo's notes. Draft cover letter -> drops final-form draft inline + creates Gmail draft if recipient known. Score piece against tracks -> drops scored table in notes. Move source `## To-dos for Claude` row to Done with outcome + path. Drop `#claude-assisted` tags from rows touched.
- **Hard rules:** No em dashes. Done items collapse. Rolling artifact contract (one artifact per area, no date suffix) -> in Hmart Kanban this means one Today view per area, no daily snapshots.

#### pick_share (every 10 min)

- **Replaces:** share-briefing (weekday 6:06)
- **Reads:** Share-area todos + memory entries `A3. Share/CLAUDE.md`, `_Strategy_.md`, project files; memory entries scoped to area:share with kind=style_guide (Instagram.md, Substack.md, Email.md); upcoming events/exhibitions/releases from Halim's context; Drive folder structure (`#Art` parent `19oWPnMOo-DHDednPCpqEy1nJJgHQHe9o`, subfolders prefixed `[Piece]`, `[Residency]`, `[Exhibition]`, `[Talk]`, `[Workshop]`, `[Show]`, `[Writing]`, `[Gathering]`, `[Press]`, plus `Press Kit`)
- **Selection:** Move 2-5 items from backlog into `state='today'` based on P0 priority + pacing rules (`_Strategy_.md`). Sort P0 > P1 > P2; deadline secondary.
- **Acts (truly intelligent):** For "share about X exhibition": (1) find the matching Drive subfolder via search (`parentId = '19o...' and title contains '<keyword>'`; widen with Arabic transliteration; common matches: "Era systems" -> `[Piece] Era Systems`, "Currents" -> `[Exhibition] Current 2026`, "Culturehub" -> `[Residency] CultureHub`, "Singulars" -> `[Piece] Singulars` and sub-pieces, "Mozilla all hands" -> `[Talk 10min] Mozilla Org All Hands`); (2) read top 1-3 most descriptive files in the folder (Google Docs / markdown / text - prefer Halim's own language); (3) select 3-5 images (record filename + viewUrl + 1-line reason; fallback to public images from web with sources or screenshots saved to `A3. Share/assets/YYYY-MM-DD/`); (4) draft IG caption per `Style/Instagram.md` (hook on line 1, short sentences, 60-120 words for Announcement / 120-220 for Work Share / 30-60 for event reminder, confessional-intellectual condensed voice, banned-phrases list binding, tag real @handles only, 0-3 hashtags but always include hashtag block of 3-8 in separate block at bottom per `feedback_ig_hashtags_mandatory`, no em dashes); (5) draft Substack post per `Style/Substack.md` (literary specific title, clarifying subtitle, embodied opening - scene/confession/felt moment, bolded first-sentence per paragraph, short paragraphs, radical sentence-length variation, metaphor register bodily/spatial/textile/intimate-domestic, anti-patterns binding, 300-600 words for announcements / 600-900 for work shares, embed image early via Drive filename + viewUrl, quotable closer + soft CTA, no em dashes); (6) attach all of it to the todo's `drafts` JSONB field with structure `{ig_caption, ig_hashtags, substack_title, substack_subtitle, substack_body, images: [{filename, viewUrl, reason}], drive_folder_url}`; (7) auto-suggest TBD slots when calendar slot is empty/TBD (drawing from reshare candidates + Substack candidate lists), mark "(suggested YYYY-MM-DD)"
- **Hard rules:** Every IG caption ships with hashtag block (mandatory per `feedback_ig_hashtags_mandatory`). No separate `.md` files for one-off drafts (`feedback_note_economy`). Done/shipped items collapse via state transition (state='completed'). Halim should be able to post IG caption directly and Substack with light polish.

#### pick_network (every 10 min)

- **Replaces:** network-briefing (weekday 6:08). Includes the Gmail-draft-floor-of-5 rule (added 2026-05-04).
- **Reads:** Network-area todos (people, outreach targets, status), memory entries `A5. Network/CLAUDE.md`, `_Backlog_.md`, per-person notes (migrated to `notes` field on person-type todos), `A0. Structure/Style/Email.md` (voice rules - REQUIRED before drafting), Gmail inbox last 7d for new contacts, Gmail drafts (for floor count check), Gmail label-based archive ('targets.md' equivalent now in Supabase as a `target` boolean + category column)
- **Selection:** Move 4-5 items from backlog into `state='today'` (cap 5). P0 first. Honor 2/2/1/1 daily slate: 2 podcasts / 2 publications / 1 gallery / 1 peer = 6 total (`feedback_briefing_means_artifact` + 2026-05-01 codification). Score uncontacted targets by priority weight (P0 podcasts/publications 2x, P1 galleries/peers 1x), freshness (boost never-surfaced), pipeline balance (avoid same-category two days running), hook availability (recent public piece score higher). Pick top 4 per category.
- **Acts:** Web search target's most recent work (past ~60 days), extract one specific piece (episode / article / show / project) + direct URL + 1-2 sentences of context (no fabrication; if nothing recent, say so and reference older well-known piece, skip Gmail draft). Draft outreach email per `Style/Email.md` voice rules (no em dashes, catalyst-driven embodied opener for cold editorial pitches, mechanical practice description, two parenthetical pitch options for editorial / one named ask for galleries, awards-with-links adjacency credentials, "Thanks for what you make" or "Thanks for all that you do" sign-off, Halim signature footer); tailor by category: Podcast -> guest pitch with hook = live human-LM poetry performances; Publication -> short piece or editorial angle; Gallery -> representation or studio visit, mention warm bridge if exists (Lele for Bitforms, Joel for Gazelli); Peer -> peer-to-peer note, no ask or tiny one. Create Gmail draft via Gmail MCP for each pick. Update per-person memory/notes with first-touch date and draft saved.
- **Gmail draft floor of 5 (universal contract):** At end of every run, Gmail drafts folder must contain AT LEAST 5 networking-related drafts. List all via Gmail MCP `list_drafts`. Networking-related = recipient is a person-type todo OR matches outreach archetype (`info@`, `editor@`, `editorial@`, `contact@`, `hello@`, `submissions@`, `queries@`, `production@`, `team@`, `press@` on publication/podcast/gallery/institution domain) OR appears in today's `state='today'` set. Drafts to `madihalim@gmail.com` and clearly non-network drafts don't count. If below 5, top up by drafting + saving additional Gmail drafts in priority order: P0 items in today without Gmail draft, P0 items in cold funnel flagged "Gmail draft NOT created", maintenance-due Tier 1 contacts with no current draft, P1 items in cold funnel. Use best-guess email if unverified, footer-flag for Halim verification.
- **Hard rules:** Never send emails (drafts only). Never invent contact details. Never check off targets' contacted boxes automatically. Always include opt-out on reconnection emails. Always log to per-person note. No em dashes. P0 only red, P1 amber, P2 blue.

#### pick_learn (every 10 min) + pick_learn_raw_weekly (Sunday 8pm)

- **Replaces:** learn-briefing (weekday 6:05) + sync-raw-weekly (Sunday 8pm). pick_learn handles daily; pick_learn_raw_weekly handles Granola ingestion.
- **Reads (pick_learn):** Learn-area todos + memory entries (`A1. Learn/CLAUDE.md`, `index.md` ## Tag taxonomy + ## Proposed tags, `log.md` last 7 days, wiki frontmatter), Lit + Tech backlogs, Write In Progress + Active filenames + first 15 lines (tag-match source), `_Material_.md` (verify covered items)
- **Reads (pick_learn_raw_weekly):** state file `.sync_state.json`-equivalent now in Supabase as a `picker_runs` row with `summary.last_run_iso`; three Granola folder IDs (Art coaching `a1521dcd-...`, Friend Talks `d54024c5-...`, hmart `fe1a6e4f-...`)
- **Selection (pick_learn):** Surface 3-5 P0/P1 Lit reading items + 2-3 Tech items. ALWAYS at least 3 P0 picks per `feedback_learn_briefing_floor`. ALWAYS at least 3 diagonal picks per `feedback_learn_diagonal_picks` (items not directly tag-matched to active wikis but tangential + interesting). Verify against `_Material_.md` first; don't surface covered. Sort P0 > P1 > P2; deadline secondary.
- **Selection (pick_learn_raw_weekly):** Pull Granola meetings whose `created_at > last_run_iso`. For each meeting, call `get_meeting_transcript`, clean for legibility (strip Granola-isms, add paragraph breaks every 3-5 turns or ~150 words, fix obviously-wrong words with `[?]` confidence marks, keep speaker labels `**Halim:**` and `**<Name>:**` on own line, strip filler sparingly, NEVER summarize/paraphrase/compress - structural cleanup only).
- **Acts (pick_learn):** Create wiki -> insert as `kind=reference` todo in Learn project with full content in notes. Write raw note -> same as wiki but kind=raw-note. Run research lookup -> drop summary in source todo's notes. Draft synthesis -> insert as synthesis-tagged note. Update `index.md`-equivalent + `log.md`-equivalent (now Supabase tables / specific todos). Move source `## To-dos for Claude` row to Done with outcome + path. Drop `#claude-assisted` tags.
- **Acts (pick_learn_raw_weekly):** For each new raw file, identify candidate tags via match against `index.md ## Tag taxonomy` + existing wiki filenames. Decision tree: (1) If file's takes meaningfully extend EXISTING wiki -> append dated entry under wiki's `## Source notes` (latest at TOP), increment frontmatter `sources` count + update `last_ingest`, refresh synthesis paragraph (blockquote at top) ONLY if source meaningfully shifts picture; (2) If single observation about new artist / quote / passing thought (no clear fit) -> leave in `raw/<subfolder>/`, don't move, solo notes promoted at 3+ sources via lint rule; (3) If file's takes argue for NEW canonical tag that doesn't exist yet -> do NOT create wiki, append row to `index.md ## Proposed tags` with proposed tag + one-line argument + source, new wikis only at 3+ sources. Cross-refs: if source connects two existing wikis not currently cross-linked, add to both wikis' `## Cross-refs`. Append single entry to `log.md` per run.
- **Hard rules:** Don't overwrite existing transcripts (skip if filename collides). Don't modify Granola originals. No em dashes. No dropped tags: `#non-conformity`, `#frontier-tech`/`#tech-frontier`, `#grand-vision`, `#abruptness`, `#empathy`, `#conviviality`, `#zero-degree` (use `#artist-present` instead). Don't create new wikis automatically (always propose). Don't pattern-match merges. No "Claude prompts to launch" section anywhere. Halim drafts essays in `A2. Write/Active/` and ships them to `A2. Write/Completed/` (kept in Obsidian as the longform editor per US-019); wiki at `A1. Learn/1. Wikis/` is the synthesis layer that mirrors into Supabase.

#### pick_write (every 10 min)

- **Replaces:** write-briefing (weekday 6:11)
- **Reads:** Write-area todos + memory `A1. Learn/1. Wikis/` frontmatter (priority, tag, sources, last_ingest), `A1. Learn/index.md`, `A1. Learn/log.md` last 7d, `A2. Write/Active/` + `Completed/` filenames + last-modified
- **Selection:** Surface P0/P1 wikis ripe to draft from + active drafts + recently-completed pieces. Sort P0 > P1 > P2; deadline secondary.
- **Acts:** Consolidate wikis -> drop merged wiki at destination, update both source wikis with cross-ref. Fold raw note into wiki -> append source notes entry. Write synthesis paragraph -> drop in wiki's blockquote at top. Draft essay opening from ripe wiki -> drop in new Active draft file (Obsidian retained for longform per US-019; Hmart Kanban tracks the draft as a write-type todo with `obsidian_uri`). Produce wiki frontmatter lint pass -> drop fixed frontmatter. Move source `## To-dos for Claude` row to Done. Drop `#claude-assisted` tags.
- **Hard rules:** Essay drafts in progress DO get their own files in `Active/` (project-level artifact, not one-off draft - the "no separate notes" rule applies to one-off task drafts only). No dropped tags. No `#claude-assisted` tags on new rows. No em dashes.

#### pick_make (every 10 min)

- **Replaces:** make-briefing (weekday 6:10)
- **Reads:** Make-area todos + memory `A2. Make/_Backlog_.md` (Active projects index, Standing rules, Tasks, To-dos for Claude), every active project file in `A2. Make/`: `P0 Singulars.md` (umbrella - sub-pieces include Multi-poet), `P0 Website v2 EO May.md`, `PN Brand v2 EO May.md`, `P1 Lead Magnet Reading Room EO June.md`, `P1 Hope Pharmakon.md`, `PN Paper with Thomas.md` (now P0 focus per Halim 2026-05-03 - xenolinguistics, Ingold spine), `P2 Word Garden.md`, `P2 Future v Website.md`, `PN Sandbox Poem.md` (deadline 2026-05-22), `PN College Workshops.md`. Project-history memory: "I've always wanted to become everyone" shipped LA ~2026-04-18 + standalone; Becoming Border is standalone; only Multi-poet is Singulars sub-piece; Twitterfication/Vibe Thinking shipped; Paper with Thomas is new major focus.
- **Selection:** Top of mind 4-6 most actionable shipping moves + nearest deadlines. Per-project paragraph + next concrete action. Sort P0 > P1 > P2; deadline secondary.
- **Acts:** Write rider, draft pitch deck outline, produce technical spec, run research lookup, scaffold project file, draft Substack post shipping piece -> all execute inline at destination project. Drop deliverable. Move row to Done. Drop `#claude-assisted` tags.
- **Hard rules:** No separate `.md` files for one-off drafts. Done items collapse. Verify completion before listing as pending. **This is the most load-bearing function of the day for Halim's art practice.**

#### pick_earn (every 10 min) + pick_invisible (daily, separate due to volume)

- **Replaces:** earn-briefing (daily 6:10) + invisible-briefing (daily 6:16). Splitting because invisible has its own deep memory/people/calendar logic.
- **Reads (pick_earn):** Earn-area todos + memory `X0. Earn/CLAUDE.md`, every project (Clarinet, Invisible-pointer, Teaching '27, Wikitongues, Clarinet Hiring). Tag every surfaced item with source project.
- **Selection (pick_earn):** P0 > P1 > P2; deadline secondary. URGENT (<3 days), 15-60d heads-up, no-deadline rolling actionable.
- **Acts (pick_earn):** Draft speech outline, write hiring outreach email, score teaching applications, build YouTube influencer shortlist, draft Slack message - all execute inline at destination project. Move row to Done with outcome + path.
- **Reads (pick_invisible):** root CLAUDE.md, X0. Earn CLAUDE.md, `X0. Earn/Invisible/CLAUDE.md` (project rules + style + industry-news scope - read FIRST every run), `X0. Earn/Invisible/memory.md`, `X0. Earn/P1 Invisible.md` (canonical tasks), Granola folders Invisible `225fb26c-...`, AI Champions `c7af700b-...`, Evals `0f0abc52-...`, Google Calendar
- **Selection (pick_invisible):** Pull yesterday's Granola data for three folders via `list_meetings` with custom date range. For each meeting, decide if new people / asks / decisions worth surfacing. Fetch full content via `query_granola_meetings` with prompt "Who attended, what asks, what decisions, what's owed by whom by when?". Extract new people not in memory.md People, new commitments to/from Halim, status changes on open threads, new workstream context. Compute days-until-deadline per task. Bucket URGENT/this-week/heads-up/rolling. Identify Top 3 today: most-urgent P0s + highest-leverage non-deadline (often relationship-anchor: Emily check-in, Apollo demo prep, AI Champions session prep). Identify every `#claude-assisted` task -> ensure inline draft + Next step in memory.md (if missing, draft + write back NOW). Build calendar for rest of week via list_events; assign task time-blocks (default 9-11am deep work, 2-4pm synthesis, evenings writing).
- **Acts (pick_invisible):** Update memory atomically: add new people to right People sub-section (workstream-keyed), add new ask/commitment to `## Recently surfaced` with `[YYYY-MM-DD]` prefix + source meeting title, move completed tasks to `## Done (collapsed)` with one-line outcome, graduate P2 -> P1 if deadline now <14d or related P1 completed, draft every #claude-assisted task without inline draft + Next step (concrete decisive, no hedging, no em-dashes, exactly one CTA, `**Next step:**` with concrete action + deadline), preserve Halim's exact wording on quoted asks, bump frontmatter `last_updated`. Industry news scan: 3 buckets (AI in general from Anthropic/OpenAI/Google DeepMind/Meta/Mistral/xAI/Reuters/Bloomberg/Information/WSJ/HN; Evals platforms = Braintrust/Arize Phoenix+AX/LangSmith/Galileo/W&B Weave/Comet Opik/DeepEval Confident AI/Latitude/Truesight/Maxim/Goodeye Labs; Data labor + AIT business = Scale AI/Mercor/Micro1/Surge AI/Snorkel/Turing/Toloka/Labelbox/Appen/iMerit + AIT-relevant). Each bucket cap 3 items, total cap 8. Format: `[Source] — Headline (why-it-matters tag)`. Why-it-matters tags from {direct competitor / pricing signal / customer validation / acquihire / leadership / regulatory / product feature / market sizing}. If bucket has nothing notable, render "No notable items." DO NOT pad.
- **Hard rules (pick_invisible):** Engagement runs to 2026-07-20 - days-to-contract-end is the top metric. Don't pull from Things 3. Don't paraphrase Halim's quoted asks from Granola - verbatim or skip. Don't surface equity/options/milestone/contract-rate numbers (artifact is shareable inside Invisible). Don't render equity status chip in top strip (only days-to-contract-end + hours-this-week). Don't redact customer names inside vault (only when output leaves vault). Style Refinement Protocol: when Halim hand-edits, NEXT run diffs them + updates CLAUDE.md `## Style revisions` with dated entry + applies new rules in next render.

#### synth_strategy (daily, runs after all area pickers at 7:00 AM PT)

- **Replaces:** strategy-briefing (daily 7am)
- **Reads:** root CLAUDE.md memory, OKRs memory entry, all area pickers' latest `picker_runs`, every active project across vault (`status='now'` OR `priority IN ('P0','P1')`), previous Strategy-Briefing equivalent, current strategy-briefing artifact (for visual style inheritance)
- **Selection:** Top-of-vault P0 grid (one row per active project, P0 if exists else P1 with `[P1 - no P0]` tag, sort within area P0 > P1 deadline-tiebreak). Today's focus 3-5 P0s with AM/PM placement. Weekly 5-7 priorities Mon-Sun with 3 x 1h focus blocks each (carry forward Monday's allocation mid-week for continuity). Roll-up 2-3 bullets per area from latest picker runs. Heads-up 14-30d deadlines. Friction watch: stale checkboxes, overdue P0s, blocking dependencies, capture queue size, projects with no activity 14+ days.
- **Acts:** Carryover rule: if items from yesterday still open, surface at top of Today's focus with `(carry)` suffix; if carrying 5+ days, flag in Friction watch with "blocked or de-prioritize?". Same Act-don't-prompt rule for any cross-area Claude-finishable rows.
- **Hard rules:** Terse + concrete. References in Halim's voice (Anne Carson / Cheryl Strayed / Beckett). One rolling output, never dated. Final step: 4-6 line chat summary (today's 3-5 focus anchors + highest-leverage AM action + project count in Top P0s). Artifact is the briefing; chat is just the pointer.

#### nightly_archive (Sunday 11pm)

- **Replaces:** the weekly-sweep portion of `_claude_tasks_addendum.md`'s inbox-weekly-sweep behavior. Daily-sync's checkbox propagation is REPLACED by real-time UI writes in Hmart Kanban (no nightly batch needed for state propagation).
- **Reads:** all `state='completed'` todos with `completed_at IN past 7 days`
- **Acts:** For todos linked to recurring/list-backed sources (network targets, apply backlogs, learn backlogs), append `## Done log` entry to the source memory entry with `- {YYYY-MM-DD}: {item title}`. Trim `state='completed'` items older than 90 days to a `logbook_archive` table with reduced columns (id, title, completed_at, area) per the Open Question on Logbook trim.
- **Hard rules:** Idempotent. No content deletion ever - items move from active tables to archive table.

#### inbox_router (real-time, US-013 covers this) + memory_enricher (US-014 covers this)

These are NOT cron - they fire on Supabase webhooks. Listed here for completeness of the "10 functions" architecture.

**Acceptance criteria (rolled up across all pickers):**

- [ ] All 10 Edge Functions deployed to Supabase with the schedules described
- [ ] Total monthly invocations measured + reported: 8 area pickers × 144/day = 1,152/day; pick_learn_raw_weekly × 1/week; pick_invisible × 1/day; synth_strategy × 1/day; nightly_archive × 1/week. Total ~36,000 per month, well under 500k free tier
- [ ] Each picker is idempotent (re-running same input within same minute produces zero new state changes)
- [ ] Each picker writes a `picker_runs` row with summary jsonb (`{items_picked, items_executed, errors, claude_tokens_in, claude_tokens_out, ms_elapsed}`)
- [ ] Side-by-side parity check: for each of the 18 Cowork tasks, compare the picker's output against the equivalent Cowork briefing for at least 7 days before any sunset (US-022)
- [ ] Every "Acts inline" example in this spec is testable with an end-to-end fixture: capture a representative input -> verify the resulting todo has the expected drafts/notes/Gmail draft/Drive folder reference attached
- [ ] Source-of-truth file `specs/pickers-source-spec.md` written to the repo on plan-exit with the full verbatim extraction from the 18 Cowork SKILL.md files for traceability

### US-016: Per-area drafters (on-demand)

**Description:** As Halim, I want one-click drafted artifacts per todo where relevant - IG caption + Substack body for Share, outreach email for Network, product link for Health-flavored Admin, fit note for Apply - so the AI's value sits next to the task it informs.

**Acceptance Criteria:**

- [ ] Edge Function `draft_for_todo` accepts a `todo_id` and a `kind` (`ig_caption`, `substack_body`, `outreach_email`, `product_link`, `fit_note`, `weekly_protocol`)
- [ ] Uses Claude Sonnet with the right style guide loaded as system prompt + the todo's full context
- [ ] Result stored as `claude_task` with `mode='manual'` and the rendered output in `result_text`
- [ ] Todo card surfaces drafted content as an expandable section with "Copy" buttons + status (draft / approved)
- [ ] Drafter never runs on cron; only on user click (cost control)

### US-017: Realtime sync across devices

**Description:** As Halim, when I check off a todo on my phone, my desktop browser updates within a second without polling.

**Acceptance Criteria:**

- [ ] Supabase Realtime channels subscribed for `todos`, `captures`, `claude_tasks`, `projects` filtered by `user_id`
- [ ] UI store applies incoming changes immediately (optimistic merge)
- [ ] Conflict resolution: last-write-wins (acceptable for single user)
- [ ] Realtime message volume monitored; alert if > 50k/day (towards the 2M/month free limit)

### US-018: Big-bang vault migration _(DEFERRED - decide together after this week's testing)_

**Note:** Halim's call - we'll stand up the schema + the per-area pickers + the inbox router first, play with them on a handful of real captures and one or two manually-seeded projects, then decide whether to do the big-bang import or migrate progressively. Acceptance criteria below are the plan-of-record IF we proceed; gate is a green-light from Halim after dogfooding.

**Description:** As the migration script, I want to import every relevant item from `~/Documents/second-brain/` into Supabase in one verified run, so v1 launches with all of Halim's real work already inside it.

**Acceptance Criteria:**

- [ ] Script `migration/import-vault.ts` ingests:
  - All 14 topic inboxes' Active queues -> `todos` with `state='anytime'`, priority + tags carried over
  - All `## Tasks` sections from every project file under areas (A0-A5, W0-W2, X1-X4) -> `todos`
  - `A4. Apply/_Backlog.md` + `_Backlog Submit.md` -> apply project todos with `state='someday'`
  - `A5. Network/_Backlog.md` + `A5. Network/Network.md` + `Art/3. Market/Meet/targets.md` -> network project todos with `state='someday'`
  - `A1. Learn/_Backlog Lit.md` + `_Backlog Tech.md` -> learn project todos
  - `A2. Make/_Backlog.md` -> make project todos
  - `A2. Write/2. In Progress/` + `3. Active/` files -> write project todos (one per file, body in notes)
  - `A1. Learn/1. Wikis/` and `0. raw/` -> learn project todos (kind=reference)
  - `Inbox/Claude.md` ## Pending (35 prompts) + `Inbox/prompts/*.md` -> `claude_tasks` with mode=checkin
  - Done items + Logbook from existing files -> `todos` with `state='completed'` and `completed_at` parsed from `✅ YYYY-MM-DD`
- [ ] Dry-run mode lists what would be inserted, by table, before any writes
- [ ] Apply mode runs in a single transaction; logs row counts per table
- [ ] After migration, archive the vault to `~/Documents/hmart/hmart-kanban/migration/archive/second-brain-snapshot-YYYY-MM-DD/`

### US-019: Obsidian longform link (Make / Write / Learn)

**Description:** As Halim, when a todo is in Make / Write / Learn and represents longform work, I want a link to open the corresponding markdown file in Obsidian, so I can write there but still track here.

**Acceptance Criteria:**

- [ ] Todos in those three areas have an optional `obsidian_uri` field
- [ ] When set, an "Open in Obsidian" button appears on the todo card
- [ ] URI format: `obsidian://open?vault=second-brain&file=A2.%20Write%2F2.%20In%20Progress%2Fessay-title`
- [ ] Migration sets this automatically for In Progress / Active write items and Wikis

### US-020: PWA install + service worker

**Description:** As Halim, I want to add Hmart Kanban to my iPhone home screen and have it look like a native app, with offline shell + background sync.

**Acceptance Criteria:**

- [ ] `manifest.webmanifest` declares name, short_name, icons (192/512), theme color from design tokens, display=standalone, start_url=/today
- [ ] Service worker (Workbox) precaches the app shell + critical assets
- [ ] Runtime caching: NetworkFirst for `/api/*`, StaleWhileRevalidate for static assets
- [ ] `BackgroundSyncPlugin` queues failed mutations (capture POSTs primarily) and replays on reconnect
- [ ] App is installable via Safari "Add to Home Screen" with proper icon + splash
- [ ] Offline shell loads instantly with last-cached snapshot; banner indicates "offline mode, capture only"

### US-021: Kanban view per project

**Description:** As Halim, I want to flip any project into a kanban board (Backlog | Doing | Done) so I can plan visually when the list view feels too narrow.

**Acceptance Criteria:**

- [ ] Toggle button on `/project/:slug` switches between list and kanban
- [ ] Kanban columns derive from `state` (and a virtual `doing` set via the user dragging a card there - stored as a `doing` boolean OR a tag)
- [ ] Drag-and-drop between columns updates state with optimistic UI
- [ ] Mobile: kanban becomes horizontal scroll; touch-friendly drag handles
- [ ] Preference (list vs kanban) persists per project in localStorage

### US-022: Sunset Cowork scheduled tasks _(DEFERRED - decide together after this week's testing)_

**Note:** Same gate as US-018. We only start disabling Cowork tasks after the Supabase pickers have produced equivalent (or visibly better) output for at least a week of parallel running, and Halim has signed off per area. Acceptance criteria below is the plan-of-record IF we proceed.

**Description:** As the final step, I want to disable each of the 18 Cowork scheduled tasks after a week of parallel running confirms its Supabase equivalent produces equivalent or better output.

**Acceptance Criteria:**

- [ ] Sunset checklist in `migration/sunset.md` lists all 18 tasks with disable date + verification notes
- [ ] Each row marked DISABLED only after 7 days of parallel running show no regression in coverage
- [ ] Cowork artifact dashboards stop updating after disable (verified by hitting the artifact URL)
- [ ] Last task disabled: `inbox-hourly-process` (since it's the lowest-risk to keep running as a backup)

## 5. Functional Requirements

- **FR-1:** The system MUST support a Things 3 hierarchy: Area > Project > Todo > Checklist Item.
- **FR-2:** The system MUST support cross-cutting tags and section headings within projects.
- **FR-3:** The system MUST support Today, Inbox, Anytime, Upcoming, Someday, Logbook views identical in shape to Things 3.
- **FR-4:** The system MUST support repeating tasks with `every N days/weeks/months` and `N days after completion` semantics.
- **FR-5:** The system MUST support Start Date, Deadline, and an Evening tag on todos.
- **FR-6:** Inbox captures MUST flow through Claude (Sonnet) within seconds of arriving in Supabase. The router does NOT just classify; it ALSO infers what concrete prep work it can do right now (Drive lookup, Gmail draft creation, web search, vault content lookup, draft generation) and DOES that work before creating the todo, attaching results to the todo's notes.
- **FR-7:** No execution-mode markers required from the user. Claude decides what to do based on full Supabase context: memory entries (US-014), Claude.md, style guides, project state, recent emails, vault content, prior similar todos.
- **FR-8:** When the router's confidence in area/project routing is below 0.7, the capture MUST stay in needs-review state visible in `/inbox`. Prep work is only attempted on routed captures, never on needs-review ones.
- **FR-9:** The mobile PWA MUST capture into Inbox even when offline; captures MUST persist in IndexedDB and sync via service worker BackgroundSync when reconnected, preserving original timestamps.
- **FR-10:** Per-area pickers MUST run every 10 minutes via Supabase cron Edge Functions, staggered to spread load, each idempotent.
- **FR-11:** Per-area drafters MUST run only on explicit user request (no cron), to keep Edge Function cost bounded.
- **FR-12:** The system MUST surface examples of "truly intelligent proactivity" as the bar for Claude's prep work. Reference set (must work on day one): "share about Currents exhibition" -> Drive image lookup + IG caption + Substack draft attached to todo; "add contact Lele" -> Gmail draft created with shared context; "research the latest from John Cayley" -> web search results summarized in notes; "draft Q3 wrap-up email" -> first-pass draft in notes. The system MUST refuse to act stupidly (don't draft an email if no recipient context exists; don't create a Gmail draft for a generic "buy milk").
- **FR-13:** Authentication MUST be Supabase magic link; RLS MUST scope every table to `auth.uid()`.
- **FR-14:** Sync between devices MUST use Supabase Realtime; UI MUST react to incoming changes within 1 second.
- **FR-15:** The big-bang vault migration MUST run in a single transaction with dry-run mode preceding any writes.
- **FR-16:** Todos in Make / Write / Learn MAY have an `obsidian_uri` that opens the matching `.md` file in Obsidian; this is the only Obsidian dependency remaining post-migration.
- **FR-17:** The app MUST be installable as a PWA on iOS Safari with manifest icons + offline shell + auto-update.
- **FR-18:** Each project MUST support a kanban view (Backlog | Doing | Done) toggled from the list view.
- **FR-19:** Total Supabase Edge Function invocations MUST stay under 50,000/month (10% of free tier); the picker cadence and drafter on-demand-only rule together enforce this budget.
- **FR-20:** Realtime message volume MUST stay under 100,000/month (5% of free tier).

## 6. Non-Goals (Out of Scope)

- Multi-user / sharing - single-user product, RLS-enforced.
- Native iOS shell (Capacitor / Swift) - PWA only for v1.
- Native macOS / Windows / Android - desktop is the web app in Chrome / Safari.
- Calendar integration (Google / Outlook / iCal sync) - defer to v2.
- Full offline editing (only Inbox capture is offline-capable; reads/edits require a connection in v1).
- Replacing Obsidian as a longform editor - Make / Write / Learn keep Obsidian as the writing surface.
- Migrating Logbook history older than 90 days from the vault - that's archived as-is.
- Importing tasks from Things 3 itself - clean break, only the vault feeds Hmart Kanban.
- AI memory / embedding search (OB1-style) - defer; if needed later, add via Supabase pgvector.
- Anthropic Dispatch (SMS) integration - defer to v2 after PWA capture is proven.
- Per-collaborator delegation - n/a single user.
- **User-supplied execution-mode markers** (`claude auto`, `check with me`, etc.) - explicitly DROPPED. Claude infers what to do from context, not from special syntax in the captured line.

## 7. Technical Considerations

- **Stack:** Vite + Vue 3 (script setup, Composition API) + TypeScript strict + Pinia + vue-router + Tailwind CSS + Halim's design tokens (CSS variables in `src/styles/tokens.css`) + Supabase JS client + Workbox PWA + Vitest + Playwright + ESLint.
- **Database:** Supabase Postgres free tier (500 MB). Tables defined in US-002. RLS on every table.
- **Edge Functions:** Supabase Edge Functions (Deno). One per picker (8 total), one router, one task runner, one drafter, one repeating-task tick.
- **Cron:** Supabase scheduled functions for pickers (every 10 min) and repeating (every 1 hour).
- **Realtime:** Supabase Realtime on `todos`, `captures`, `claude_tasks`, `projects`. RLS enforces visibility.
- **AI:** Claude Haiku 4.5 for router (low-latency, prompt-cached system + catalog). Claude Sonnet for drafters + Agent SDK for auto/checkin Claude task execution.
- **Mobile:** PWA only. Service worker via `vite-plugin-pwa` with Workbox; `BackgroundSyncPlugin` for offline capture queue.
- **Design system:** Source artifact is `/Users/halim/Downloads/Hmart Design System.html` (a Pencil-bundled HTML; full spec needs render). Visible from the file's SVG fallback + `<title>`: title is `singulars + oulipo.xyz - design system`; brand palette = `#8B5CF6` purple, `#2AA4DD` cyan, `#02F700` neon green, `#FEE005` yellow, `#F6009B` magenta on white background with a black hairline rule and monospace (`ui-monospace`) headlines. Accessibility note from the partial review: none of the 5 accent colors pass WCAG AA as body text on white (#02F700 1.7:1, #FEE005 1.1:1, #2AA4DD 2.7:1, #8B5CF6 3.5:1, #F6009B 3.7:1) - they are accent/decorative only; body text must be near-black `#0F172A` or `#1a1a1a`. Most accents PASS on black backgrounds. ui-ux-pro-max cross-reference recommends: Micro-interactions style (50-100ms hovers, gesture-based, tactile feedback), Minimal Single Column pattern, 4.5:1 text contrast minimum, cursor-pointer on every interactive element, visible focus rings, prefers-reduced-motion respected, no emoji as icons (use Heroicons/Lucide SVG). Tokens live in `src/styles/tokens.css`; UI primitives in `src/components/primitives/` follow this spec + the `oulipo-brand` + `product-design-system` skill guidance. No em dashes anywhere in copy.
- **Deferred actions tied to plan-exit:** (1) Full render of `Hmart Design System.html` via Preview MCP to extract type scale + spacing + component states + motion specs that the SVG fallback doesn't reveal. (2) Save the cleaned design-system spec + a "How to apply in Hmart Kanban" section to `~/Documents/second-brain/A2. Make/Hmart Design System.md` per Halim's request. (3) Save `specs/pickers-source-spec.md` to the repo with the verbatim 18-task extraction the Explore agent produced this session, since `not a single detail should be lost` (US-015).
- **Vault interaction:** Read-only at migration time; post-migration, Obsidian URI links only. The vault is archived to `migration/archive/` after import.
- **Repo:** Fresh repo at `~/Documents/hmart/hmart-kanban/`; the existing `~/Documents/hmart/todo-app/` is archived as `migration/archive/todo-app-2026-04-25/` for reference.
- **Cost ceiling:** Edge Function invocations ~35k/month from pickers + ~5k headroom for capture routing and drafters. Realtime well under quota. Free tier sustainable indefinitely for a single user.

## 8. Success Metrics

- All 18 Cowork scheduled tasks DISABLED with no regression in daily operations after 14 days of running on Hmart Kanban only.
- Time from typing a line in Inbox to it landing in the right project < 3 seconds median, online or after reconnect.
- Picker freshness: every area's Active set ≤ 10 minutes stale during waking hours.
- Mobile capture works offline: airplane mode test passes (write 5 captures offline, fly online, all 5 land in Supabase within 30 seconds).
- Supabase usage stays under 10% of free tier on every metric (DB size, Edge Function invocations, Realtime messages, bandwidth) at 90-day mark.
- Halim opens Hmart Kanban as the first app every morning and doesn't open Things 3 again.

## 9. Open Questions

- **Design system source of truth.** Which repo / file path / Figma file holds Halim's design tokens? The `product-design-system` and `oulipo-brand` skills should be consulted before implementing UI primitives.
- **Picker port verification.** Each of the 18 Cowork SKILL.md files needs side-by-side comparison with its new Supabase picker for a week. Plan for that diff review window in US-022.
- **Repeating task semantics on missed fires.** If the laptop is asleep and a `every Monday` instance is overdue, do we backfill (create the missed instance) or skip? Things 3 backfills; recommend matching that.
- **Logbook trim policy.** Things 3 keeps Logbook indefinitely. With Supabase free tier 500 MB, set a soft cap (e.g. archive completed > 1 year old to a `logbook_archive` table with reduced columns).
- **Obsidian URI scheme.** Verify the exact URL format for the user's vault on macOS + iOS (`obsidian://open?vault=...&file=...`).
- **Dispatch / SMS capture (defer).** Confirmed out of scope for v1; revisit once PWA capture is proven.
- **Subscription / billing.** Single-user free product hosted on Halim's Supabase project. No monetization concerns.

[/PRD]
