# Context - hmart-kanban

Living project memory. Read on startup before doing work.

## What this is

Personal task manager (Things 3 model) for Halim. Vue 3 + Pinia + vue-router +
Tailwind, Supabase backend (Postgres schema `hmart`, RLS, realtime, edge funcs),
PWA via vite-plugin-pwa. Deployed at https://oulipo-dashboard.vercel.app
(repo madihg/oulipo-dashboard, auto-deploys on push to `main`).

Brand: white bg only, black-alpha opacity hierarchy, 5 functional accents
(carnation/hard/reverse/reinforcement/versus), no shadow/radius/gradient,
lowercase, Space Grotesk + JetBrains Mono, 44px touch targets, safe-area insets.
Phone-first: bottom tab bar < 768px (MobileTabBar), sidebar >= 768px.

## Architecture notes

- Data model: after the "collapse projects into tasks" migration, areas hold
  tasks directly (`project_id` null). `todos` + `checklist_items` both have a
  `position` column. `vault.reorderTodos(updates)` persists priority/position/
  state and optimistically mirrors todayTodos/inboxTodos/projectTodos/areaTodos.
- `StateList.vue` (anytime/upcoming/someday/logbook) loads into a LOCAL `items`
  ref via `vault.loadByState()` - NOT a store-tracked list, so reorder there must
  reload (KanbanBoard emits `reordered`).
- Views: Today, Inbox, Area(+kanban), Project(+kanban), StateList, Areas.
- ViewToggle: route-mode (`slug`+`current`+`entity` "project"|"area") OR
  generic-mode (`options`+`modelValue`).
- Shared `KanbanBoard.vue`: priority columns P0/P1/P2/none, Sortable per column,
  desktop grid / mobile horizontal scroll-snap (85vw cols). `group` prop must be
  unique per mounted board.

## Quality gates

`npm run typecheck` · `npm run lint` (0 errors; 7 pre-existing warnings in
migration/\*.ts are OK) · `npm run test` (vitest) · manual visual at 375 + 1280.
Preview MCP server: hmart-kanban-web-5174 (port 5174).

## Session State (2026-08-13) - Drive artifacts: filing rules + attachment chips

Per Halim: routine deliverables now live as Google Docs/Sheets filed into the
right Drive folder, with an email-attachment-style chip on the task.

**Drive mapped exhaustively** (9-agent workflow, all branches + shared-with-me).
Root = area taxonomy (#Art #Work #Wealth #Admin #Health #Learn #Mindset
#Structure). Canonical filing rules + full folder-id map live in
hmart.memory_entries 'Drive filing map + artifact rules'
(e712d677-06bc-47ea-9501-14410f1a737e) - THE source of truth; weekly-desk §4
maintains it. Highlights: Clarinet PRDs -> #Work/Apply AI Clarinet/[Product]
Planning; property-tax appeal -> #Wealth/Hamilton Tax Reduction; new mature
art piece -> '[Piece] <name>' at #Art root; art-world outreach lists ->
#Art/_ Market _ CRM; one-doc-per-thinker in #Learn; shared-with-me is other
people's taxonomy, never file into it. CRM stays in network_contacts (tbd).

**Mechanism**: Drive connector create_file (title+parentId; text/plain -> Doc,
text/csv -> Sheet). daily-desk §5 now REQUIRES deliverables as Drive artifacts
per the rules row, and stamps metadata.artifacts [{url,title}] on source todo +
receipt (merge jsonb, never overwrite).

**App: attachment chips.** src/types/artifacts.ts (ArtifactLink, artifactsOf,
kindFromUrl - validates https, infers doc/sheet/slides/folder), ArtifactChips.vue
(attachment idiom: type icon, title, kind label, opens new tab, 44px coarse),
rendered in TodoEditor between when-row and notes.

**First migration executed**: Saf outbound (20 podcasts) -> Sheet in
_ Market _ CRM (1DUQc92PGu87Rt7TGJiQgtbEKukNEk2dCcpRhQdWTqZQ); Clarinet Impact
PRD v0.1+v0.2 -> Doc in [Product] Planning
(1FhS8MsBcgAqMrKn4FEoCDEJQr6t_GjkzPMzZC39vqvA); Hope Pharmakon linked to its
existing Doc. All four related rows (3 receipts + Clarinet source todo) carry
metadata.artifacts and render chips.

## Session State (2026-08-12) - debrief panel + full-auto routines + volume cap

Per Halim's batch ask (plan/build/ship in one go):

**Full-auto routines.** daily-desk + weekly-desk no longer prompt: broad
deliberate allowlist in ~~/Documents/hmart/.claude/settings.local.json
(whole-server MCP rules for supabase/gmail/granola/dayone/calendar, WebSearch/
WebFetch/Bash, scoped Write/Edit) AND per-task approvedPermissions in the live
registry (~~/Library/Application Support/Claude/claude-code-sessions/<acct>/
<device>/scheduled-tasks.json - the SAME file that pins daily-desk's model).
weekly-desk cwd moved ~/Documents -> ~/Documents/hmart so it inherits project
settings. If the app clobbers the registry (it rewrites the file), the project
allowlist alone still covers both.

**Debrief** (the "click and expand, explains the day" surface): migration
0013_daily_debriefs (one row per user+day, RLS, realtime). DebriefPanel.vue on
Today above the focus board - collapsed "debrief" toggle, light renderer (##
sections, bullets, links). daily-desk §7 upserts it every run (## today =
Google Calendar schedule, ## what happened, ## needs your eyes, ## also
noted); weekly-desk seeds Monday's ## weekly review section Sunday and
daily-desk preserves it. GOTCHA fixed at seed time: day must be the LOCAL
date ((now() at time zone 'America/Los_Angeles')::date) - UTC current_date
rolls over at 5pm and the evening run would write tomorrow's row.

**From-claude volume:** every suggestion now carries todos.priority (P0 rare,
P2 default, never null/ongoing) AND metadata.claude.suggested_when (WhenPicker
key or future ISO date; rides in metadata because a real start_date would leak
the row into Today pre-accept; resolveSuggestedWhen in types/claude.ts).
keep() applies area + when in ONE updateTodo so accepted rows land filed and
scheduled; a when chip renders next to the area chip (hidden collapsed on
phones, shown on tap, like .cl-area). Open pre-existing suggestions backfilled
(P2 + next_week). HARD cap 5 new rows/day across runs+kinds,
overflow -> debrief "also noted" + ledger kind 'deferred' (still-live
candidates, NOT skips); ClaudeInboxSection sorts P0-first + shows a priority
pill (.cl-pri).

**Auto-reconcile additions (daily-desk §0):** Google Calendar events are now
done-evidence (scheduled/booked suggestions close themselves); a thread Halim
answered his own way marks the draft row 'sent' + retitles the leftover draft
"[superseded - safe to delete]". "Mark sent" clicking is dead - reconcile owns
draft status entirely.

**weekly-desk gains** §2 agent-setups review (WebSearch trailing 2 weeks,
fetch-everything-you-cite + honesty rules, ledger dedupe per normalized URL,
full review file in ~/Documents/hmart/claude-deliverables/<monday>/, ONE
structure-area P2 task sharing the daily budget, Monday debrief section) and
§3 new-correspondent sweep (real people not in network_contacts -> conservative
contact rows + Monday debrief; mailing-list adds stay with Halim). daily-desk
§6 matter scan is GATED on memory_entries 'Config: matter access' (PENDING =
silent skip; one ledgered setup task surfaces once). Source todo rows
(c8f1d242 merged, 1254dd21) annotated resolved; portable spec row regenerated
to match current reality (it was pre-autonomy stale).

Seeded today's debrief row so the panel renders immediately.

## Session State (2026-08-07) - single-line mobile rows + cleanup/review pass

Halim: "tasks in today on mobile are no longer compact - keep things on a
single line and compact. thorough review + cleanup pass."

**Single-line rows (supersedes the 2026-08-03 two-line re-flow):** DenseRow's
phone treatment now COMPRESSES instead of wrapping - area/project chips
collapse to their color dots (`font-size: 0` leaves the fixed-size dot child),
the when-chip is `display: none` (scheduling lives in the editor), priority
pill + deadline stay. Measured in the harness: 36px single-line rows (was
64-71px two-line), titles 196-288px at 375px, zero overflow, desktop identical.
An invisible `::after { inset: -10px }` pad keeps checkbox/delete finger-sized
without growing the row (same trick as main.css `.check`).

**Convention now enforced everywhere: `pointer: coarse` decides only
hover-reveals (+ a 32px button floor where a mis-tap destroys data);
`max-width: 600px` owns layout** - a coarse layout can never be seen in a dev
browser, which is how two of these bugs shipped. DenseRow + Inbox captures +
ClaudeInboxSection + BulkBar all follow it.

**Review workflow findings fixed (20 confirmed, 26 agents):** KanbanBoard phone
strip bled -16px vs 12px padding -> page panned horizontally on every kanban
view (now `calc(-1 * var(--s-4))`); Inbox capture buttons lost their touch
floor on iPads (restored 32px in coarse); DenseStatusBar wrapped to 2-3 lines
on phones (now one line: rows count + realtime dot; wordy segments hidden);
DenseGroup empty buckets collapse to headers on phones (were 120px each);
PriorityBoard defaults COLLAPSED on phones with no stored choice (was pushing
Today's first task ~400px down); Reservoir Apply/Share phone rows went from
~4-line cards to ONE line (name + status) with tap-to-open detail cells
(`openRow`/`toggleRow` + `.r-row-open`, CSS-gated to <=600px); capture
reasoning + confidence now render in the tap-expander (they were unreachable on
phones).

**Dead code removed:** TaskRow.vue (zero importers; `.row`/`.icon-btn` blocks in
main.css died with it), src/lib/captureQueue.ts (Workbox background-sync in
vite.config is the real offline path), src/lib/cursor.ts, src/lib/contrast.ts +
its tests (only its own tests imported it), tests/_.test.js duplicate twins
(vitest only runs .test.ts), boards.ts mindset fetch/ref/type (ran on every
Today load for zero consumers since the 7/29 UI removal), DenseToolbar count
prop + d-count-chip + bare-emit fallbacks, listControls DEFAULT_CONTROLS export,
.sr-only, 17 dead tokens (d-tag-_/d-chip-_/d-row-bg{,-selected}/
pill-training-_/pill-trained-_/bp-_/container-list/color-bg-warm/ease-out) +
their tailwind mirrors. KEPT deliberately: documented scales (type/spacing/
motion), the five accents + halimmadi palette block, pill-upcoming-* (used by
CommandPalette), the tags thread (alive - todoTags.ts hydrates `t.tags`).

**Verified:** typecheck 0, lint 0 errors, 86 tests, prod build passes; harness
at 375px (36px rows, hit-pads active, no overflow) + 1280px (desktop identical);
touch-emulated preview confirms coarse reveals. Reservoir phone collapse is
CSS-structural, typechecked but not click-verified (needs auth) - eyeball
/reservoir/apply on the phone after deploy.

## Session State (2026-08-03) - DenseRow mobile re-flow

Halim: "inbox looks great on laptop (the density) terrible on mobile."

Cause: `.d-row` is a single flex line where every chip is `flex-shrink: 0` and
only `.d-title` flexes. With checkbox + priority + area + project + when +
deadline + delete present, the chips ate the row and the title collapsed to a
few characters ("Cultur…") - measured 63px of title at 375px. The only mobile
rule was an opacity toggle, so phones got the desktop layout at a third of the
width, with every chip force-shown.

Fix (`src/components/dense/DenseRow.vue`, one phone-only `@media (max-width:
600px)` block, no markup change): `flex-wrap: wrap` + `order` re-flows the row
into two lines - checkbox · title · delete, then a metadata strip underneath.
The break is a zero-height `.d-row::after { flex: 0 0 100%; order: 4 }` placed
between the two orders (no wrapper elements, so Sortable drag / select / expand
are untouched). Row gets `padding-left: 34px` with the checkbox pulled back via
`margin-left: -24px`, so the title and the strip share one left edge. Title goes
to a 2-line clamp instead of a hard ellipsis; row `min-height: var(--touch-target)`;
checkbox 18px, delete 30px.

Verified in a throwaway Vite entry (`mobile-harness.html` + `src/mobile-harness.ts`,
both deleted after) rendering DenseRow with a seeded pinia store - the in-app
browser has no session, same trick as the earlier harness route. Measured: title
63px -> 219px at 320px wide, 0px horizontal overflow at 320/375/600, no child
overflowing its row, when-popover still opens fully on-screen. Desktop screenshot
at 1280 confirms single-line density is byte-for-byte unchanged (block is
phone-only). Lifts all 9 DenseRow surfaces, not just Inbox.

## Session State (2026-07-30) - routine memory ledger + whole-inbox Gmail pass

Per Halim: the daily-desk routine now (1) answers the WHOLE inbox and (2) has
perfect, model-agnostic memory in Supabase.

**hmart.routine_ledger (migration 0011, applied)** - THE routine memory, one
row per processed unit, unique (user_id, routine, source, source_id), kinds
task/decision/offer/reply_draft/skip. Skips are recorded too (an email judged
no-reply-needed is never re-read). Backfilled from existing state (todo
metadata + inbox_reply_drafts; first 6:09am run had already produced 13
units). Labels/metadata are UX only now - the ledger is the dedupe truth.

**Gmail step widened**: entire inbox (no date window), newest first; every
thread awaiting Halim's reply gets a draft using style guide + layered
rules/wikis + network_contacts sender lookup; non-warranting threads get
ledger 'skip' rows so the inbox converges to fully-evaluated. Max 15 drafts
per run (most important first), carryover in the run log. Still NEVER sends.

**Portability**: full spec stored in memory_entries id
30dec8cf-233f-4d77-adac-1d1307cafbaa ('Routine spec: daily-desk (portable)',
kind reference, scope global) - any non-Claude agent stack can run the
routine from Postgres + the three connectors. Sync rule stated in both the
spec row and SKILL.md: material changes update BOTH.

## Session State (2026-07-29, batch 2) - context/rules layer + notes reformat + mindset removal

**Context layer (rules + wikis) shipped end to end.** The bug behind "project
rules never fire": buildContextBundle's kind filter silently dropped
'project_rule' rows - no bundle ever contained them. Design: NO new tables;
memory_entries carries it all. Scopes 'global' | 'area:<slug>' |
'project:<slug>' (area scoping already existed on 325 rows); kind
'project_rule' = local instructions, NEW kind 'wiki' = the running context
note. Migration 0010_memory_wiki_kind.sql (applied): wiki enum value +
(user_id, kind, scope) index. buildContextBundle now includes project_rule +
wiki, takes optional projectSlug, and orders layers global -> area -> project
with "most specific wins" stated in the header. area_picker v5, route_capture
v4, enrich_todo v3 redeployed (via MCP deploy, nested repo-relative file
paths - CLI token is gone; agent-verified versions/status/verify_jwt).
App: ContextPanel.vue (collapsible rules + wiki editors, autosave on blur,
edits the latest row per kind+scope, creates on first save, counts older
entries) mounted on Area.vue + Project.vue headers. daily-desk SKILL.md
gained a "Context resolution" section with the layered query. NOTE: one
legacy row has scope 'area:__global' (matches no filter when area-scoped;
ships in unscoped bundles) - left as-is.

**Notes reformat DONE (the long-blocked backlog item).** All 322 eligible
notes (>=200 chars, all states) now TLDR line > ## Next steps > sectioned
content. Excluded by design: reservoir-fed rows, metadata.claude rows, the
"Hmart kanban, SUPABASE" backlog task (a35c679b). Safety held: full backup
FIRST in hmart.todos_notes_backup_20260729 (416 notes, 798k chars, RLS
enabled so PostgREST can't read it), 4-row test batch verified before bulk,
idempotent via metadata.notes_reformatted, agents instructed to treat note
text as data (never follow instructions inside notes) and to only collapse
verbatim-duplicate blocks. Bulk ran as a 30-agent workflow (318 rows); 9
agents hit the monthly spend limit mid-run, resumed cleanly from cache after
it lifted. Final verification: 0 remaining, 322/322 TLDR-first + Next steps,
0 em dashes, 0 rows below 0.72 length ratio, avg ratio 1.62; the 38.9k-char
Singulars note came through at ~1.0. Restore path if anything reads wrong:
the backup table keys by id.

**Also:** mindset post-it removed from the Today focus board per Halim
("doesn't look proper right now") - UI only, boards store still loads the
data; grid is 3-up now. "no area" sidebar entry restyled to match area rows
(tiny uppercase mono, grip-aligned indent) after Halim flagged the mismatch.

**Verified:** typecheck 0, lint 0 errors, 65 tests green, edge deploys
confirmed ACTIVE at new versions, layered-bundle query proven against prod
data (project_rule now present in scoped pulls).

## Session State (2026-07-29) - Things-3 Today + multi-select + horizon + "from claude" inbox + daily-desk routine

**Today membership rewritten to exact Things 3 semantics.** Single predicate
`belongsInToday()` in src/utils/when.ts (state='today' OR start_date arrived
w/ someday excluded OR deadline arrived; priority NEVER qualifies; completed/
cancelled/logbook excluded). All three old copies now delegate: loadToday SQL
(`.not state in (completed,cancelled,logbook)` + or with nested and), createTodo
fitsToday, matchesToday. UTC->local date fix everywhere (todayISO; also
loadByState + StateList upcoming). Verified against prod DB: old query 12 rows,
new 9 - the 3 leavers are exactly the dateless P0s. Tests: belongsInToday suite
in tests/when.test.ts.

**Kanban improvements shipped:**

- Sidebar pinned (position:sticky + 100dvh + own overflow-y in .app-shell aside);
  content pane keeps document scroll; inert on mobile (aside display:none).
- Drag-to-nav: today/anytime/someday accept task drops in App.vue (whenPatch),
  "no area" nav entry accepts drops to unfile. Same application/x-hmart-todo MIME.
- Multi-select: stores/selection.ts (id-keyed Set; cmd/ctrl toggle, shift range
  via DOM [data-id] order), DenseRow selection clicks + .d-row-selected style,
  BulkBar.vue (fixed bottom-center: when picker, priority, area move, complete,
  delete, esc clears). vault gains bulkUpdate/bulkComplete (reservoir refill kept)
  /bulkDelete (DELETE..RETURNING as undo snapshot, single undo toast).
- "no area" view: /no-area route + NoArea.vue (StateList pattern) + vault.loadNoArea
  (active, area+project null, state not inbox).
- Horizon view on Today (third ViewToggle mode 'horizon'): TodayHorizon.vue -
  4 Sortable lanes today / next week / week after / ongoing; drops write
  horizonDropPatch (utils/horizon.ts, unit-tested: bucketing mutually exclusive
  with today, ongoing lane wins over weeks). vault.loadHorizon detached fetch.

**"from claude" Inbox section (the routine's surface):** contract in
src/types/claude.ts - routine inserts ordinary inbox todos stamped
metadata.claude {suggested, kind task|decision|offer, source, source_id, reason,
offer?, status proposed|kept|approved|done|dismissed}. Inbox.vue splits them out
of the plain list; ClaudeInboxSection.vue renders kind chips + reason, keep/
dismiss, and for offers an instructions input + approve that INSERTS a queued
hmart.claude_tasks row (todo_id, mode auto, prompt_text w/ Halim's instructions)

- the routine executes queued rows next run and writes result_text back. Gmail
  reply drafts strip reads inbox_reply_drafts (status pending|drafted_in_gmail),
  open-in-gmail / mark sent / dismiss; drafts are never tasks, never auto-sent.
  Live via realtime channels on claude_tasks + inbox_reply_drafts. RLS verified
  owner-full-access on both tables; insert->query contract proven by DB probe.

**daily-desk scheduled task** (~/.claude/scheduled-tasks/daily-desk/SKILL.md,
cron `9 6,15 * * *`, runs in Claude Code while the app is open) replaces the
Cowork "Debrief daily": executes approved claude_tasks first, then Granola (ALL
folders), Day One (3 days), Gmail (draft replies in Halim's voice per
memory_entries style guide, label claude/review, rows in inbox_reply_drafts,
NEVER sends email), then max-3 offers from an hmart scan; logs to picker_runs
(function_name 'daily_desk'). Prompt follows the Fable 5 prompting guide
(self-contained, intent-first, explicit boundaries, grounded progress claims).
HALIM: click "Run now" once to pre-approve its tools, run a week in parallel,
then disable the Cowork twin (COWORK_SUNSET.md procedure).

**Cleanup:** todo-app deprecated (README banner; launchd was never installed,
nothing ran); auto-memory updated. Backlog audit: everything from the standing
list is shipped except (a) notes reformat (spawned task chip; do with backup +
test batch) and (b) per-area/project context wiki + rules system (spawned task
chip with design brief).

**Adversarial review (4 dimensions, every finding independently verified):
28 confirmed, 0 rejected, ALL fixed.** The load-bearing ones: (1) horizon
drop into the today lane vanished the card (detached row invisible to
reconcile) - fixed with optimistic lane move in TodayHorizon onEnd + load()
now also refreshes loadToday; (2) BulkBar popovers rendered off-screen
(transform made the bar the containing block for Popover's position:fixed) -
inset-auto centering instead, verified empirically; (3) selection survived
navigation so bulk ops hit invisible rows - cleared on route change (App.vue)

- selection.drop on row delete; (4) dismiss hard-deleted suggestions so the
  routine's dedupe would re-create them - now a tombstone (state cancelled +
  claude.status dismissed) AND revokes queued claude_tasks (guarded delete);
  (5) approve double-execution window - hasActiveRun guard + partial unique
  index claude_tasks_one_active_per_todo; (6) claude_tasks +
  inbox_reply_drafts were NOT in the realtime publication - migration
  0009_realtime_claude_inbox.sql (applied). Plus: this-week horizon lane,
  select-mode toggle in DenseToolbar (touch entry for multi-select), no-area
  reachable on mobile (Areas.vue), 44px coarse-pointer targets, escape closes
  popover before clearing selection, undo restores into todayTodos, radius/mono
  brand sweep, pending-draft copy fallback, shift-range excludes checklist ids.

**Verified:** typecheck 0, lint 0 errors, 65 tests green (7 files; new
horizon.test.ts + belongsInToday suite), prod-DB semantics diff (old Today 12
rows -> new 9, leavers exactly the 3 dateless P0s), insert->query contract
probe, login page console clean. CAVEAT: preview still can't authenticate
(same as prior sessions), so authed views were validated by tests +
adversarial review + DB probes, not clicked through - Halim should eyeball
/today (horizon toggle), /inbox, /no-area after deploy.

## Session State (2026-07-06) - halimmadi redesign + logged-improvement batch

Large batch: ported the design system to the **halimmadi.com** identity + shipped
the still-open items from the "Hmart kanban" todo notes + the current asks.

**Design system -> halimmadi.com** (`src/styles/tokens.css`, `tailwind.config.ts`,
`main.css`): warm paper (`--ground-2 #fbfaf7`), warm hairline (`--hair #e6e4de`),
ink opacity hierarchy, **primary accent COBALT #1c39e8** (`--acc-carnation`
repointed to cobalt; hard->gold #e89b1b, reverse->violet #6e4bd0,
reinforcement->viridian #1e8e5a, versus->vermilion #e5391c). Legacy `--sl-*`/
`--acc-*` names preserved + repointed so components inherit. Real brand fonts now
**self-hosted** in `public/fonts/` (Standard, Diatype Variable, Diatype Mono
Variable, Terminal Grotesque) via `@font-face` in tokens.css - the app used to
reference them but never loaded them (fell back to Space Grotesk). "Diatype Mono
Variable" is the same variable file with the `"MONO" 1` axis; the axis is applied
to `.font-mono`/`.pill` (main.css) AND swept onto all ~60 scoped mono blocks
(`font-variation-settings: "MONO" 1`) - without it mono labels render proportional.
`useProjectColor.ts` palette retuned to the marks. DESIGN.md rewritten. Verified in
browser: fonts load, MONO axis active.

**Fixes/features shipped:** nav no longer grayed (solid idle, cobalt selected =
text+rail+`--cobalt-tint`) across App.vue/AreasNav/MobileTabBar; **manual area
reorder** (`vault.reorderAreas` + AreasNav Sortable, 6-dot grip); **Popover
rewritten** to fixed viewport-aware positioning (clamps + flips + ResizeObserver)
so group/filter menus never clip off-screen; **notes read/edit unified**
(`.ed-notes-input` matches `.ed-notes-preview`); **tags removed** from editor
(TagPicker.vue deleted); **inbox clarity** ("added to <dest>" toast via
createTodo `announce` flag, inline destination hint in AddTaskInput, explainer +
empty state in Inbox); **area chip between priority & title** (DenseRow);
**alpha-sort within sections** (listControls priority tiebreak + new "alpha"
mode + SortPopover); **"next week"** in when.ts/WhenPicker; **priority board on
Today** (new `hmart.board_notes` table + `0007_board_notes.sql` migration + RLS
user_id=auth.uid(); `stores/boards.ts` + `PriorityBoard.vue`: week-goals field +
week/quarter/year sticky notes 3-max + rotating mindset post-it read from
`memory_entries` scope~mindset).

**Review:** ran a multi-agent review workflow (correctness/brand/wiring, each
finding adversarially verified); fixed all 10 confirmed findings - board note
position max+1 (was length -> collisions), MONO axis sweep, EntityActions delete
color cobalt->vermilion, DenseRow/TaskRow overdue/warn urgency (overdue->red,
warn->gold), status dots use semantic --success/--gold/--error, Popover natural-
height measure, week-goals save race guard, migration file.

**Verified:** typecheck 0, lint 0 errors (7 pre-existing migration warnings), 49
tests (added next_week + alpha + board-persistence probe), prod build passes,
console clean. **Board persistence proven at DB layer** (insert/read/delete probe).
CAVEAT: could NOT authenticate the preview, so authed views (Today board, nav
selected state, editor) validated by build + code review, not clicked through -
Halim should eyeball the deployed app.

**Files:** new - PriorityBoard.vue, stores/boards.ts, public/fonts/*,
supabase/migrations/0007_board_notes.sql. Only schema change: `board_notes` table.

**Follow-up (2026-07-07):** added an **"ongoing" priority** (glyph `~`) alongside
P0/P1/P2 - `alter type hmart.priority add value 'ongoing' after 'P2'` (migration
0008; enum is now P0,P1,P2,ongoing). Teal accent `--acc-ongoing #0f766e`. Ranks
after P2, before none (PRIORITY_RANK, groupTodos, KanbanBoard column, DenseGroup
accent, useListDragReorder PRIORITY_KEYS, FilterPopover, TodoEditor buttons show
`~`, DenseRow `.d-pri-ongoing` shows `~`, Today/Inbox/StateList dot maps,
AddTaskInput `[~]` prefix). Priority type widened in database.ts + vault NewTodo.

## Session State (2026-07-02) - Brand cleanup + Share reservoir

**Brand tasks (DB, done):** merged the two brand tasks in the shared doc.
`c24d9de2` -> "[Brand] Brand v2 - locked (halimmadi.com + oulipo.xyz)",
state=completed, notes rewritten (3 brands: wikitongues not listed, halimmadi.com,
oulipo.xyz = blue/black/silver, same as IG). `16b7635e` ("IG & Oulipo Aesthetics")
-> completed with merge pointer. Created "[Brand] Brand v3 - revisit + refine"
(`eee47976`, start_date 2026-10-01, P1) for the go-forward brand revisit.

**Drive rename (done):** folder `1rLpyV5kuid8AecnRix5oMbn1oN8C30XE`
"Brand Oulipo 2026" -> "H-mart brand 2026" (name-only, not moved) via Composio
googledrive (GOOGLEDRIVE_UPDATE_FILE_PUT; connection now ACTIVE for
madihalim@gmail.com). Logged in Brand v2 notes (`c24d9de2`). NB it is the FOLDER
(holds the design-system PDF + brand-notes doc), not the Doc "Brand Oulipo 2026".

**Share reservoir (MOST IMPORTANT - code done, NOT yet committed/pushed):**
generalized `src/stores/reservoir.ts` into a config-driven feed. Two feeds now:
APPLY (5, apply_opportunities) + SHARE (4, share_items). SHARE_AREA_ID
`c8007c92-...572de2a5d569`, target 4 (~4 shares/week). Eligible = share_items
status in ('backlog','suggested') (past target_slot stays eligible - an unshipped
share is still worth shipping, unlike apply deadlines which expire). Ordered
target_slot_at asc nulls last, priority, created_at. `toTodo` carries only a
FUTURE slot as deadline (past slots -> null so they don't land in Today as overdue
noise); notes = hook + external_url||drive_folder_url. Same read-only-source +
re-surface (11mo / 300-day later-cycle) rule as Apply. Hooks: App.vue
`ensureAllFeeds()` on auth; `vault.toggleComplete` now calls
`refillFeedForArea(todo.area_id)` (routes apply->5, share->4); ReservoirShare view
tops up on mount. New: `ReservoirShare.vue` + `/reservoir/share` route + sidebar
(App.vue) + Areas.vue entry. `src/utils/shareView.ts` (pure sort/filter) +
`tests/shareView.test.ts` (5 tests). Typecheck clean, lint 0 errors, 44 tests
pass. Seeded the initial 4 into the Share area via SQL mirroring the store
field-for-field (4 todos + 4 todo_tags + 4 surfaced_from, all shaped so the app
recognizes them: reservoir=true, source_table=share_items, meta.source_id ==
surfaced_from.source_id, state=anytime, deadline=null). Verified steady-state: app
now sees 4 open reservoir todos -> shortfall 0 -> no-op until one is completed.

**Next steps:** (1) commit + push the 3 new files + 5 edited (App.vue, router.ts,
vault.ts, reservoir.ts, Areas.vue) to `main` -> Vercel deploy - WAITING ON HALIM'S
GO (deploy is outward). Note working tree also has pre-existing edits I did not
make: specs/pickers-source-spec.md, src/types/database.ts, and linter touches to
when.ts + listControls.ts - review before staging. (2) After deploy, do a live
authed pass on /reservoir/share (feed refill on check-off, inline edits) - the
insert path was proven at the DB layer but not yet exercised through the authed
app.

## Session State (2026-05-29)

**Done & pushed** (commit 0876a65) - iteration-4 UX batch 2, all 3 phases:

- Phase D - kanban on Areas + Anytime. Extracted `KanbanBoard.vue`;
  `ProjectKanban.vue` is now a thin wrapper. New `AreaKanban.vue` +
  `/area/:slug/kanban` route + list/kanban ViewToggle on Area header. Anytime
  list/kanban toggle in StateList (persisted to localStorage `anytime-view`).
  Mobile = horizontal scroll-snap strip, verified no page overflow.
- Phase C - `useKeyboardShortcuts.ts` global registrar mounted in App.vue:
  n/c// /?/ g t·i·a / j·k roving row focus / x·space toggle / e·enter expand.
  `ShortcutsHelp.vue` overlay + sidebar `?` hint. `c` migrated out of CaptureBar.
  `.d-row-kbd` focus style in main.css. DenseToolbar "+ new" got
  `data-action="new-task"` so `n` works view-agnostically.
- Phase B.2 - `useListDragReorder.ts`: drag-reorder rows within a list group on
  Project + Area (intra-group only, unique Sortable group per bucket, persists
  position). Press-hold on touch.

Verified at 1280 + 375 via preview MCP: area kanban (4 cols), anytime kanban (80
cards), `?` overlay, Escape close, `g t`, `j/k`, `n` autofocus, `c` single draft,
mobile scroll-snap, 4 live Sortable instances on list bodies, 0 console errors.

**Earlier this iteration** (commits 117878c, 90a632a): notes autogrow (4x on
laptop), area chips in Today/Anytime, checklist drag, autofocus-on-new, sidebar
collapse-control removal, capture-at-top full-editor redesign, mobile tab-bar
hardening (removed backdrop-filter iOS tap-eater).

## Reservoirs + auto-feed + bug batch (2026-06 session 2)

NO schema changes (UI + app logic over existing tables, per Halim's hard rule).

**Reservoirs (UI nav, not a table):** sibling section to Areas. One item: Apply.
`/reservoir/apply` (`ReservoirApply.vue`) lists all `apply_opportunities` with
inline edit of deadline/status/priority. Sidebar caption section in App.vue +
mobile entry in Areas.vue. To add more reservoirs later, hardcode another link

- view (no registry).

**Apply auto-feed (`src/stores/reservoir.ts`):** keeps exactly 5 OPEN
`reservoir`-tagged todos in the Apply area (id `2690b483-...525bc5`), IN ADDITION
to the 3 manual todos. Source `apply_opportunities` is READ-ONLY (never edited).
Eligible = status='watchlist' AND (deadline null OR >= today); ordered deadline
asc nulls last, priority, created_at. Surfacing inserts a todo (notes=fit_note+
url, metadata {reservoir:true, source_id}), tags it `reservoir`, writes
`surfaced_from`. Runs on app load (App.vue isAuthed watcher) and after a reservoir
todo is checked off (hook in `vault.toggleComplete`). Single-flight guarded.
Re-surface rule (confirmed "yearly re-apply", with same-cycle-bounce FIX):
excluded while it has an open reservoir todo; once completed, eligible again only
when completion >11 months old OR the opportunity deadline is a genuinely LATER
cycle (>300 days after completion). The literal "deadline > completed_at" clause
was buggy (future deadlines bounce back same cycle) - hence the 300-day guard.
Verified against prod DB: 5 correct opps surfaced, surfaced_from linked, manual
todos coexist, idempotent, check-off refills.

**Bugs fixed (a-h):**

- a search opens task: global `todoModal` store + `TodoEditorModal.vue` (App.vue);
  CommandPalette todo result opens it. Verified live.
- b inbox excludes filed: `vault.loadInbox` adds `area_id is null AND
project_id is null` (1 real row was leaking).
- c priority moved to top of `TodoEditor` (under title).
- d notes collapsible (chevron toggle). Verified live.
- e priority drag in LIST: `useListDragReorder` now shares one Sortable group
  across priority sections + reads `data-prio` to set priority on cross-section
  drop (was intra-group-only).
- f area->area drag: Sortable owns the drag so DenseRow's dragstart never fired;
  added `setData` to KanbanBoard + useListDragReorder to stamp the
  `application/x-hmart-todo` MIME so AreasNav drop reassigns area_id.
- g date-clear re-evaluates placement: `reconcileListsMembership(id)` in
  `vault.updateTodo` adds/removes the row from inbox/today/area/project lists in
  place (no refresh).
- h clickable links in notes: linkified read view in TodoEditor (http(s)/www +
  bare domains via TLD allowlist). Verified live (pen.org/... -> anchor).

NOTE e + f are native HTML5 DnD - wiring verified (shared group + data-prio +
setData) but the actual drag needs a real-device/desktop confirmation (headless
preview can't faithfully simulate native drag).

## Hmart-kanban task improvements (2026-06 session 3)

Drawn from the "Hmart kanban" todo's "Next" list (a35c679b...). Bugs a-h from
the earlier batch were already shipped; this session did the remaining items.

- **Things-style "When" picker** - `src/utils/when.ts` (when->{state,start_date,
  evening} mapping + local-date helpers, 20 unit tests in `tests/when.test.ts`)
  and `WhenPicker.vue` (reuses Popover; today / this evening / tomorrow / this
  weekend / specific date / someday / clear). In TodoEditor it sits ABOVE notes
  (replaced the raw start-date + evening controls; deadline stays separate). A
  compact when-chip on every DenseRow lets you drop any task into Today without
  opening the editor (empty chip = hover-reveal desktop / always on touch).
  Verified end-to-end: this-evening + clear writes persisted; reconcile floats
  tasks in/out of Today live.
- **Notes collapsed by default** - TodoEditor notes read-view clamps to ~5 lines
  with "show more / show less"; click-to-edit + clickable links preserved.
- **Inbox-drag bug fix (root cause)** - `reorderTodos` and the realtime
  `applyTodoChange` changed priority/state but never called
  `reconcileListsMembership`, so a P0->P1 drag left the row stale / "disappeared
  from inbox". Added reconcile to both. This also makes priority-section and
  area drags settle correctly.
- **AI auto-enrichment on add** - `supabase/functions/enrich_todo/index.ts`
  (deployed, v1, verify_jwt on; reuses callClaude + buildContextBundle +
  ANTHROPIC_API_KEY). Fired fire-and-forget from `vault.createTodo` when
  `enrich:true` (AddTaskInput quick-capture only; CaptureBar opts out). Appends
  a "## suggested (claude)" notes block + infers a deadline when confident,
  append-only + idempotent (metadata.enriched). `src/lib/enrichTodo.ts` is the
  client invoke; TodoEditor watches `props.todo.notes` to show enrichment live.
  Pipeline verified end-to-end (OPTIONS 200 -> POST reaches Anthropic). NOTE:
  currently returns 500 "credit balance is too low" - the ANTHROPIC_API_KEY
  account needs credits; everything else works and degrades gracefully (todo is
  created normally, just not enriched). All existing AI functions share this key.
- **Mobile keyboard on new task** - `CaptureBar.openBar()` focuses an offscreen
  primer `<input>` synchronously inside the tap so iOS raises the keyboard before
  the async draft is created (it then hands off to the title field). Needs a
  real-device confirm (headless preview can't test the iOS keyboard).
- **Area emojis** - added emoji prefixes to the 8 plain area names in the DB
  (data, not schema) to match the 4 Halim set: 🗂️ admin, 📮 apply, 💲earn,
  📚 learn, ⚒︎ make, 🤝 network, 📣 share, ✍️ write, 🩺 health, 📈 wealth,
  🧘 mindset, 🔭 structure.

Parked from the same task notes: the "Route Kindle + Matter highlights into
Supabase" research note (a separate data-pipeline project, not a kanban UI item).

## Deep-review fixes (2026-06 session 4)

An 8-dimension adversarial review (each finding independently verified) raised 47,
confirmed 37. Fixed the high-impact set:

- **CRITICAL dnd-1**: kanban drag never persisted - onEnd read the column via
  `evt.to.parentElement.dataset.col`, but `data-col` is on `.d-kanban-col-wrap`
  while the Sortable root's parent is DenseGroup's `.d-col-body` (no data-col),
  so `toColId` was always null and `reorderTodos` never ran (card reverted on
  reload). Now resolves the column from the Sortable element via the `colRefs`
  registry. (KanbanBoard.vue)
- **HIGH state-1**: StateList (anytime/upcoming/someday/logbook) renders from a
  detached `items` fetch that the store's reconcile/realtime never touch, so
  in-place edits there went stale. Added a `rev` counter in vault (bumped on
  every mutation + realtime) and StateList reloads (debounced) on it. Verified
  live: setting when=today on an /anytime row now drops it from the list.
- **HIGH regress-1**: when-scheduled tasks showed in BOTH Anytime and Upcoming.
  loadByState anytime now excludes future start_date (`start_date null or <=
today`); upcoming excludes completed (gap-1). Verified: 4 dup tasks de-duped.
- **dnd-3**: list empty priority section is now a drop target (always render
  `.d-list-body` + "drop here" hint) so you can drag a task into an empty bucket.
- **regress-2/ds-9**: DenseRow converted from a fragile fixed 8-col grid (mis-slot
  when optional cells absent) to flex (greedy title, right-hugged chips).
- **dnd-2**: `.d-col` overflow hidden -> visible so the row when-chip popover
  isn't clipped in kanban columns.
- **ds-1**: removed shadow-xl from the 3 modal panels (brand forbids shadows).
- **ds-7**: replaced all em dashes in UI copy with hyphens (Halim's hard rule).
- **a11y-7 / a11y-4**: aria-label + title on the icon-only when-chip; larger
  touch target on coarse pointers.
- **sec-1**: enrich_todo now verifies the todo's user_id matches the JWT caller
  (IDOR guard). Redeployed via `supabase functions deploy enrich_todo` (CLI,
  bundles real \_shared). Owner-call verified (passes auth -> reaches Claude ->
  still the credit-500 until credits added).

Consciously DEFERRED (low risk for a single-user app; noted for later): focus
traps + menu keyboard-nav (a11y-2/3), muted-text/P0-pill contrast (a11y-5/6),
roving tabindex (a11y-8), un-complete-to-anytime (state-4), reservoir multi-tab
overshoot + edge cases (res-1/3/5, gap-2), enrich cost/rate-limit (cost-1),
design nits (ds-3/4/5/8 radius/px/drop-wash/lowercase-mono). watch-1 assessed as
not a real bug (the !notesEditing guard holds because props.todo.notes only
changes after blur). NOTE: dnd-1/dnd-3 are native HTML5 DnD - logic is fixed and
typechecks but needs a real on-device drag to see end-to-end.

## Today rework + notes bug (2026-06 session 5)

From the Hmart kanban task's newest "Next" block:

- **Today filter/sort/group + list view** - Today.vue rewritten to use the shared
  listControls machinery (DenseToolbar route-key "today") so filter/sort/group
  work (they were on the old useFiltersStore/FilterBar, now deleted). Added a
  list/board ViewToggle (localStorage "today-view", default list).
- **Today semantics** - new "today" GroupMode (in listControls + groupTodos +
  GroupPopover, gated by DenseToolbar `showTodayGroup`) = two sections **p0 +
  scheduled**, no "overdue" bucket. loadToday content unchanged (P0 +
  today-or-earlier / state=today).
- **Notes-typing bug** - typing the first letter in a NEW task's notes made
  notes non-empty, and with notesEditing still false the `v-if="notesEditing ||
!notes"` swapped the textarea for the read view and dropped focus. Fixed with
  BOTH `@focus` and `@input` latching notesEditing=true (bulletproof vs focus
  races). Verified live.
- Tests: tests/listControls.test.ts (groupTodos today/priority, applyControls
  filter+sort). 32 passing.

**BLOCKED - reformat all notes (TLDR > Next steps > Content w/ sections):** needs
Sonnet to restructure 208 substantial notes (one is 38k chars) and is a
destructive rewrite of real content (incl. THIS task's own instruction notes +
big project narratives). Anthropic credits are exhausted (enrich_todo still
500s "credit balance too low"), so it cannot run. When credits return, do it
safely: back up every note first, run a 3-5 todo test batch and verify quality,
exclude reservoir-fed + meta/instruction tasks, idempotent via a metadata flag.

## Apply reservoir sort/filter (2026-06 session 6)

ReservoirApply.vue gained a controls bar: SORT (deadline | priority, ViewToggle)

- SHOW status chips (toggle any of the 7 statuses; "skipped" hidden by default
  per request). Both persisted (localStorage reservoir-apply-sort /
  reservoir-apply-hidden). Pure sort+filter in src/utils/applyView.ts
  (viewApplyOpportunities), unit-tested in tests/applyView.test.ts (6 tests).
  Verified live: deadline/priority re-sort, skipped hidden by default + toggleable.

## Inbox + StateList: working controls + drag (2026-06 session 7)

Root cause of "inbox full of bugs / can't drag/sort/filter/group": DenseToolbar
renders filter/sort/group buttons even WITHOUT a route-key, so any view using it
without one had dead controls. Inbox + StateList were the two (Today/Project/Area

- kanbans already wired). Both now use the standard pattern.

* New "area" GroupMode (listControls groupTodos takes areasById; GroupPopover
  gated by DenseToolbar `showAreaGroup`).
* Inbox.vue: route-key "inbox", applyControls + groupTodos + useListDragReorder.
  Default group=none, sort=manual (drag sticks). loadInbox now orders by position
  first so manual order persists. Captures triage section preserved on top.
* StateList.vue: route-key per mode (`state:<mode>`), applyControls + groupTodos
  - useListDragReorder. Defaults: anytime/someday group=area, upcoming/logbook
    group=none, all sort=manual. ensureDefaults() seeded synchronously in setup
    (before first render) so listControls.get() doesn't create the generic default
    first. Kept the anytime list/kanban toggle. (Replaces the old bespoke area/date
    grouping with the consistent groupTodos pattern; date still shows per-row.)
* Tests: groupTodos "area" (tests/listControls.test.ts). 39 passing.

Verified live: inbox + all 4 state modes - controls functional (group regroups,
filter applies, sort changes order), Sortable attached on every section body,
data-id row wrappers, no console errors, no horizontal overflow.

## Parked (Cluster B - explicitly deferred by Halim)

- Recurring tasks -> Supabase audit/seeding (infra wired, 0 rules exist).
- Captured-docs done/not-done audit (73 captures).
- Notion + Google Drive Learn/Make scan -> learn_wikis/learn_items. NOTE: no
  Notion connector available; Drive is. Revisit when re-prioritized.

## Next steps / open

- Confirm Vercel build of 0876a65 is green on the live URL.
- Optional polish: list drag-reorder is meaningful only when sort = priority/
  manual (deadline/created sorts override position) - could disable the handle or
  hint when sort would override. Low priority.

## 2026-08-01 - claude inbox: suggested areas + density pass

Two asks from Halim: suggestions arrived with no area, and the inbox was too
airy.

**Suggested area.** The routine cannot write `todos.area_id` - the inbox is
defined as "no area, no project, no date", so a real area_id files the row out
of the inbox before it is ever seen. So the area rides in metadata:

- `ClaudeMeta.suggested_area` (area slug) + `resolveSuggestedArea(meta, areas)`
  in `src/types/claude.ts`. Matches slug first, then the emoji display name with
  emoji/spacing stripped ("health" -> "🩺 health"). Returns null rather than
  guessing.
- The row renders the slug as a chip; `keep()` applies it as the real `area_id`,
  so a kept suggestion files itself instead of landing back in the unsorted pile.
  Toast names the area.
- Routine side: `~/.claude/scheduled-tasks/daily-desk/SKILL.md` now requires
  `suggested_area` on every suggestion, with routing rules per area. The portable
  copy in `hmart.memory_entries` ("Routine spec: daily-desk (portable)") matches.
- Backfilled the 8 pending suggestions.

**Density.** `from claude` rows and capture rows are one line each: kind chip,
title, dim inline "why", area chip, quiet actions (opacity 0.4 -> 1 on hover /
focus-within, always opaque on coarse pointers). The offer direction input
collapses to 0 width until hover or focus, which also lines the area chips up in
a column. Measured: 90px -> 24px per row, 9 rows in 245px.

Responsive: under 760px the "why" hides so titles keep their room; coarse
pointers wrap the row and restore full-size controls.

Checks: typecheck clean, lint 0 errors, 72 tests pass (7 new in
`tests/claude.test.ts`), build green. Verified live against a temporary public
harness route (removed afterwards) since the in-app browser has no session.

Follow-ups in the same pass:

- Area chip finalised per `src/styles/DESIGN.md`: colour dot (`projectColor(slug)`,
  the sidebar's project idiom) + mono uppercase label on `--ink-08`, solid
  `--ink-70` ink rather than washed grey - it is a routing decision, it should
  read at a glance. No suggested area renders a dashed "unfiled" chip so the
  column never has a hole. (The generic ShadCN/Tailwind "product design system"
  skill does not apply to this app - the repo has its own token system.)
- Captures: a 10k-character capture was rendering in full and swallowing the
  page. Now one line, click to expand into a scrollable block.
- Routed the stuck capture (Berry AI-symposium argument thread, pending since
  2026-07-31) into write as "berry symposium: redundancy in time vs redundancy
  in space", full text preserved in the notes. The auto-router never ran on it -
  no capture has been auto-routed since 2026-06-03, worth a look if captures are
  meant to self-triage.

---

## 2026-08-07 - drag reorder, notes editing, format bar, sidebar density

Four requests in one pass. Shipped as `b87470b`, `cde5c77`, `29e4fc6`.

**Drag reorder in Today and Inbox was not a drag bug.** `reorderTodos` had been
persisting positions correctly the whole time. `applyControls` in
`src/stores/listControls.ts` was re-sorting them away: the `"priority"` case
tie-broke on `title.localeCompare` (changed in `322cab6`), and `"priority"` is
the DEFAULT sort, so every drop snapped straight back. Restored the
position-based tiebreak; alphabetical stays available as the explicit "a to z"
mode. Two regression guards in `tests/listControls.test.ts` fail against the old
tiebreak. `useListDragReorder` now also switches the list to manual order (with
a toast) if you drop while a computed sort is active, instead of silently
discarding the drop.

**Notes editing.** Four separate causes, all fixed:

- read view and textarea now share ONE type block, so the swap is invisible.
  The 15px -> 16px jump on mobile was the iOS anti-zoom rule applying to only
  one of the two.
- `src/utils/caret.ts` maps a click on the rendered read view to a character
  offset, so the caret lands where you clicked instead of at the end. Handles
  the element-resolved hit test (clicks past the end of a line), which is the
  common case.
- `src/utils/autosize.ts` measures without letting any scroll container move.
  It pins the nearest scrollable ancestor, not just the document - the editor
  lives inside a scrollable modal.
- writes the height only when it actually changed.

**Selection format bar** (`src/components/SelectionFormatBar.vue`): bubble
toolbar over any textarea, attached by ref so notes and week-goals share it
without either becoming a rich-text editor. Notes stay plain markdown; the bar
toggles markers (`src/utils/textFormat.ts`, pure functions).

**The review was worth it.** A 40-agent adversarial workflow on the first cut
confirmed 21 defects out of 37 claims. Two were critical and neither was
reachable from a desktop browser:

- `@touchstart.prevent` suppressed the synthesized `click`, so the bar was inert
  on EVERY touch device while desktop worked perfectly. `@pointerdown.prevent`
  preserves focus without killing activation. Worth remembering as a general
  trap.
- a textarea keeps its selection after blur, and only one of four paths into
  `place()` checked focus, so the bar re-appeared over unfocused fields.

Also from the review: measure the bar rather than guess (the 240px fallback was
ALWAYS what got used; the real touch bar is 300px and hung 52px off a 375px
phone), emit `formatted` after Vue's patch not before, restore the selection on
a microtask not a macrotask, and handle `pointercancel`.

**Sidebar density.** 771px -> 484px with all 12 areas and 3 projects, no change
to type size or contrast. The 18px hover drag grip was the tallest thing in an
area row and was holding it open.

**Verification notes for next time.**

- The in-app browser pane has no Supabase session, so live checks need a
  temporary harness page (`verify-harness.html` + `src/verify-harness.ts`,
  deleted before commit). Same pattern as the earlier capture-row work.
- That pane's window has no OS focus, so `blur`/`focusout` NEVER fire in it even
  though `document.activeElement` updates. Blur behaviour has to be proven in
  jsdom.
- Chrome's scroll anchoring masks the autosize scroll jump entirely. Set
  `overflow-anchor: none` to reproduce Safari, which has no scroll anchoring -
  that is where the old code jumped -960px per keystroke.
- vitest hangs intermittently; `--pool=forks --poolOptions.forks.singleFork`
  works around it.

Checks: typecheck clean, lint 0 errors (7 pre-existing `migration/*.ts`
warnings), 137 tests pass (was 102), build green. Every new test was run against
the pre-fix code first to confirm it actually fails there.
