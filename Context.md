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
