# Things 3 follow-ups (from gap analysis)

Source: `specs/things-3-gap-analysis.md` (4,472 words). This file is the actionable cut, ordered by impact-per-hour for one builder.

Sequencing follows the analyst's recommended 3-sprint rhythm. Each item references the exact file(s) to touch so they're scoped enough to estimate.

---

## Sprint 1 (this week) - the input layer

The single biggest unlock. After this sprint, capturing + scheduling feels like Things 3.

- [ ] **WhenPicker.vue** - new popover anchored to a `📅` icon in `TaskRow.vue`. Buttons: Today / This Evening / Tomorrow / This Weekend / Someday / custom-date / Add Reminder / Add Deadline. Triggered by `s` keypress on a focused row. Replaces the two raw `<input type="date">` in `TodoEditor.vue`.
- [ ] **Natural-language date parsing** - `chrono-node` dependency, `src/lib/dateParse.ts` helper. Wire into WhenPicker text input AND `AddTaskInput.vue` so "tomorrow 6pm" parses on capture. Use parsed reminder time when present.
- [ ] **Reminders schema + UI + delivery** - migration `0003_reminders.sql` adds `reminder_at timestamptz` to todos with partial index. WhenPicker exposes "remind me" presets. Service worker + Edge Function `fire_reminders` invoked by pg_cron every minute. Web Push first (cheapest), Telegram later.
- [ ] **Hotkeys map** - new `src/lib/hotkeys.ts` registering one window keydown listener. Row-focused shortcuts: `Cmd+T` start today, `Cmd+E` this evening, `Cmd+R` anytime, `Cmd+O` someday, `Ctrl+]` +1 day, `Ctrl+[` -1 day, `Cmd+Shift+M` move-to. Track focused todo id on a new `src/stores/selection.ts`.
- [ ] **Quick Find / Type Travel** - in `CommandPalette.vue`, branch on single printable keypress (when no input has focus): open palette with that char as initial query. Reserve `g/c/n` as single-key actions; everything else routes through Quick Find.

## Sprint 2 (next week) - the editing surface

- [ ] **Headings inside projects** - DB is ready (`hmart.headings`, `todos.heading_id`). Build `HeadingRow.vue` with collapse chevron; `vault.{create,update,delete,reorder}Heading`; modify `Project.vue` to group by heading_id (todos with null heading render first). LocalStorage collapse state per (project, heading).
- [ ] **Magic Plus button** - replace `CaptureBar.vue`'s FAB with `MagicPlus.vue`. On `pointerdown` capture cursor and render drop targets: an "inbox" pill, a row-cursor line that snaps between rows (use `elementFromPoint` + the `data-id` attrs already on rows), and a "→ heading" hint in the leftmost ~80px. On drop, infer `position`, `project_id`, `heading_id`, or `state='inbox'`.
- [ ] **Multi-select + bulk actions** - new `src/stores/selection.ts` keyed by todo id. `TaskRow.vue` wires `shift+click` (range) + `cmd+click` (toggle). Sticky bulk-action strip at top of any list when `selection.size > 0`: schedule, move, tag, complete, delete. Reuses `vault.updateTodo` per id.
- [ ] **Move-to (Cmd+Shift+M)** - extend `CommandPalette.vue` with a "move mode": when the user types `> move` or hits the shortcut, results become destinations. Return calls `vault.updateTodo` per selected id with `{project_id, area_id, heading_id}`. The `> ` prefix is the convention for "do" vs "go".
- [ ] **Project completion ceremony** - in `vault.toggleComplete`, after the update succeeds, count remaining open todos for that project; if zero, `toast.show("complete project '<name>'?", { label: "yes", run: ... })`. Filter `AreasNav.vue` to `state='active'` by default with "show completed" toggle. Render a small svg pie-fill icon next to project names.

## Sprint 3 (week 3) - the ambient layer

- [ ] **Calendar events bar in Today** - new `calendar_events` cached table + Edge Function refreshing via Google Calendar OAuth every 15min + `CalendarBar.vue` above `<FilterBar>` in `Today.vue`. Read-only mirror.
- [ ] **Right-click context menus** - new `ContextMenu.vue` (Teleport-mounted, takes `{x, y, items}`). Wires on TaskRow: complete/cancel, when..., move to..., add tag..., convert to project, show in project, copy link, delete. Per the analyst: this one component unlocks four Tier-A/B items at once.
- [ ] **Bulk reschedule from Upcoming view** - in the existing `StateList.vue` (mode=upcoming), let drag-drop between date-grouped sections re-schedule.
- [ ] **Cancel state vs Complete state** - `todos.state='cancelled'` exists in the enum but no UI sets it. Add a "cancel (don't count as done)" action on rows; show cancelled in Logbook with strikethrough + different styling.

## Backlog (Tier C nice-to-have, Tier B not in the first 3 sprints)

See `specs/things-3-gap-analysis.md` for full detail. Highlights worth tracking:

- Print-to-PDF / share project as markdown (small, high-novelty)
- Area + project icons (custom emoji or svg picker)
- Project notes textarea (Markdown, lazy-saved)
- Today badge / OS badge / dock badge via service worker
- Multiple repeat rules - "every N days/weeks/months", "after completion + N days", custom rules. The schema has `repeating_rules.rule` as jsonb so this is free at the DB layer.
- Sub-project / sub-heading nesting (Things tops out at heading > todo > checklist; we match)
- Project archive (separate from complete - "I'm done with this project but it didn't complete")

## Deliberate omits (don't build)

- iCloud sync (Supabase replaces it)
- Native iOS share extension (PWA share-target is in scope, native is not)
- Things URL scheme (`things:///`) - our analog is the Cmd+K command palette
- Apple Pencil / handwriting input
- Per-platform native widgets (iOS home-screen widget, macOS today widget)

---

**Estimate (rough):** Sprint 1 ≈ 8-12 hours. Sprint 2 ≈ 12-16 hours. Sprint 3 ≈ 8-12 hours. Total ≈ 30-40 hours to hit Things 3 daily-use parity.
