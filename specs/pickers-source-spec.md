# Pickers Source Spec - verbatim from Cowork scheduled tasks

This is the lossless source-of-truth extraction of all 18 Cowork scheduled tasks living under `/Users/halim/Documents/Claude/Scheduled/`. Each Hmart Kanban Edge Function picker (US-015) ports from one or more of these. The PRD says "not a single detail should be lost" - this file is that promise.

Extracted: 2026-05-18 by an Explore subagent reading every `SKILL.md` file verbatim. Updates require re-running the same extraction against the current Cowork state.

There are two shared addendum specs that several tasks reference:

- `/Users/halim/Documents/Claude/Scheduled/_artifact_addendum.md` - the rolling-artifact contract + the dashboard HTML/CSS design system (root vars, card classes, chip colors, button JS, empty-state, summary message).
- `/Users/halim/Documents/Claude/Scheduled/_claude_tasks_addendum.md` - the 14-project Inbox/Capture spec + Loop 1 (capture routing) + Loop 2 (backlog refill) + the read-pattern the 6 daily/weekly briefings use to consume the inbox notes. Defines the split-pattern (Share, Apply, Submit, Learn-Lit, Learn-Tech, Meet, Make - with `_Backlog_.md` files and caps) vs single-note pattern (Wealth, Health, Structure, AI-Champions, LLC, Lodging, Habits).

---

## TASK: inbox-hourly-process

- **Source file**: `/Users/halim/Documents/Claude/Scheduled/inbox-hourly-process/SKILL.md`
- **Cadence**: Hourly (every hour). Per 2026-05-13 lock, this task is now ALSO the executor for Capture items, not just a router.
- **Operating rule (locked 2026-05-13)**: Treat each Capture item as a prompt to ACT on, not a queue entry to convert into a prompt-for-Halim. If a capture says "create wiki X", you create the wiki. If "draft text to Y", you write the final draft. If "rename file A to B", you rename it. If "book event Z", create the calendar event. Only when Halim's hands or judgment are genuinely required (give a talk, call a doctor, choose between options) does a row remain as a `## Tasks` item at the destination.
- **Source files read**:
  - `/Users/halim/Documents/second-brain/00. To Do/Capture.md` (mobile capture inbox) - items live as bullets under `## Pending`. Iterate top-to-bottom.
  - Destination files across the vault for routing target (see "Routing destinations" below).
  - Root `CLAUDE.md` for global rules.
  - `feedback_act_dont_prompt.md`, `feedback_note_economy` referenced.
- **Vault layout (post 2026-04-26 reorg)**:
  - Vault is `/Users/halim/Documents/second-brain`.
  - `00. To Do/` contains exactly `Capture.md` and `OKRs.md`. Legacy `Claude Queue.md` and `prompts/` folder were retired.
  - Areas:
    - `A0. Structure` - vault structure, system meta, brand/positioning research
    - `A1. Learn` - reading, e-poetry, computational poetry literature, tech tools (`_Backlog Lit_.md`, `_Backlog Tech_.md`), wikis at `1. Wikis/`, raw notes at `0. raw/notes/`
    - `A2. Make` - weekly piece-shipping; `Pn/` has active projects
    - `A2. Write` - drafts (`Active/`, `Completed/`) and proto-wikis (`2. In Progress/`)
    - `A3. Share` - IG, Substack, brand voice, posting playbook
    - `A4. Apply` - residencies, submissions, grants
    - `A5. Network` - outreach, contacts, gatherings, peer/curator/journalist work
    - `X0. Earn` - P0 Clarinet, P1 Invisible, P1 Teaching '27, PN Wikitongues, PN Clarinet Hiring
    - `X1. Mindset`, `X2. Health`, `X3. Wealth`, `X4. Admin`
  - Within each area: `_Backlog_.md` (or `_Backlog Lit/Tech_.md` for A1.Learn) is area-level inbox + active list; `Pn/PN *.md` files are active projects; `Px/PN *.md` are later projects.
- **Picker / process logic (verbatim)**:
  1. **Read** `/Users/halim/Documents/second-brain/00. To Do/Capture.md`. Items live as bullets under `## Pending`. Iterate top-to-bottom.
  2. **For each pending item:**
     - a. **Pick the destination** by topic match (rules in "Routing destinations" below). Prefer the more specific destination (project file > area backlog).
     - b. **Classify the action:**
       - **Hands-required (Halim must act):** call a doctor, give a talk, buy a thing in-person, sign a document, choose between options where Claude lacks context, attend a meeting. -> Add a `- [ ] [Pn]` row to the destination's `## Tasks` (project file) or `## To Do` (backlog) with deadline if implied. No prompt, no fenced code block.
       - **Claude-finishable (Claude can complete autonomously):** create wiki / raw note, draft text / email / caption / pitch, do a research lookup, rename / move a file, update frontmatter, add a calendar event via the calendar MCP, fold an existing note into a wiki, scaffold a new project file. -> **Execute the work now.** Write the wiki / note / draft / change. Add a `- [x]` row to the destination's `## Done` describing what was done.
       - **Blocking-on-confirmation (Claude needs one piece of info to proceed):** add a row stating the question. Example: `- [ ] [P0] Confirm whether "Tobias" is Tobias Rees - blocks Schmidt outreach draft.` Do not write a prompt; ask the question concisely.
     - c. **Apply vault formatting rules:** no em dashes (use `-`), no blank lines between bullets, bold-first-words on inbox bullets, `[P0]/[P1]/[P2]` priority prefix, single-line Obsidian checklist format. No `#claude-assisted` tag on new rows.
     - d. **For draft outputs (emails, texts, captions):** drop the final-form draft text inline at the destination, ready to send. For Gmail-destined drafts, also create the Gmail draft via the Gmail MCP. No separate `.md` files for one-off drafts (per `feedback_note_economy`).
     - e. **For new wikis / raw notes:** create the file at the proper path with the schema in `A1. Learn/CLAUDE.md`. Update `A1. Learn/index.md` and `A1. Learn/log.md` per the LLM Wiki PRD.
  3. **Mark the Capture item as routed.** Move the original bullet from `Capture.md ## Pending` to `## Routed` with a trailing annotation describing what was DONE: `-> <destination path>#section (<what was done>), YYYY-MM-DD`. Do not delete.
  4. **Low-confidence items.** If you cannot pick a destination with reasonable confidence, leave the item in `## Pending` with a `[needs-route]` tag and surface it in the output report. Don't guess.
- **Routing destinations (verbatim)**:
  - Residency, submission, grant, fellowship, journal, podcast pitch outlet -> `A4. Apply/_Backlog_.md`
  - New contact, outreach draft, intro, gathering, meetup, peer note, curator/journalist -> `A5. Network/_Backlog_.md` (or specific project)
  - IG, Substack, post, brand voice, share-related coaching -> `A3. Share/_Backlog_.md`
  - E-poetry reading, lit research, computational poetry canon -> `A1. Learn/_Backlog Lit_.md` (executed wiki/note lives at `A1. Learn/1. Wikis/` or `A1. Learn/0. raw/notes/`)
  - Tech tool, SDK, dev infra, p5.js, AI library -> `A1. Learn/_Backlog Tech_.md`
  - New piece concept, ship-calendar, Make weekly rhythm -> `A2. Make/_Backlog_.md`
  - Brand visuals, logo, type system, halimmadi.com brand -> `A2. Make/Pn/PN Brand v2 EO May.md`
  - Tax, S-corp, retirement, financial decision, LLC bookkeeping -> `X3. Wealth/Pn` or `_Backlog_.md`
  - Health (P0 areas: Teeth, Gut, Knee + memory) -> `X2. Health/PN <area>.md`
  - Vault structure, memory, skill cleanup, briefing migration, format guard -> `A0. Structure/Pn/`
  - Strategic positioning research -> `A0. Structure/_Strategy_.md`
  - Earn / contracts / Clarinet / Invisible / Wikitongues / Teaching '27 -> `X0. Earn/<project>.md`
  - Calendar event (with date and time) -> use the Google Calendar MCP to create the event; do not add to a note.
- **Output report (after processing)**:
  - Items routed + executed (count + per-area breakdown)
  - Wikis / raw notes / drafts / file moves performed (with paths)
  - Items left as `## Tasks` rows (hands-required) - count
  - Items left blocking on confirmation - count + the actual question(s)
  - Items still pending (low-confidence destination)
  - Any formatting issues encountered
  - Keep under 200 words. No filler. No prompts.
- **Constraints**:
  - Never invent a deadline. If Halim didn't specify, leave it off.
  - Never auto-promote priority. Default to P2 unless the item explicitly says urgent / today / by [date in next 14 days].
  - Never delete items from Capture - only move from Pending to Routed.
  - Never modify destination file frontmatter or H1/H2 structure beyond inserting bullets in existing sections or appending new sections per area conventions.
  - If a destination's `## Tasks` section doesn't exist yet, create it under `## Goal`.
  - No em dashes. Final pass before write.
  - No `#claude-assisted` tags on new rows.
  - No fenced-code-block "prompts" anywhere in routed output.
  - No separate `.md` files for one-off drafts.
  - Do not write to Things 3.
- **Tools required**: Filesystem (vault reads/writes), Gmail MCP (for create_draft on email-destined drafts), Google Calendar MCP (for calendar events).
- **Output destinations**: Various - per-routing-destination listed above. Modifies `Capture.md` (`## Pending` -> `## Routed`).
- **NOTE re: legacy addendum**: The shared `_claude_tasks_addendum.md` describes an earlier 14-project inbox layout with Loop 1 (capture routing) + Loop 2 (backlog refill) across split projects (Share, Apply, Submit, Learn-Lit, Learn-Tech, Meet, Make) and single-note projects (Wealth, Health, Structure, AI-Champions, LLC, Lodging, Habits). That spec's scoring rules for Loop 2 are: Share = imminent event/release > P0 > freshness; Apply/Submit = deadline <=30d > P0 > deadline asc; Learn-Lit/Learn-Tech = tag-match against active drafts; Make = ship-rhythm alignment. The 2026-05-13 version of inbox-hourly above supersedes the loop logic but the scoring rules carry over to the per-area briefings.

---

## TASK: daily-sync

- **Source file**: `/Users/halim/Documents/Claude/Scheduled/daily-sync/SKILL.md`
- **Cadence**: Daily 9 PM local. Contract: checkbox in any briefing today = source file updated tonight = clean slate for tomorrow's 6 AM render.
- **Purpose**: Propagate today's checked boxes from every rolling briefing to their source files, so tomorrow's 6 AM briefings reflect what was actually done.
- **Source files read (briefing -> source mapping)**:
  | Briefing markdown                   | Source files (where checked rows are propagated)                                                                                                                                                            |
  | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `A1. Learn/Learn-Briefing.md`       | `A1. Learn/_Backlog Lit_.md` and `A1. Learn/_Backlog Tech_.md`. Checked items move from `## Doing` to `## Done`. Attach any "What did you learn?" note.                                                     |
  | `A2. Write/Write-Briefing.md` (NEW) | `A2. Write/_Backlog_.md` for `## To Do` items. Wiki frontmatter at `A1. Learn/1. Wikis/<tag>.md` for priority shifts. If Halim noted what he wrote, append a `## Source notes` synthesis entry to the wiki. |
  | `A2. Make/Make-Briefing.md`         | `A2. Make/_Backlog_.md` and individual project files (`Pn/Px *.md`).                                                                                                                                        |
  | `A3. Share/Share-Briefing.md`       | `A3. Share/_Backlog_.md`.                                                                                                                                                                                   |
  | `A4. Apply/Apply-Briefing.md`       | `A4. Apply/_Backlog_.md`.                                                                                                                                                                                   |
  | `A5. Network/Network-Briefing.md`   | `A5. Network/_Backlog_.md` and per-person notes (per `feedback_per_person_network_notes`).                                                                                                                  |
  | `X0. Earn/Earn-Briefing.md`         | `X0. Earn/_Backlog_.md` and project files.                                                                                                                                                                  |
  | `X2. Health/Health-Briefing.md`     | `X2. Health/_Backlog_.md` and project files.                                                                                                                                                                |
  | `X3. Wealth/Wealth-Briefing.md`     | `X3. Wealth/_Backlog_.md` and project files.                                                                                                                                                                |
  | `X4. Admin/Admin-Briefing.md`       | `X4. Admin/_Backlog_.md` and project files.                                                                                                                                                                 |
- **Sync algorithm (verbatim)**: For each briefing:
  1. Read the briefing markdown. Find every `- [x]` checkbox.
  2. For each checked item, locate the matching row in the source backlog/project file by row text match (the bolded title is the most reliable anchor).
  3. Move the row from its current section (`## Doing`, `## To Do`, `## Tasks`) to `## Done` with today's date prefix and any inline note Halim left in the briefing.
  4. Re-render the briefing's checkbox state to `- [ ]` for the moved rows so tomorrow's 6 AM render starts clean.
  5. Update the rolling Cowork artifact for that briefing if the markdown content changed (use `update_artifact` with the canonical id - `learn-briefing`, `write-briefing`, `make-briefing`, etc.).
- **Special cases**:
  - **Wiki priority shifts.** When a `Write-Briefing.md` row is checked and the briefing's "Suggested move" line or Halim's inline note contains a P0/P1/P2/dormant token, update the corresponding wiki's frontmatter `priority` field at `A1. Learn/1. Wikis/<tag>.md`. Append an entry to `A1. Learn/log.md`:
    ```
    ## [YYYY-MM-DD] promote | [[<wiki-tag>]] <old> -> <new>
    - Source: Halim checked + noted in Write-Briefing
    - Reason: <one-line from Halim's note>
    ```
  - **Synthesis entries.** When a Write-Briefing wiki row is checked AND Halim's note describes what he drafted, append a `## Source notes` entry to that wiki dated today, tagged `synthesis`:
    ```
    - **YYYY-MM-DD.** <Halim's one-line note about what he drafted>. Tag: `synthesis`.
    ```
    Increment the `sources` count and update `last_ingest` in the wiki frontmatter.
  - **Resurface tags.** Per `feedback_learn_resurface_cycle`, when a Learn-Briefing item is checked and Halim added a note, set `Resurface: YYYY-MM-DD` (6 months out from today) on the corresponding `_Backlog Lit_.md ## Done` entry.
  - **Per-person network notes.** When a Network-Briefing item is checked, the per-person index row in `A5. Network/_Backlog_.md` gets the date stamp and any note. The per-person file (e.g. `A5. Network/Px PN <name>.md`) is NOT modified by sync - that file is Halim's working space.
- **What to log (append once after all briefings)**:
  ```
  ## [YYYY-MM-DD] sync | nightly checkbox propagation
  - Briefings scanned: 10 (or however many had checks)
  - Checks propagated: N (Lit: a, Write: b, Make: c, ...)
  - Wiki priority shifts: <list, if any>
  - Synthesis entries created: N
  - Anomalies: <rows that could not be matched, if any>
  ```
  Append to `A1. Learn/log.md`.
- **Failure modes to avoid**:
  - Do NOT delete unchecked rows. Only checked rows move.
  - Do NOT touch `A2. Write/_Material - In Progress.md` or `A2. Write/2. In Progress/_Material_.md` - DEPRECATED. File moved to `A1. Learn/_Seeds_.md`.
  - Do NOT touch `A2. Write/2. In Progress/` paths - DEPRECATED. Content migrated to `A1. Learn/1. Wikis/`.
  - Do NOT touch `A2. Write/3. Active/` or `A2. Write/4. Completed/` - RENAMED to `A2. Write/Active/` and `A2. Write/Completed/` (numeric prefix dropped).
  - Do NOT add em dashes anywhere; use hyphens with spaces.
  - Do NOT write to Things 3.
  - Do NOT silently update wiki frontmatter without logging the priority shift to `log.md`.
- **Tools required**: Filesystem (vault reads/writes), Cowork artifact MCP (`mcp__cowork__update_artifact`).
- **Output destinations**: Multiple backlog/project files + `A1. Learn/log.md` + 10 Cowork rolling artifacts (`learn-briefing`, `write-briefing`, `make-briefing`, `share-briefing`, `apply-briefing`, `network-briefing`, `earn-briefing`, `health-briefing`, `wealth-briefing`, `admin-briefing`).

---

## TASK: learn-briefing

- **Source file**: `/Users/halim/Documents/Claude/Scheduled/learn-briefing/SKILL.md`
- **Cadence**: Weekday 6:05 AM PT. Sibling of make-briefing (6:10) and write-briefing (6:11).
- **Operating rule (locked 2026-05-13)**: Act, don't prompt. Per `feedback_act_dont_prompt.md` and root `CLAUDE.md ## Claude ACTS - never writes prompts for Halim`: when a `## To-dos for Claude` row in `_Backlog Lit_.md` / `_Backlog Tech_.md` / project files describes Claude-finishable work (create a wiki, write a raw note, run a research lookup, draft a synthesis), EXECUTE the work BEFORE rendering the briefing. The output is the new wiki / raw note / synthesis, written to its destination. The briefing then reports what was done. Only items requiring Halim's hands or judgment (read this book, attend this talk, decide between titles) appear as still-pending picks. NO "Claude prompts to launch" section. NO `## Tasks (Claude-assisted, inline prompts)` section. NO `#claude-assisted` tags on new rows. NO fenced code blocks as prompts-for-Halim.
- **Universal briefing rendering rules**:
  - Sort: P0 first then P1 then P2; deadline is secondary tiebreaker. P0 is the only thing that renders red.
  - Done items collapse in artifacts via `<details><summary>...</summary>...</details>` (per `feedback_done_collapse_in_artifacts`).
  - Verify completion before listing as pending: check `_Material_.md` and the wikis to confirm Halim hasn't already covered an item (per `feedback_verify_completion_before_listing`).
  - "Briefing" means the rolling Cowork artifact AND the markdown source - always `update_artifact` after editing the .md.
  - No em dashes, hyphens with spaces only.
  - Do not write to Things 3.
- **Source files read (in order)**:
  1. `A1. Learn/_Backlog Lit_.md` and `A1. Learn/_Backlog Tech_.md` - the `## To-dos for Claude` sections especially. Execute Claude-finishable rows.
  2. `A1. Learn/log.md` - last 7 days for Tag-movement section.
  3. `A1. Learn/index.md` - canonical wiki list with priorities.
  4. `A1. Learn/1. Wikis/*.md` frontmatter only. Pull `priority`, `tag`, `sources`, `last_ingest`.
  5. `A1. Learn/_Backlog Lit_.md ## Doing` and `## To Do`, `_Backlog Tech_.md ## Doing`.
  6. `A2. Write/Active/*.md` - what is actively being drafted.
  7. `A1. Learn/_Material_.md` - to verify completion.
- **Execution step (runs BEFORE rendering)**:
  - For each row in `## To-dos for Claude` across the Learn backlogs and active project files:
    - If the row is Claude-finishable (create a wiki, raw note, synthesis, list, taxonomy, link map): DO THE WORK. Write the file at its destination. Update `index.md` and `log.md` per the LLM Wiki PRD. Move the row to `## Done` with outcome + path.
    - If the row requires Halim's input (read this, decide between options, confirm tag): leave it in place, surface it in the briefing's Lit picks or as a question.
  - Drop `#claude-assisted` tags from rows you touch (the tag is retired).
- **Picker logic (selection criteria)**:
  - Per `feedback_learn_briefing_floor`: the briefing must ALWAYS render 3 P0 Lit picks + 3 diagonal picks, hydrating from Backlog when Doing is short.
  - Per `feedback_learn_resurface_cycle`: items covered with Halim drop to P2 with `Resurface: YYYY-MM-DD` (6 months out).
  - Lit picks: 3-5 P0/P1 items from `_Backlog Lit_.md ## Doing`, tag-matched to active wikis. Verify each against `_Material_.md` first; don't surface covered items. ALWAYS at least 3 P0 picks.
  - Tech picks: 2-3 items from `_Backlog Tech_.md ## Doing`.
  - Diagonal picks: ALWAYS at least 3.
- **Markdown render template**:

  ```markdown
  # Learn Briefing - YYYY-MM-DD

  (One-line refresh note for today.)

  ## Done this morning (Claude work executed)

  Brief list of wikis / raw notes / syntheses created this run. Each line: file path + 1-line description.

  ## Tag movement this week

  Summarize the last 7 days of log.md as terse bullets. If quiet week, write "Quiet week, no significant tag movement." Do not skip.

  ## Lit (To explore today)

  3-5 P0/P1 items from `_Backlog Lit_.md ## Doing`, tag-matched to active wikis. Verify each against `_Material_.md` first; don't surface covered items. ALWAYS at least 3 P0 picks per `feedback_learn_briefing_floor`.

  - [ ] **N. <Title>** [P0 or P1]
    - **Tags:** #tag1 #tag2 #tag3
    - **Why this connects:** <one-line linking to a P0/P1 wiki by name>
    - **Link:** <url>

  ## Diagonal picks

  ALWAYS at least 3 diagonal picks per `feedback_learn_briefing_floor`.

  ## Tech (To explore today)

  2-3 items from `_Backlog Tech_.md ## Doing`.

  ## Recently covered (collapsed)

  Use `<details><summary>...</summary>...</details>` to collapse done items. Don't render them full-size.

  ## Carried over (still in Doing, not surfaced today)

  One bullet each.

  ## Reading gap (only if applicable)

  If a P0 wiki has no candidate items, list it here.

  ---

  ## What did you learn?

  (checkbox feedback area)

  ---

  Sort rule: P0 always sits at top, then P1, then P2. P0 = only red. Deadline is secondary.
  ```

- **Artifact**: After writing markdown, `update_artifact` with id `learn-briefing` (rolling, no date suffix). Render done items collapsed via `<details>`. P0 in red, P1 neutral/amber, P2 muted. NO "Claude prompts to launch" section in the artifact.
- **Failure modes to avoid**:
  - Do NOT create dated copies (`Learn-Briefing-2026-05-02.md`). Always overwrite the rolling file.
  - Do NOT render a separate "Claude prompts to launch" or "## Tasks (Claude-assisted, inline prompts)" section.
  - Do NOT keep done items full-size green in artifact. Collapse them.
  - Do NOT surface items already covered in `_Material_.md` as still-pending.
  - Do NOT pull from `A2. Write/2. In Progress/` or `A2. Write/3. Active/` - deprecated paths.
  - Do NOT use dropped tags per `feedback_dropped_taxonomy_tags`.
  - Do NOT use `#zero-degree` per `feedback_zero_degree_to_artist_present` - use `#artist-present`.
  - Do NOT add em dashes - use hyphens with spaces.
  - Do NOT write to Things 3.
  - Do NOT add `#claude-assisted` tags to new rows.
- **Tools required**: Filesystem (vault reads/writes), Cowork artifact MCP (`list_artifacts`, `update_artifact`, `create_artifact`), web fetch for research lookups during execution step.
- **Output destinations**:
  - `/Users/halim/Documents/second-brain/A1. Learn/Learn-Briefing.md` (rolling - overwrite)
  - Cowork rolling artifact id `learn-briefing`
  - Updated wikis at `A1. Learn/1. Wikis/`, raw notes at `A1. Learn/0. raw/notes/`, log entries to `A1. Learn/log.md`, `A1. Learn/index.md`.

---

## TASK: share-briefing

- **Source file**: `/Users/halim/Documents/Claude/Scheduled/share-briefing/SKILL.md`
- **Cadence**: Weekday 6:06 AM PT.
- **Operating rule (locked 2026-05-13)**: Act, don't prompt. When a `## To-dos for Claude` row or a Share scheduling row describes Claude-finishable work (draft this IG caption, write this Substack post body, compose this carousel text, draft this DM), EXECUTE the work BEFORE rendering. The final-form draft goes INLINE under the corresponding task row in `_Backlog_.md` or the project file. NO "Claude prompts to launch" section. NO `#claude-assisted` tags. NO fenced code blocks. The briefing reports completed drafts; only items requiring Halim's hands (post to IG, post to Substack, send the DM) remain as `- [ ]` rows.
- **Universal briefing rendering rules**:
  - Sort: P0 first, then P1, then P2; deadline secondary. P0 = only red.
  - Done / shipped items collapse via `<details><summary>...</summary>...</details>` (per Halim's specific complaint about CultureHub LA + Era Systems shipped sections "taking a lot of space").
  - TBD slots get auto-suggested: when a calendar slot is empty / TBD, propose a specific candidate from `_Backlog_.md ## Backlog ### Things to share` and mark "(suggested YYYY-MM-DD)" so Halim can confirm or swap.
  - No separate `.md` files for one-off drafts. Drafts live INLINE under the task row (per `feedback_note_economy`).
  - Verify completion before listing as pending: check shipped pieces and recent IG/Substack posts.
  - Every IG caption ships with a hashtag block (3-8, separate block at bottom) per `feedback_ig_hashtags_mandatory`.
  - No em dashes; hyphens with spaces.
- **Rolling artifact contract**:
  - Artifact ID is exactly `share-briefing`. No date suffix.
  - Artifact name is exactly `Share Briefing`.
  - Always call `mcp__cowork__list_artifacts` first; if `share-briefing` exists, use `update_artifact` (not create).
  - Never create dated duplicates.
- **Source files read**:
  1. `A3. Share/CLAUDE.md` - area instructions, voice, format conventions.
  2. `A3. Share/_Strategy_.md` - strategic rules.
  3. `A3. Share/_Backlog_.md` - the source of truth. `## To Do` is the queue. `## Backlog ### Things to share` has reshare candidates. `## To-dos for Claude` has reference material asks.
  4. `A3. Share/Share-Briefing.md` - the existing rolling markdown briefing.
  5. Every `A3. Share/Pn/*.md` and `A3. Share/Px/*.md` for project-level `## Tasks` and `## To-dos for Claude` sections.
  6. `A0. Structure/Style/Instagram.md` + `Substack.md` + `Email.md` - style guides BEFORE drafting anything.
  7. Root `CLAUDE.md` for personal style rules + the act-don't-prompt rule.
- **Picker / drafter logic**:
  1. **Execution step:** For each Claude-finishable `## To-dos for Claude` row + each `## To Do` row whose action is "draft / compose / write" anything (IG caption, Substack post, carousel text, DM): READ the relevant style guide, then EXECUTE the draft. Drop the final-form copy inline under the task row in the source file. Move the row to `## Done` (or check it off in place with the draft directly visible). Drafts include the mandatory hashtag block for IG.
  2. Move 2-5 items from `_Backlog_.md ## To Do` into `## Doing` based on P0 priority and pacing rules in `_Strategy_.md`.
  3. Rewrite `A3. Share/Share-Briefing.md` from scratch with today's date in the H1, summary paragraph, then per-item sections - each "Doing" item shows the executed draft inline.
  4. **Calendar table: auto-suggest content for any TBD IG / Substack slot** drawing from reshare candidates and Substack candidate lists in `_Backlog_.md`. Mark each suggestion "(suggested YYYY-MM-DD)".
  5. **For shipped items: wrap in `<details><summary>Shipped YYYY-MM-DD: [title]</summary>...content...</details>`** so they collapse in the artifact.
  6. Honor `Structure/Style/Notes.md` formatting (no blank lines between bullets, no em dashes).
  7. Update artifact via `mcp__cowork__update_artifact` id `share-briefing`. Read current artifact HTML first to preserve visual style. Meta description: "Today's P0 share items with drafted IG caption + Substack post per item. Done items collapse. Updated YYYY-MM-DD."
- **Output**: one-line summary - items moved + count of drafts executed inline + count of TBD slots auto-suggested + count of items left as hands-required.
- **Tools required**: Filesystem, Cowork artifact MCP.
- **Output destinations**:
  - `A3. Share/Share-Briefing.md` (rolling)
  - `A3. Share/_Backlog_.md` updates (drafts inline under tasks, `## Doing` populated)
  - Cowork rolling artifact id `share-briefing`

---

## TASK: apply-briefing

- **Source file**: `/Users/halim/Documents/Claude/Scheduled/apply-briefing/SKILL.md`
- **Cadence**: Weekday 6:07 AM PT.
- **Operating rule (locked 2026-05-13)**: Act, don't prompt. When a `## To-dos for Claude` row describes Claude-finishable work (research a fellowship, draft a cover letter, score a piece against tracks, confirm a deadline), EXECUTE the work inline at the destination project file. Drop the deliverable directly into the project. Move the row to `## Done` with outcome + path. NO "Claude prompts to launch" section. NO `#claude-assisted` tags. NO fenced code blocks.
- **Universal briefing rendering rules**:
  - Sort: P0 first then P1 then P2; deadline secondary. P0 = only red.
  - Done items collapse in artifacts via `<details>`.
  - Verify completion before listing as pending: check project `## Done` and the Apply ledger.
  - No em dashes; hyphens with spaces.
- **Rolling artifact contract**:
  - Artifact ID is exactly `apply-briefing`. No date suffix.
  - Always `list_artifacts` first; `update_artifact` if it exists.
  - Never create dated duplicates.
- **Source files read**:
  1. `A4. Apply/CLAUDE.md`.
  2. `A4. Apply/_Backlog_.md` - single source of truth.
  3. `A4. Apply/Apply-Briefing.md` - existing rolling briefing.
  4. Every `A4. Apply/Pn/*.md` and `A4. Apply/Px/*.md` for `## To-dos for Claude` sections.
  5. Root `CLAUDE.md`.
- **Picker / drafter logic**:
  1. **Execution step:** For each Claude-finishable `## To-dos for Claude` row across `_Backlog_.md` and every `Pn/*.md` / `Px/*.md`: execute the work. Common patterns:
     - (a) "research fellowship X" - web-search + confirm deadline/eligibility/stipend, write a triage section into the destination project file.
     - (b) "draft cover letter" - read the relevant style guide, write the final draft inline at the destination.
     - (c) "score piece against tracks" - produce the comparison table inline.
     - Move row to `## Done` with outcome + path.
  2. Move 4-5 items from `_Backlog_.md ## To Do` into `## Doing` (cap 5). P0 first, then deadline proximity.
  3. Surface every deadline within 14 days, sorted ascending.
  4. Rewrite `A4. Apply/Apply-Briefing.md` with frontmatter (`type: rolling-briefing`, `area: A4. Apply`), today's H1, Pipeline check paragraph, `## Deadlines within 14 days`, `## Today's picks (Doing)` numbered with deadline / hook / link / materials / next action.
  5. Add a `## Done this morning (Claude work executed)` section listing wikis / drafts / research outputs produced this run.
  6. Done items in the briefing collapse via `<details>`.
  7. Update artifact via `update_artifact` id `apply-briefing`. Read current HTML first. Meta description: "Today's apply picks + deadlines within 14 days. Claude-finishable rows executed inline. Updated YYYY-MM-DD."
- **Output**: one-line summary - picks moved, next deadline, # Claude rows executed.
- **Tools required**: Filesystem, Cowork artifact MCP, web fetch (for fellowship research).
- **Output destinations**:
  - `A4. Apply/Apply-Briefing.md` (rolling)
  - `A4. Apply/_Backlog_.md` and `Pn|Px/*.md` updates
  - Cowork rolling artifact id `apply-briefing`

---

## TASK: network-briefing (aka meet-briefing)

- **Source file**: `/Users/halim/Documents/Claude/Scheduled/network-briefing/SKILL.md`
- **Cadence**: Weekday 6:08 AM PT.
- **Operating rule (locked 2026-05-13)**: Act, don't prompt. When a `## To-dos for Claude` row or a Cold-funnel row describes a Claude-finishable draft (outreach email, DM, intro text), READ the style guide, EXECUTE the draft, and drop the final-form copy inline at the destination (per-person network note when applicable per `feedback_per_person_network_notes`, or inline under the task row in `_Backlog_.md`). For Gmail-destined drafts, ALSO create the Gmail draft via the Gmail MCP. NO "Claude prompts to launch" section. NO `#claude-assisted` tags. NO fenced code blocks.
- **Universal briefing rendering rules**:
  - Sort: P0 first then P1 then P2; deadline secondary. P0 = only red.
  - Done / sent items collapse via `<details><summary>...</summary>...</details>`.
  - Verify completion before listing as pending: check per-person notes in `A5. Network/`.
  - Per-person network follow-ups live as their own notes; drafts for one-off messages live inline (per `feedback_note_economy`).
  - No em dashes.
- **Gmail draft floor of 5 (added 2026-05-04)**:
  - Universal contract: at the end of every run, Halim's Gmail drafts folder must contain AT LEAST 5 networking-related drafts ready to send. When count is below 5, top it back up.
  - **How to count "networking-related"**:
    - List all Gmail drafts via the Gmail MCP `list_drafts`.
    - A draft counts as networking-related if the recipient is in `A5. Network/_Backlog_.md` (any tier) OR matches the outreach archetype (`info@`, `editor@`, `editorial@`, `contact@`, `hello@`, `submissions@`, `queries@`, `production@`, `team@`, `press@` on a publication / podcast / gallery / institution domain) OR appears in today's `## Today's picks`.
    - Drafts to `madihalim@gmail.com` and clearly non-network drafts DO NOT COUNT.
  - **If count < 5**: top up by drafting and saving additional Gmail drafts via `create_draft`. Priority order:
    1. P0 items in `## Doing` without a Gmail draft
    2. P0 items in `## To Do ### Cold funnel` flagged "Gmail draft NOT created"
    3. Maintenance-due Tier 1 contacts with no current draft
    4. P1 items in Cold funnel
  - For every newly-created draft, follow `A0. Structure/Style/Email.md` voice rules: no em dashes, catalyst-driven embodied opener for cold editorial pitches, mechanical practice description, two parenthetical pitch options for editorial pitches OR one named ask for galleries, awards-with-links adjacency credentials, "Thanks for what you make" / "Thanks for all that you do" sign-off, Halim signature footer for outreach. If recipient address is unverified, use best-guess and surface a footer note flagging which addresses Halim should verify.
  - **Surface in briefing footer**: "Gmail draft floor: N of 5 networking drafts in Gmail. [Topped up by adding K drafts: list of recipient + subject. | Already at floor.]"
- **Rolling artifact contract**:
  - Artifact ID is exactly `network-briefing`. No date suffix.
  - Always `list_artifacts` first; `update_artifact` if exists.
  - Never create dated duplicates.
- **Daily slate**: 2 podcasts / 2 publications / 1 gallery / 1 peer (6 total) per `feedback_briefing_means_artifact` + 2026-05-01 codification.
- **Source files read**:
  1. `A5. Network/CLAUDE.md`.
  2. `A5. Network/_Backlog_.md`.
  3. `A5. Network/Network-Briefing.md` - existing rolling briefing.
  4. Gmail inbox (last 7 days) - new contacts; dedupe.
  5. Gmail drafts - count current networking drafts for the floor check.
  6. Every `A5. Network/Pn/*.md`, `Px/*.md`, and any per-person `*.md` notes.
  7. `A0. Structure/Style/Email.md` - voice rules.
  8. Root `CLAUDE.md`.
- **Picker / drafter logic**:
  1. **Execution step:** For each Claude-finishable row in `## To-dos for Claude` AND each Cold-funnel pick that lacks a draft, EXECUTE the draft. For per-person follow-ups, write to / update the per-person note. For one-off picks in today's slate, drop the final-form draft inline under the briefing's `## Today's picks` row.
  2. Move 4-5 items from `_Backlog_.md ## To Do` to `## Doing`. P0 first. Honor the 2/2/1/1 slate.
  3. For each pick, the briefing shows the executed draft (Subject + body) inline - not a prompt to write one. Personal hook, recent reference (~last 30 days), clear ask. Recipient channel (verified email or fallback) at top.
  4. Scan Gmail last 7d for inbound from people NOT in `_Backlog_.md`. Append to `_Backlog_.md ### To Process`. Surface as `## New from inbox`.
  5. **Gmail draft floor check**: list current drafts, count networking-related ones. If < 5, top up via `create_draft`. Re-list at end to confirm count >= 5.
  6. Rewrite `A5. Network/Network-Briefing.md` with frontmatter, today's H1, Goal-check paragraph (X of 20 EO-May contacts confirmed Sent), `## Today's picks` (numbered, with hook / recent ref / why-pick / recipient / **drafted email or text inline**), `## New from inbox`, `## Maintenance due` (Mondays only), `## Footer` with Gmail draft floor line.
  7. Recently-sent picks render under `## Recently sent (collapsed)` via `<details>`.
  8. Update rolling artifact via `update_artifact` id `network-briefing`. Read current HTML to preserve style. Meta description: "Today's network picks (2/2/1/1 slate) with drafts inline + new inbox contacts + done collapsed + Gmail draft floor at N/5. Updated YYYY-MM-DD."
- **Output**: one-line summary - picks moved, # new inbox candidates, # drafts executed inline, Gmail draft floor count + top-up count if any.
- **Tools required**: Filesystem, Cowork artifact MCP, Gmail MCP (`list_drafts`, `create_draft`, list/read inbox last 7d).
- **Output destinations**:
  - `A5. Network/Network-Briefing.md` (rolling)
  - `A5. Network/_Backlog_.md` updates and per-person notes
  - Gmail drafts (top-up to floor of 5)
  - Cowork rolling artifact id `network-briefing`

---

## TASK: admin-briefing

- **Source file**: `/Users/halim/Documents/Claude/Scheduled/admin-briefing/SKILL.md`
- **Cadence**: Daily 6:09 AM PT.
- **Operating rule (locked 2026-05-13)**: Act, don't prompt. When a `## To-dos for Claude` row across the Admin backlog or project files describes Claude-finishable work (research a vendor / clinic / product, draft a letter, compute a ledger total, look up a return policy, pick the EDJY nail clipper model), EXECUTE the work inline at the destination project file. NO "Claude prompts to launch" section. NO `#claude-assisted` tags. NO fenced code blocks.
- **Universal briefing rendering rules**:
  - Sort: P0 first then P1 then P2; deadline secondary. P0 = only red.
  - Done items collapse via `<details><summary>Done since last briefing</summary>...</details>`.
  - Verify completion before listing as pending: check source project files' `## Done` sections.
  - No separate `.md` files for one-off drafts.
  - No em dashes.
  - Surface airline credits (Southwest ~$118, AA $0 as of 2026-05-07, JetBlue ~$150) before any flight-booking admin task (per `feedback_flight_credits_reminder`).
- **Source files read (read first)**:
  - `X4. Admin/_Backlog_.md` (the catch-all - source of `## To Do`, deadlines, and Resources)
  - Every `X4. Admin/Pn *.md` and `X4. Admin/Px *.md` file (active projects)
  - `X4. Admin/CLAUDE.md` if it exists
  - Root `Claude.md` and `MEMORY.md` for global conventions and the act-don't-prompt rule
  - Also scan `00. To Do/Capture.md ## Pending` for items routed to admin that haven't been folded yet - flag in "Captured this week".
- **Execution step (runs BEFORE rendering)**: For each Claude-finishable `## To-dos for Claude` row across the Admin backlog and project files: EXECUTE. Common patterns: vendor research, ledger math, return-policy lookup, product-pick research, drafting letters. Drop the deliverable inline at the destination. Move row to `## Done`.
- **Compute**:
  - Today's date and day-of-week (Pacific time).
  - For each `## To Do` item with a deadline, days-until-deadline.
  - Bucket: `<14 days` (URGENT), `15-60 days` (heads-up), no hard deadline (rolling actionable).
  - Cross-check `## Carried over (legacy backlog rows - reroute when reviewing)` - surface unresolved items.
- **Markdown render template**:

  ```markdown
  ---
  id: 5fb1d2c8-1d40-4b3f-9a4d-7c2c7a1ab042
  type: rolling-briefing
  area: X4. Admin
  anchors_on: 1bf94642-da5b-4138-852d-7d844887889e
  ---

  # Admin Briefing - YYYY-MM-DD

  **Catch-all check:** {N} active items. {M} days to next critical deadlines. {Highest-leverage non-deadline item}.

  ## Done this morning (Claude work executed)

  Brief list of research / picks / drafts / ledger updates produced this run, with destination paths.

  ## Deadlines within 14 days

  - bullets: **Title** [Pn] - **YYYY-MM-DD** (Nd) - one-line context

  ## Today's picks

  3-5 items. Each pick: deadline, hook, action items, next action.

  ## Within 30-60 days (heads-up)

  ## Rolling actionable

  ## Carried over (legacy backlog rows - reroute)

  ## Recently completed (collapsed)

  <details><summary>Done since last briefing</summary>
  - ~~Title~~ - one-line outcome
  </details>

  ## Footer

  - Mark items in `_Backlog_.md ## To Do` checked once done; nightly /sync at 9pm propagates them to `## Done`.
  - New admin items land in `00. To Do/Capture.md ## Pending` and get routed by inbox-hourly-process.
  - Heavy reference material lives in `_Backlog_.md ## Resources`.
  - Per 2026-05-13 vault rule: Claude acts on `## To-dos for Claude` rows directly. The work above is what was executed this run.
  - Notes from today's run: {1-3 lines}.
  ```

  Style: no em dashes. Anchor on the backlog frontmatter id (`1bf94642-da5b-4138-852d-7d844887889e`).

- **Artifact**:
  - `mcp__cowork__list_artifacts` to confirm `admin-briefing` exists.
  - `mcp__cowork__update_artifact` with id `admin-briefing` and fresh HTML.
  - If missing: `create_artifact` with id `admin-briefing` (no dated id).
  - Mirror visual style. Sections: lede, Done this morning, Deadlines within 14 days, Today's picks (cards with priority + deadline + green next-action callout), Within 30-60 days, Rolling actionable, Carried over, **Recently completed (`<details>` collapsed)**, Footer.
  - Priority chip colors: P0 red, P1 amber, P2 blue. URGENT (<3 days) deadline rows get a soft red background. NO "Claude prompts to launch" section anywhere.
- **Done criteria**:
  - `X4. Admin/Admin-Briefing.md` rewritten with today's date in the H1.
  - `admin-briefing` Cowork artifact updated in place.
  - Notify session on completion.
- **Tools required**: Filesystem, Cowork artifact MCP, web fetch (for vendor/product research).
- **Output destinations**:
  - `/Users/halim/Documents/second-brain/X4. Admin/Admin-Briefing.md` (rolling)
  - Cowork rolling artifact id `admin-briefing`

---

## TASK: make-briefing

- **Source file**: `/Users/halim/Documents/Claude/Scheduled/make-briefing/SKILL.md`
- **Cadence**: Weekday 6:10 AM PT.
- **Note**: "This is the most load-bearing briefing of the day for Halim's art practice."
- **Operating rule (locked 2026-05-13)**: Act, don't prompt. When a `## To-dos for Claude` row across the Make projects describes Claude-finishable work (write the rider, draft the pitch deck outline, produce the technical spec, do the research lookup, scaffold a new project file, draft a Substack post that ships a piece), EXECUTE the work inline at the destination project before rendering the briefing. The briefing reports completed work; only items requiring Halim's hands (record audio, paint, build the physical setup, give the talk) remain as `- [ ]` rows. NO "Claude prompts to launch" section. NO `#claude-assisted` tags. NO fenced code blocks.
- **Universal briefing rendering rules**:
  - Sort: P0 first then P1 then P2; deadline secondary. P0 = only red.
  - Done items collapse via `<details><summary>Recently completed</summary>...</details>`.
  - Verify completion before listing as pending: check project `## Done` sections.
  - No separate `.md` files for one-off drafts.
  - No em dashes.
- **Source files read (read first)**:
  1. Root `Claude.md` (no em dashes, conventions, act-don't-prompt rule).
  2. `A2. Make/_Backlog_.md` (Active projects index, Standing rules, Tasks, To-dos for Claude).
  3. Every active project file in `A2. Make/` listed in Active projects:
     - `P0 Singulars.md` (umbrella - sub-pieces include Multi-poet)
     - `P0 Website v2 EO May.md`
     - `PN Brand v2 EO May.md`
     - `P1 Lead Magnet Reading Room EO June.md`
     - `P1 Hope Pharmakon.md`
     - `PN Paper with Thomas.md` (now P0 focus per Halim 2026-05-03 - xenolinguistics)
     - `P2 Word Garden.md`
     - `P2 Future v Website.md`
     - `PN Sandbox Poem.md` (deadline 2026-05-22)
     - `PN College Workshops.md`
     - Plus any new `Pn`/`PN` files (re-scan directory; ignore `PX` = someday).
  4. `00. To Do/Capture.md ## Pending` and `## Routed` for new Make-flavored items.
- **Project memory anchors**: "I've always wanted to become everyone" shipped LA ~2026-04-18 + standalone. Becoming Border is standalone. Only Multi-poet is a Singulars sub-piece. Twitterfication / Vibe Thinking shipped. Paper with Thomas is the new major focus (xenolinguistics, Ingold spine). Sandbox Poem deadline = 2026-05-22.
- **Execution step (runs BEFORE rendering)**: For each Claude-finishable `## To-dos for Claude` row across the Make projects and `_Backlog_.md`: EXECUTE. Write the rider, the spec, the outline, the synthesis - whatever the row asks for. Drop the deliverable inline at the destination project. Move the row to `## Done` with outcome + path. Drop `#claude-assisted` tags from rows you touch.
- **Markdown render template** (`/Users/halim/Documents/second-brain/A2. Make/Make-Briefing.md` - overwrite, no date suffix in filename):

  ```
  # Make Briefing - {weekday + date}

  _Generated YYYY-MM-DD. Anchor: {nearest P0 deliverable} - **N days**. Make-1-piece-per-week status: {sent this week / in flight}._

  ## Done this morning (Claude work executed)

  Brief list of riders / specs / outlines / syntheses produced this run. Each line: project + 1-line description + file path.

  ## 1. Top of mind today
  - Bullets, 4-6 items. The most actionable shipping moves + nearest deadlines.

  ## 2. Singulars
  - Active sub-piece (Multi-poet)
  - Fine-tuning roadmap progress
  - Singulars website state
  - Hands-required tasks for Halim (record audio, finalize set design, etc.)

  ## 3. Other active pieces
  - One paragraph + next concrete action per project
  - Mark recently shipped items in ## Recently completed (collapsed) below

  ## Recently completed (collapsed)
  <details><summary>Done since last briefing</summary>
  - ~~Title~~ - one-line outcome
  </details>

  ## Footer
  - Per 2026-05-13 vault rule: Claude acts on `## To-dos for Claude` rows directly, never writes prompts for Halim. The work above is what was executed this run.
  ```

  Style: no em dashes (use `-` with spaces). Anchor IDs preserved.

- **Artifact**: `make-briefing` artifact - update via `mcp__cowork__update_artifact`. Read existing HTML first to preserve visual style. Sections mirror markdown. P0 red, P1 amber, P2 blue. Done items in collapsed `<details>`. NO "Claude prompts to launch" section anywhere.
- **Done criteria**: Make-Briefing.md rewritten + make-briefing artifact updated in place.
- **Tools required**: Filesystem, Cowork artifact MCP, web fetch (research lookups).
- **Output destinations**:
  - `A2. Make/Make-Briefing.md` (rolling)
  - Make project files (`Pn|PN *.md`) updates
  - Cowork rolling artifact id `make-briefing`

---

## TASK: earn-briefing

- **Source file**: `/Users/halim/Documents/Claude/Scheduled/earn-briefing/SKILL.md`
- **Cadence**: Daily 6:10 AM PT.
- **Operating rule (locked 2026-05-13)**: Act, don't prompt. When a `## To-dos for Claude` row across the Earn projects (Clarinet, Invisible, Teaching '27, Wikitongues, Clarinet Hiring) describes Claude-finishable work (draft a speech outline, write a hiring outreach email, score teaching applications, build a YouTube influencer shortlist, draft a Slack message to the team), EXECUTE the work inline at the destination project file. NO "Claude prompts to launch" section. NO `#claude-assisted` tags. NO fenced code blocks.
- **Source files read**:
  - `X0. Earn/CLAUDE.md` (folder context)
  - Every `X0. Earn/Pn *.md`, `Px *.md`, `PN *.md` file - currently `P0 Clarinet.md`, `P1 Invisible.md`, `P2 Teaching '27.md` (filename rename pending - frontmatter says P2), `PN Wikitongues.md`, `PN Clarinet Hiring.md`. Glob the folder.
  - Root `Claude.md` and `MEMORY.md` for the act-don't-prompt rule.
  - `00. To Do/Capture.md ## Pending` for routed earn items.
- **Execution step (runs BEFORE rendering)**: For each Claude-finishable `## To-dos for Claude` row across the Earn projects: EXECUTE. Write the speech outline, draft the recruiter email, score the candidates, build the shortlist. Drop the deliverable inline at the destination project file. Move row to `## Done` with outcome + path.
- **Compute**:
  - Today's date and day-of-week (Pacific time).
  - Days-until-deadline for each `## Tasks` item with `| Deadline: YYYY-MM-DD`.
  - Bucket: `<14 days` (URGENT), `15-60 days` (heads-up), no hard deadline (rolling actionable).
  - Tag every surfaced item with its source project.
- **Markdown render template**:

  ```markdown
  ---
  id: 9a1c8f7e-3d72-4b1e-bf5d-e8c2a4f96b18
  type: rolling-briefing
  area: X0. Earn
  anchors_on: x0-earn-context
  ---

  # Earn Briefing - YYYY-MM-DD

  **Income check:** {N} active projects. {M} days to next critical deadlines. {Highest-leverage move}.

  ## Done this morning (Claude work executed)

  Brief list of speech outlines / drafts / shortlists / scores produced this run.

  ## Deadlines within 14 days

  - **[Project] Title** [Pn] - **YYYY-MM-DD** (Nd) - one-line context.

  ## Today's picks

  3-5 items. Each pick: deadline, hook, action items, next action.

  ## Within 30-60 days (heads-up)

  ## Rolling actionable

  ## Recently completed (collapsed)

  <details><summary>Done since last briefing</summary>
  - ~~Title~~ - one-line outcome
  </details>

  ## Footer

  - Mark items in each project file's `## Tasks` checked once done; nightly /sync at 9pm propagates them to `## Done`.
  - New earn items land in `00. To Do/Capture.md ## Pending`.
  - Per 2026-05-13 vault rule: Claude acts on `## To-dos for Claude` rows directly. Drafts live next to the task they fulfill.
  - Notes from today's run: {1-3 lines}.
  ```

  Style: no em dashes. Anchor on `x0-earn-context`.

- **Artifact**:
  - `mcp__cowork__list_artifacts` to confirm `earn-briefing` exists.
  - `update_artifact` with id `earn-briefing`. Never use dated id.
  - Cards with priority chip + project chip + deadline + green next-action callout. Light mode. P0 red, P1 amber, P2 blue. URGENT (<3 days) gets soft red background. NO "Claude prompts to launch" section anywhere.
- **Done criteria**:
  - `X0. Earn/Earn-Briefing.md` rewritten with today's date.
  - `earn-briefing` artifact updated in place.
- **Tools required**: Filesystem, Cowork artifact MCP, web fetch.
- **Output destinations**:
  - `/Users/halim/Documents/second-brain/X0. Earn/Earn-Briefing.md` (rolling)
  - Cowork rolling artifact id `earn-briefing`

---

## TASK: write-briefing

- **Source file**: `/Users/halim/Documents/Claude/Scheduled/write-briefing/SKILL.md`
- **Cadence**: Weekday 6:11 AM PT.
- **Operating rule (locked 2026-05-13)**: Act, don't prompt. When a Write-related `## To-dos for Claude` row describes Claude-finishable work (consolidate wikis, fold a raw note into a wiki, write a synthesis paragraph, draft an essay opening from a ripe wiki, produce a wiki frontmatter lint pass), EXECUTE the work inline at the destination wiki / draft file BEFORE rendering the briefing. The briefing reports completed work; only items requiring Halim's hands (write the essay body, decide between angles, ship to Substack) remain as `- [ ]` rows. NO "Claude prompts to launch" section. NO `## Tasks (Claude-assisted, inline prompts)` section. NO `#claude-assisted` tags. NO fenced code blocks.
- **Universal briefing rendering rules**:
  - Sort: P0 first then P1 then P2; deadline secondary. P0 = only red.
  - Done items collapse via `<details><summary>Recently completed</summary>...</details>`.
  - Verify completion: check `A2. Write/Completed/` and `A1. Learn/_Material_.md`.
  - Essay drafts in progress DO get their own files in `Active/` - that's a project-level artifact, not a one-off draft. The "no separate notes" rule applies to one-off task drafts (texts/emails/captions), not to essay drafts.
  - No em dashes.
  - Per Halim 2026-05-03: Twitchification illustration HTMLs were deleted (Vibe Thinking shipped). Paper with Thomas (xenolinguistics, Ingold spine) is the new major focus.
- **Context**: Write-Briefing is the wiki maturation surface for the LLM Wiki at `A1. Learn/`. Its job: "from your wiki maturation, here's what's ripe to draft this week." Halim drafts essays in `A2. Write/Active/` and ships them to `A2. Write/Completed/`. The wiki at `A1. Learn/1. Wikis/` is the synthesis layer.
- **Source files read**:
  1. `A1. Learn/index.md` - taxonomy, P0/P1/P2 wiki lists.
  2. `A1. Learn/log.md` - last 7 days. `grep '^## \[' log.md | tail -30`.
  3. `A1. Learn/1. Wikis/*.md` frontmatter - `priority`, `sources`, `last_ingest`, `related`.
  4. `A2. Write/_Backlog_.md ## To Do` and `## Done`.
  5. `A2. Write/Active/*.md` - filename + last-modified.
  6. `A2. Write/Completed/*.md` - for "Recently completed" section.
- **Execution step (runs BEFORE rendering)**: For each Claude-finishable `## To-dos for Claude` row in `A2. Write/_Backlog_.md` and any Write project file: EXECUTE. Write the synthesis, fold the raw note, draft the opening. Drop the deliverable at the destination. Move row to `## Done`. Drop `#claude-assisted` tags from rows you touch.
- **Markdown render template** (write to `A2. Write/Write-Briefing.md`, overwrite, not dated):

  ```markdown
  # Write Briefing - YYYY-MM-DD

  (Status note: "X new wikis this week, Y promoted to P1, Z drafts active.")

  ## Done this morning (Claude work executed)

  Brief list of consolidations / fold-ins / synthesis paragraphs / opening drafts produced this run.

  ## Wikis at P0 (write from these this week)

  - [ ] [[wiki-name]] [P0] - N sources, last updated YYYY-MM-DD. Argument: <one-line>. Active draft: [[link]] or "no active draft yet". Suggested move: <concrete next step>.

  ## Wikis at P1 (coalescing - 1-2 weeks out)

  ## Wikis at P2 (building, not yet ripe)

  ## Recently consolidated / split / promoted

  - Last 7 days from log.md.

  ## Active drafts (A2. Write/Active/)

  - [[link]] - last touched YYYY-MM-DD. Wikis backing it: [[wiki1]], [[wiki2]].

  ## Recently completed (A2. Write/Completed/)

  <details><summary>Last 4 weeks</summary>
  - [[link]] (YYYY-MM-DD) - wikis touched: [[wiki1]].
  </details>

  ## Backlog ## To Do (from A2. Write/_Backlog_.md)

  ## Wikis with bad frontmatter (queued for next lint pass)

  ---

  Sort rule: P0 always sits at top, then P1, then P2. P0 = only red. Deadline secondary.
  ```

- **Artifact**: `update_artifact` (or create on first run, no dated id) for id `write-briefing`. Done items in collapsed `<details>`. NO "Claude prompts to launch" or "## Tasks (Claude-assisted, inline prompts)" section anywhere.
- **Failure modes**:
  - Do NOT pull from `A2. Write/2. In Progress/` or `A2. Write/3. Active/` - deprecated paths.
  - Do NOT use dropped tags per `feedback_dropped_taxonomy_tags`.
  - Do NOT use `#zero-degree` - use `#artist-present`.
  - Do NOT add em dashes.
  - Do NOT render a "Claude prompts to launch" section.
  - Do NOT add `#claude-assisted` tags to new rows.
- **Tools required**: Filesystem, Cowork artifact MCP.
- **Output destinations**:
  - `A2. Write/Write-Briefing.md` (rolling)
  - Wiki frontmatter updates at `A1. Learn/1. Wikis/`
  - Cowork rolling artifact id `write-briefing`

---

## TASK: invisible-briefing

- **Source file**: `/Users/halim/Documents/Claude/Scheduled/invisible-briefing/SKILL.md`
- **Cadence**: Daily 6:16 AM. Engagement runs to 2026-07-20. Evals workstream is the visible artifact for both customer expansion and Halim's continued credibility.
- **Pattern**: Mirror rolling-briefing pattern - one rolling markdown file in the project folder, one rolling Cowork artifact (id `invisible-briefing`, no date suffix). Rolling = OVERWRITE.
- **Three files this task touches**:
  - `/Users/halim/Documents/second-brain/X0. Earn/Invisible/CLAUDE.md` (read-only by default) - rules/style/voice/vocabulary lock/Claude-assisted task pattern/privacy/briefing-render rules/3-bucket industry-news scope/what-done-looks-like rubric. Modify ONLY under the Style Refinement Protocol.
  - `/Users/halim/Documents/second-brain/X0. Earn/Invisible/memory.md` (read AND write) - structured working memory. Sections preserved (recreate if missing):
    - `## Engagement context (one-screen)` - contract terms, primary contact, cadence. Update only when contract terms change.
    - `## People` - sub-sectioned by workstream (Synapse/Apollo/eController, Concierge/Axon/Prompt Engineers, AI Champions, AIT regulars). Each: role, workstream, latest open thread, optional `nuance` line.
    - `## Projects (workstreams)` - three workstreams: Evals, AI Champions, AIT PM operations. Each: state, gating deliverable, gating risk.
    - `## Tasks (live, P0/P1/P2 with deadlines)` - canonical task list mirroring `P1 Invisible.md ## Tasks`. Sort by priority then deadline.
    - `## Nuances` - relationship dynamics and load-bearing context not fitting cleanly into People.
    - `## Recently surfaced (last 7 days, awaiting routing)` - buffer YOU write to when Granola surfaces a new person or ask.
    - `## Done (collapsed)` - last 30 days of completed items.
  - `/Users/halim/Documents/second-brain/X0. Earn/P1 Invisible.md` (read-only) - canonical project node. Read `## Tasks` to cross-check what's open. Daily task does NOT modify; nightly `daily-sync` (9pm) propagates checked boxes back. Source-of-truth authority belongs to `P1 Invisible.md` for tasks; `memory.md ## Tasks` is a structured mirror.
- **Memory write protocol** (when writing to memory.md):
  1. Read entire current file.
  2. Pull yesterday's Granola data.
  3. For each new person mentioned: add to right People sub-section with role, last-touch date, open thread.
  4. For each new ask or commitment: add to `## Recently surfaced` as single-line bullet with `[YYYY-MM-DD]` date prefix and source meeting title in parens.
  5. For each task that's been completed (Halim checked off in `P1 Invisible.md` or in yesterday's artifact): move from `## Tasks` to `## Done (collapsed)` with one-line outcome.
  6. For each existing P2 row: check whether deadline is now <14 days away or related P1 was completed; if so, graduate to P1 and move.
  7. For every #claude-assisted task that doesn't already carry an inline draft + Next step: draft both NOW (per pattern in `Invisible/CLAUDE.md ## Claude-assisted task pattern`) and write in-place under task row in memory.md. Drafts must match Halim's voice (concrete, decisive, no hedging, no em-dashes), carry exactly one CTA, end with `**Next step:**` line that names a concrete action and deadline.
  8. Preserve Halim's exact wording when quoting. Don't paraphrase asks. Don't lose his words.
  9. Bump frontmatter `last_updated:` to today.
  10. Write file back atomically.
- **Read first (every run)**:
  1. `/Users/halim/Documents/second-brain/CLAUDE.md` (root - vault-wide rules).
  2. `/Users/halim/Documents/second-brain/X0. Earn/CLAUDE.md` (area-level - which projects exist, what done looks like for Q2).
  3. `/Users/halim/Documents/second-brain/X0. Earn/Invisible/CLAUDE.md` (project rules + style + industry-news scope).
  4. `/Users/halim/Documents/second-brain/X0. Earn/Invisible/memory.md` (structured working memory).
  5. `/Users/halim/Documents/second-brain/X0. Earn/P1 Invisible.md` (project node: contract context, ## Tasks).
  6. `/Users/halim/Documents/second-brain/00. To Do/Capture.md ## Pending` and `## Routed` for Invisible-flavored items.
- **Granola pull (last 24 hours)**:
  - Granola MCP tools (names end in `list_meetings`, `query_granola_meetings`, `get_meeting_transcript`, `list_meeting_folders`).
  - Call `list_meetings` with `time_range: "custom"`, `custom_start: yesterday-midnight-PT`, `custom_end: today-midnight-PT`, looped over `folder_id` for:
    - `225fb26c-edcf-4b5f-876f-57f7646463c3` (Invisible)
    - `c7af700b-2a45-4fbf-98ad-3d2904f831e0` (AI Champions)
    - `0f0abc52-7547-41c8-87d0-4175592fa304` (Evals)
  - For each meeting returned, decide whether it carries new people / asks / decisions worth surfacing. If yes, fetch full content via `query_granola_meetings` with `document_ids: [<that meeting>]` and query: "Who attended, what asks were made, what decisions, what's owed by whom by when."
  - Extract: new people not in `memory.md ## People`; new commitments to or from Halim; status changes on existing open threads; new context on existing workstreams.
  - Update `memory.md` per the rules above. If any new commitment translates to a #claude-assisted task, generate the draft + Next step inline immediately.
  - If yesterday had zero Invisible-folder meetings, skip Granola pull and note "No new meeting context yesterday" in briefing footer.
- **Industry news scan (3 buckets, compact)**: Each bucket up to 3 items; total cap 8 items. Format each item as one-line bullet: `"[Source] - Headline (why-it-matters tag)"` - no multi-paragraph commentary. If bucket has nothing notable, render "No notable items." Do NOT pad.
  - **Bucket 1: AI in general**. Frontier model launches, regulatory developments, headline funding rounds, major customer wins/losses at platform layer. Sources: Anthropic, OpenAI, Google DeepMind, Meta AI, Mistral, xAI announcements; Reuters / Bloomberg / The Information / WSJ on AI; HN front-page tagged AI. Query: "AI [last 24 hours] funding OR launch OR regulation OR partnership"
  - **Bucket 2: Evals platforms**. Direct Synapse competitors. Canonical list: Braintrust, Arize (Phoenix + AX), LangSmith, Galileo, W&B Weave, Comet Opik, DeepEval / Confident AI, Latitude, Truesight, Maxim, Goodeye Labs. Query: "[name] funding OR product launch OR pricing OR customer announcement [last 24 hours]". Filter: funding rounds, new customers, product/pricing launches, leadership moves. Skip: blog posts, opinion, listicles, conference recaps.
  - **Bucket 3: Data labor + AIT business**. Invisible's GTM peers and broader data-labor / agent-services market. Canonical list: Scale AI, Mercor, Micro1, Surge AI, Snorkel, Turing, Toloka, Labelbox, Appen, iMerit. Also AIT-relevant stories (assessments / hiring / labor marketplaces). Query: "[name] funding OR launch OR customer OR contract [last 24 hours]". Same filter as Bucket 2.
  - "Why it matters" tag chosen from: `{direct competitor / pricing signal / customer validation / acquihire / leadership / regulatory / product feature / market sizing}`.
- **Compute (priorities and calendar)**:
  - Today's date and day-of-week (Pacific time).
  - For each `## Tasks` row in `memory.md`, compute days-until-deadline.
  - Bucket: URGENT (<3 days), this week (<7 days), heads-up (<14 days), rolling (no deadline or >14 days).
  - Identify Top 3 priorities for TODAY: typically most-urgent P0s plus highest-leverage non-deadline move (often relationship-anchor: Emily check-in, Apollo demo prep, AI Champions session prep).
  - Identify which `## Tasks` rows are #claude-assisted. For EVERY one, ensure inline draft + Next step is present in memory.md. If missing, draft and write back inline.
  - Build calendar for rest of week (today + remaining weekdays). For each day, pull Halim's Calendar via calendar `list_events` MCP. Assign relevant Invisible Tasks rows to time-blocks around existing meetings: default 9-11am deep work (Apollo demo prep, agentic eval demo review), 2-4pm synthesis (Olivia sprint table update, stakeholder-assignment spreadsheet), evenings writing (weekly Friday note to Ben). "Calendar this week" table must show, for each day, existing meetings AND top assigned Tasks row.
- **Markdown render template** (write to `/Users/halim/Documents/second-brain/X0. Earn/Invisible/Invisible-Briefing.md`):

  ```markdown
  ---
  id: <stable uuid - generate once, reuse forever>
  type: rolling-briefing
  project: P1 Invisible
  area: X0. Earn
  anchors_on: invisible-context
  ---

  # Invisible Briefing - YYYY-MM-DD ({weekday})

  **Engagement check:** {N} days to contract end (2026-07-20). Hours this week: {tally}.

  ## Priorities for the week

  {3-5 bullets. The week's anchors. Each bullet has the priority chip, the workstream (Evals / AI Champions / AIT), a one-line goal, and a status note.}

  ## Top 3 today

  1. **{Title}** [Pn] - {one-line goal}. Next action: {concrete}.
  2. ...
  3. ...

  ## Doing (Claude-assisted)

  {Render every #claude-assisted task as a card. Each card shows: title, priority chip, workstream chip, deadline, the full pre-written DRAFT (Slack message / email / prompt) in a quoted block, and a "**Next step:**" one-liner with a deadline-bearing action. Sort P0 first. NEVER hide the draft body in the markdown briefing - render it inline so Halim can copy from the file directly. The artifact wraps each draft in a `<details>` tag with a Copy button.}

  ## Calendar this week

  | Day | Date       | Meetings   | Top assigned task block |
  | --- | ---------- | ---------- | ----------------------- |
  | Mon | YYYY-MM-DD | {meetings} | {task}                  |
  | ... | ...        | ...        | ...                     |

  ## P2 backlog (graduates to P1 by deadline or P1-completion)

  {Bullets from memory.md ## Tasks ### P2.}

  ## Industry news ({YYYY-MM-DD})

  ### AI in general

  {up to 3 one-liners, or "No notable items."}

  ### Evals platforms

  {up to 3 one-liners, or "No notable items."}

  ### Data labor + AIT business

  {up to 3 one-liners, or "No notable items."}

  ## Captured yesterday

  {Anything new from Granola that landed in memory.md ## Recently surfaced. Bullets with [date] prefix. If empty: "Nothing new captured."}

  ## Footer

  - Sort rule: P0 first, then P1, then P2. Deadline secondary. P0 is the only red color.
  - Memory file: `X0. Earn/Invisible/memory.md` was enriched today with {N} new entries.
  - Source-of-truth: `X0. Earn/P1 Invisible.md ## Tasks` for tasks; this briefing mirrors.
  ```

  Style: no em-dashes (vault-wide). Single-line task rows for non-Claude-assisted tasks; multi-line block (title + draft + Next step) for #claude-assisted tasks. Convert relative dates to absolute. Preserve Halim's exact wording on quoted asks.

- **Artifact update (render HTML, update `invisible-briefing` id, never date-suffixed)**: Workflow: `list_artifacts` -> `update_artifact` (or `create_artifact` on first run, never dated id). Visual layout top-to-bottom:
  1. **Top compact strip** - one row with: days to contract end, hours-this-week tally. (No equity chip. No top-open-thread chip. No contract-rate. Intentionally minimal because artifact is shareable inside Invisible.)
  2. **Priorities for the week** - 3-5 cards horizontal scroll or grid. Each card: P chip + workstream chip + one-line goal + status.
  3. **Top 3 today** - large numbered cards. Bold title, P chip, deadline, next action highlighted in green callout.
  4. **Doing (Claude-assisted)** - each #claude-assisted task as card showing: title, priority chip, workstream chip, deadline, green "Next step:" callout, expandable `<details>` containing full draft Slack/email/prompt body. Inside details, two buttons: "Copy draft" (writes draft body to clipboard) and "Mark sent" (checks task off). Next step line ALWAYS visible. Sort P0 first.
  5. **Calendar this week** - 5-column grid (Mon-Fri), each column shows existing meetings + top assigned task block + meeting count.
  6. **P2 backlog** - collapsible section with line "These graduate to P1 by deadline or P1 completion" at top.
  7. **Industry news** - three-column compact grid: AI in general | Evals platforms | Data labor + AIT business. Each column up to 3 one-liners with source domain favicon, headline (links to source), why-it-matters tag chip. Compact: one row per item, no multi-line summaries.
  8. **Captured yesterday** - small section below industry news.
  9. **Footer** - sort rule + color rule restated.
  - Priority chip colors per `Invisible/CLAUDE.md`: P0 red, P1 amber, P2 blue. Workstream chip uses sky-blue (Evals / AI Champions / AIT). URGENT (<3 days) P0 rows get soft red background. Done items collapse small/muted within their section.
  - Light mode (`color-scheme: light`), self-contained HTML (inline CSS, no external assets beyond allowed CDN list: Chart.js, Grid.js, Mermaid).
- **Style Refinement Protocol**: When Halim hand-edits artifact OR markdown briefing, NEXT run must:
  1. Read version Halim edited (artifact HTML or `Invisible-Briefing.md`).
  2. Read version generated by prior run (artifact history if available, or last commit if Halim checking briefing into git).
  3. Diff them. Identify EVERY change: phrasing tweaks, ordering, sections cut/added, what was emphasized, what was deemphasized.
  4. Think ultra hard. Do not paraphrase what changed - quote it. Differences are the lesson.
  5. Write new style rules into `X0. Earn/Invisible/CLAUDE.md`:
     - Vocabulary change: update Vocabulary lock-list.
     - Ordering change: update briefing-render rules.
     - Section cut: add to "Sections to never include" list (create if missing).
     - Phrasing changed: add "When phrasing X, prefer Y" rule with concrete example.
     - Draft edited: capture delta as draft-voice rule.
  6. Add dated entry to `## Style revisions` in CLAUDE.md describing change.
  7. Apply new rules in next briefing render. Repeat until Halim stops editing - convergence is the goal.
- **Done criteria**:
  - `X0. Earn/Invisible/memory.md` updated: frontmatter `last_updated:` to today; new people / asks / commitments folded in; checked-off tasks moved to Done; every #claude-assisted task has inline draft + Next step.
  - `X0. Earn/Invisible/Invisible-Briefing.md` rewritten with today's date in H1, drafts rendered inline in "Doing (Claude-assisted)".
  - `invisible-briefing` Cowork artifact updated in place, drafts in expandable details with Copy buttons.
  - If Style Refinement Protocol triggered: `X0. Earn/Invisible/CLAUDE.md ## Style revisions` has new dated entry.
  - Notify session on completion.
- **Failure modes to avoid**:
  - DO NOT pull from Things 3. All Invisible tasks live in `P1 Invisible.md` and mirrored `memory.md`. Vault-wide rule per `feedback_no_more_things`.
  - DO NOT create dated artifact ids (`invisible-briefing-2026-05-04` is wrong). One rolling artifact, no suffix, ever.
  - DO NOT paraphrase Halim's quoted asks from Granola. Verbatim or skip.
  - DO NOT surface equity / options / milestone / contract-rate numbers in artifact OR markdown. Artifact is for sharing inside Invisible.
  - DO NOT render equity status chip or top-open-thread chip in artifact's top strip. Strip carries days-to-contract-end and hours-this-week only.
  - DO NOT redact customer names (Apollo, eController) inside vault. Redact only when output leaves Halim's vault.
  - DO NOT pad Industry News section. If bucket returns nothing notable, render "No notable items." for that bucket.
  - DO NOT modify `P1 Invisible.md ## Tasks` rows directly - source-of-truth authority belongs there. Nightly `daily-sync` propagates check states.
  - DO NOT skip inline draft on #claude-assisted task. Every such row needs draft + Next step. If missing context, ask Halim in "Recently surfaced" section.
- **Tools required**: Filesystem, Cowork artifact MCP, Granola MCP (`list_meetings`, `query_granola_meetings`, `get_meeting_transcript`, `list_meeting_folders`), Google Calendar MCP (`list_events`), web fetch (industry news scan).
- **Output destinations**:
  - `X0. Earn/Invisible/Invisible-Briefing.md` (rolling)
  - `X0. Earn/Invisible/memory.md` (enriched)
  - `X0. Earn/Invisible/CLAUDE.md` (only under Style Refinement Protocol)
  - Cowork rolling artifact id `invisible-briefing`

---

## TASK: health-briefing

- **Source file**: `/Users/halim/Documents/Claude/Scheduled/health-briefing/SKILL.md`
- **Cadence**: Monday 6:05 AM (weekly).
- **Operating rule (locked 2026-05-13)**: Act, don't prompt. When a `## To-dos for Claude` row across the Health backlog or P0/P1 projects describes Claude-finishable work (research a clinic, score insurance options, summarize a longevity newsletter, look up a supplement interaction, fold an article into a memory/brain note), EXECUTE the work inline at the destination project file BEFORE rendering the briefing. The briefing reports completed work; only items requiring Halim's hands (call doctor, take supplement, do PT exercise, book appointment in person) appear as still-pending. NO "Claude prompts to launch" section. NO `#claude-assisted` tags.
- **Source files read (in order)**:
  1. `X2. Health/CLAUDE.md` - area context: priority system, profile, APOE4-specific risk factors, supplement stack.
  2. `X2. Health/_Backlog_.md` - master task list, organized by priority tier with checkboxes.
  3. `X2. Health/Health-Briefing.md` - last week's briefing. Detect items checked off + items still open after 2+ weeks (flag as stalled).
  4. Each `P0 *.md` and `P1 *.md` file in `X2. Health/`.
  5. `00. To Do/Capture.md ## Pending` - scan for health items captured since last briefing.
- **Render content (overwrite `X2. Health/Health-Briefing.md`)**:
  - **Top-of-page focus paragraph**: 2-3 sentences calling out single most important action this week.
  - **`## Done this morning (Claude work executed)`**: brief list of research / drafts / summaries produced this run, with destination paths.
  - **One section per P0 area** (Knee, New Insurance, Teeth & Gum, Gut, etc., in order of urgency). Each section uses subsections for `### Buy / order this week`, `### Do this week`, `### Avoid`, `### Red flags` (where applicable), `### Keep in mind`. Pull checkbox items verbatim from `_Backlog_.md` so nightly /sync can propagate completions back.
  - **One section per P1 area** (Memory/Brain, Longevity) with same shape but lighter.
  - **A P2 short-list** (one bullet block, no subsections).
  - **`## Captured this week`** - items pulled from Capture.md ## Pending that need routing.
  - **`## Progress check`** - checked-off items since last briefing, items pending more than two weeks (nudge), 1-paragraph nudge calling out highest-ROI unchecked items.
  - NO `## Claude prompts to launch today` section - the work is already done.
- **Artifact**: Update Cowork artifact with ID `health-briefing` (no date/week suffix). Use `update_artifact`, not `create_artifact`. Done items collapse via `<details>`.
- **Style**:
  - No em-dashes. Use `-` (hyphen with spaces).
  - Checkbox-first formatting; the checkbox is the contract.
  - Voice is direct and load-bearing: every line either tells Halim to do something this week or explains why it matters.
- **Tools required**: Filesystem, Cowork artifact MCP, web fetch (research lookups).
- **Output destinations**:
  - `/Users/halim/Documents/second-brain/X2. Health/Health-Briefing.md` (rolling weekly)
  - Cowork rolling artifact id `health-briefing`

---

## TASK: wealth-briefing

- **Source file**: `/Users/halim/Documents/Claude/Scheduled/wealth-briefing/SKILL.md`
- **Cadence**: Monday 6:01 AM (weekly).
- **Operating rule (locked 2026-05-13)**: Act, don't prompt. When a `## To-dos for Claude` row across the Wealth backlog or project files describes Claude-finishable work, EXECUTE it inline at the destination project file. NO "Claude prompts to launch" section. NO `#claude-assisted` tags. NO fenced code blocks.
- **Source rule**: All briefings ground in Obsidian only. **Stop pulling from Things 3** (per `feedback_no_more_things` + Halim's 2026-04-29 capture for Wealth specifically). Read `_Backlog_.md` / project `## Tasks` instead.
- **Boundary**: LLC bookkeeping, corporate credit card, S-Corp election live under Wealth (`P1 S-Corp Election`), never Admin (per `feedback_wealth_admin_boundary`).
- **Rolling artifact contract**:
  - Artifact ID is exactly `wealth-briefing`. No date/week suffix.
  - Artifact name is exactly `Wealth Briefing`.
  - Always `list_artifacts` first; `update_artifact` if it exists.
  - Never create dated duplicates.
- **Source files read**:
  1. `X3. Wealth/CLAUDE.md` - anchors (tax filing deadline, S-corp, etc.).
  2. `X3. Wealth/_Backlog_.md` and active project files (PN Complete Taxes, P1 S-Corp Election, etc.).
  3. `X3. Wealth/Wealth-Briefing.md` - existing rolling briefing.
  4. Every `X3. Wealth/Pn/*.md` and `X3. Wealth/Px/*.md` for `## Tasks` and `## To-dos for Claude` sections.
  5. Root `CLAUDE.md`.
- **Picker / drafter logic**:
  1. **Execution step:** For each Claude-finishable `## To-dos for Claude` row, execute the work and drop deliverable into destination project file. Move row to `## Done`.
  2. Tax status section - countdown to filing deadline, URGENT-window crossings, 2025 return progress, S-corp setup, HSA funding, property tax, S-corp decision deadline.
  3. This-week priorities from `_Backlog_.md ## To Do` and project `## Tasks` - P0 first then deadline. Hands-required items only stay as `- [ ]`.
  4. Rewrite `X3. Wealth/Wealth-Briefing.md` with H1 `# Wealth Briefing - Week of YYYY-MM-DD`, italic generated-on line + days-to-anchor, `## Done this morning (Claude work executed)`, then numbered sections. `- [ ]` checkboxes for actionable items. No em dashes.
  5. Done items collapse via `<details>`.
  6. Update artifact via `update_artifact` id `wealth-briefing`. Read current HTML first. Meta description: "This week's tax + financial priorities, with Claude-finishable rows executed inline. Updated YYYY-MM-DD."
- **Output**: one-line summary - days to tax deadline + # urgent items + # Claude rows executed.
- **Tools required**: Filesystem, Cowork artifact MCP, web fetch (financial research / tax lookup).
- **Output destinations**:
  - `X3. Wealth/Wealth-Briefing.md` (rolling weekly)
  - Cowork rolling artifact id `wealth-briefing`

---

## TASK: health-protocol-monday

- **Source file**: `/Users/halim/Documents/Claude/Scheduled/health-protocol-monday/SKILL.md`
- **Cadence**: Weekly Monday 8:00 AM local time.
- **Purpose**: Surface the canonical Health Protocol so Halim has a single 30-minute review window each week to confirm what he's taking, what he should be taking, and whether anything has drifted.
- **Steps (verbatim)**:
  1. Read the canonical protocol file: `/Users/halim/Documents/second-brain/X2. Health/Health Protocol.md`. This is the source of truth for the daily and weekly routine across knee, gut, memory, and longevity.
  2. Read the current state of these supporting files to detect drift:
     - `/Users/halim/Documents/second-brain/X2. Health/CLAUDE.md` (current supplement stack table)
     - `/Users/halim/Documents/second-brain/X2. Health/P0 Knee.md ## Supplement stack`
     - `/Users/halim/Documents/second-brain/X2. Health/P1 Gut.md`
     - `/Users/halim/Documents/second-brain/X2. Health/P1 Memory.md`
     - `/Users/halim/Documents/second-brain/X2. Health/P2 Longevity.md`
     - `/Users/halim/Documents/second-brain/X2. Health/Health-Briefing.md`
  3. Build a single condensed Monday review surfacing:
     - **Daily supplement routine by time of day** (AM with breakfast, midday/pre-PT, evening, pre-bed) - copied from Health Protocol with each supplement, dose, and the one-line why
     - **Knee phase status** - which rehab phase Halim is in (1, 2, or 3) per P0 Knee.md, and what that means for the week. Include the Keith Baar collagen+vitamin C 60-minute pre-PT timing rule prominently
     - **Gut phase status** - sweetener audit done? fermented foods cadence holding? Probiotic landed?
     - **Memory layer** - high-DHA fish oil gap still open? Citicoline cadence holding? Any new APOE4-specific evidence to flag?
     - **Open buy-list gaps** - what's still on the buy list and not yet ordered (Legion Fortify, Carlson Maximum Omega 2000, CEREBIOME vs Neuralli decision, L-Glutamine, Phosphatidylserine)
     - **Stop list status** - has standalone zinc / boron been discontinued? If not, nudge
     - **Bloodwork status** - is Function Health reactivated? Has the panel been ordered? This is the gating decision for half the supplement stack
     - **One-line nudge** - the single highest-leverage move for this week
  4. Apply vault formatting rules: no em dashes (use `-` with spaces), no blank lines between bullets in lists, [P0]/[P1]/[P2] tags on any new tasks created, follow Notes.md style throughout.
  5. **Update [[Health Protocol]] if anything has drifted.** If a new supplement was added mid-week (capture, Amazon receipt, etc.), fold it into the Current Supplement Stack table and the Daily Routine section. If a supplement was discontinued, mark it accordingly.
  6. **Update [[Health-Briefing]] supplement summary section** if the orders status changed in the past week.
  7. Surface the review as the response to this scheduled task. Use a tight, scannable format - this is meant to be a 30-minute Monday read, not a deep dive. The deep dive lives in Health Protocol; this is just the weekly check-in.
  8. If any of the buy-list gaps are P1 and still unordered (especially high-DHA fish oil for APOE4 memory protection), flag that as the week's top buy-list nudge.
- **Notes (profile context)**:
  - Halim is 37, APOE4 carrier, currently in active knee rehab (post-MRI 2026-05-02, pre-orthopedist consult). Strength training restricted to upper body + good leg + isometrics on injured side.
  - He prefers terse direct prose, no em-dashes ever, opinionated takes over generic advice.
  - The vault is Obsidian; use [[wikilinks]] for cross-references between health files.
  - The 30-minute window means he wants to read the digest, confirm or adjust, and move on - not start a new research thread.
- **Deliverable**: A Monday digest covering daily routine, phase statuses, gaps, nudge - PLUS any updates to Health Protocol / Health-Briefing if drift was detected.
- **Tools required**: Filesystem only (no Cowork artifact for this one - it's a chat surface + protocol updates).
- **Output destinations**:
  - Chat response surfacing the Monday digest
  - `X2. Health/Health Protocol.md` (if drift detected)
  - `X2. Health/Health-Briefing.md` supplement summary section (if orders status changed)

---

## TASK: strategy-briefing

- **Source file**: `/Users/halim/Documents/Claude/Scheduled/strategy-briefing/SKILL.md`
- **Cadence**: Daily 7am PT (runs after the area briefings at 6:05-6:20 have finished refreshing). NB: PRD listed Sunday eve but the SKILL.md says daily 7am.
- **Operating rule (locked 2026-05-13)**: Act, don't prompt. When a `## To-dos for Claude` row anywhere in the vault can be finished autonomously, finish it inline (write the wiki, draft the email, do the research) BEFORE the briefing renders. The briefing reports completed work; only items requiring Halim's hands or judgment appear as still-pending tasks. NO "Claude prompts to launch" section. NO `#claude-assisted` tags. NO fenced code blocks.
- **Two outputs per run**:
  1. A markdown plan note at `/Users/halim/Documents/second-brain/00. To Do/Strategy-Briefing.md` (single rolling file, overwrite every run - NOT a dated file).
  2. An updated rolling Cowork artifact with id `strategy-briefing` (canonical artifact - never create new, always `update_artifact`). Per `feedback_rolling_briefing_artifacts`: one rolling artifact per area, never create dated duplicates.
- **Shape of the briefing (top to bottom)**:
  - **1. Top-of-vault P0s (THE VERY TOP of the artifact)**:
    - Most important section. Scan EVERY active project file across the vault and surface the top P0 task from each one.
    - Flat scannable list grouped by area:

      ```
      ## Top P0s across the vault

      ### X0. Earn
      - [ ] [P00] **<top P0 task from P0 Clarinet.md>** | Deadline | source: [[P0 Clarinet]]
      - [ ] [P00] **<top P0 task from P1 Invisible.md>** | Deadline | source: [[P1 Invisible]]
      ...

      ### A2. Make
      - [ ] [P00] **<top P0 from P0 Website v2 EO May.md>** | Deadline | source: [[P0 Website v2 EO May]]
      - [ ] [P00] **<top P0 from P0 Singulars.md>** | Deadline | source: [[P0 Singulars]]
      ...
      ```

    - Rules:
      - "Active project" = any `Pn/*.md` or `Px/*.md` file whose frontmatter `status` is `now` (or `priority: P0`/`priority: P1` if status is absent).
      - "Top P0" = the highest-priority unchecked task from that project's `## Tasks` section. If a project has no P0 tasks, surface its top P1 with a `[P1 - no P0]` tag. If it has no open tasks at all, skip it.
      - Sort within each area: P0 first then P1, deadline as tiebreaker.
      - Color: P0 red, P1 neutral/amber, P2 muted.
      - Maximum one row per project (the single top item) - keeps section scannable.

  - **2. Today's focus (3-5 anchors)**: Pick 3-5 P0 items from section 1 that should actually move today. NOT new picks - pointers to rows already in section 1, marked with planned focus window (AM / PM, or specific 1h blocks if calendar context allows).
  - **3. This week's anchors (5-7 priorities with 3 x 1h blocks each)**: Traditional strategic synthesis. 5-7 priorities for current Mon-Sun, each with 3 x 1h focus blocks placed across weekdays. Drawn from `00. To Do/OKRs.md`, the 10 area briefings, and any cross-project dependencies. Use matrix table format from previous weekly version. If today is mid-week, carry forward Monday's allocation rather than re-allocating from scratch (preserve continuity).
  - **4. Roll-up by area briefing**: 2-3 bullets per area summarizing what the latest run of each area briefing surfaced. Read all 12 area briefings (Learn, Make, Write, Share, Apply, Network, Earn, Health, Wealth, Admin, Outings, Write). Be terse.
  - **5. Heads-up next 14-30 days**: Items not in today's focus but crossing deadline thresholds soon.
  - **6. Friction watch**: Stale checkboxes, overdue P0s, blocking dependencies, capture queue size, projects with no recent activity.

- **Source files to read (in this order)**:
  1. `/Users/halim/Documents/second-brain/CLAUDE.md` - root rules + the act-don't-prompt rule.
  2. `/Users/halim/Documents/second-brain/00. To Do/OKRs.md` - top-level priorities.
  3. `/Users/halim/Documents/second-brain/00. To Do/Capture.md` - new captures (`## Pending`). If anything is still pending and Claude-finishable, fold the work in here as well (don't wait for inbox-hourly-process).
  4. Every `Pn/*.md` and `Px/*.md` file across the vault. Use `find /Users/halim/Documents/second-brain -path '*/P[nx]/*.md' -o -path '*/P[0-9]*.md'` to enumerate. (Excludes `_Backlog_.md`, `CLAUDE.md`, area files starting with underscore.)
  5. The 12 area briefings (Learn, Make, Write, Share, Apply, Network, Earn, Health, Wealth, Admin, Outings, plus any new ones).
  6. The previous Strategy-Briefing.md so you can carry forward incomplete items.
  7. The current `strategy-briefing` artifact - call `mcp__cowork__list_artifacts`, find id `strategy-briefing`, Read its `path` so you can carry the visual style forward.
- **Markdown render template**:

  ```markdown
  ---
  id: strategy-briefing
  type: daily-strategy
  generated: YYYY-MM-DD
  covers_week: YYYY-MM-DD to YYYY-MM-DD
  ---

  # Strategy Briefing - YYYY-MM-DD

  [1-2 sentences: today's anchor + the week's tone]

  ## Top P0s across the vault

  [grouped by area, one row per active project, sorted P0 then P1 then deadline]

  ## Today's focus

  [3-5 anchors pulled from above, with AM/PM placement]

  ## This week's anchors (Mon-Sun) - 3 x 1h blocks each

  | Priority | Mon | Tue | Wed | Thu | Fri | Total |
  [...]

  ### Priority context

  [For each of the 5-7 weekly priorities: 3-6 bullets of context - deadlines, dependencies, source-of-truth file, what "done this week" looks like]

  ## Roll-up by area briefing

  [2-3 bullets per area]

  ## Heads-up next 14-30 days

  [Items crossing deadline thresholds soon]

  ## Friction watch

  - Stale checkboxes / verbally-DONE items not ticked
  - Overdue P0s
  - Blocking dependencies
  - Capture queue size
  - Projects with no activity in 14+ days

  ---

  Sort rule: P0 always sits at top of every list, then P1, then P2. Color: P0 is the only thing that should ever read as red. Deadline is a secondary sort, never a priority override.
  ```

- **Artifact update flow (CRITICAL - rolling, not new)**:
  1. Call `mcp__cowork__list_artifacts`. Find entry with `id: "strategy-briefing"`.
  2. Read its `path` to inherit visual style (CSS variables, chip system, priority cards, matrix table, area grid).
  3. Restructure: TOP-OF-VAULT P0s grid is new hero section (was priority cards block in old layout). Today's focus is smaller second block. Weekly matrix + roll-up + heads-up + friction follow.
  4. Write updated HTML to workspace, call `mcp__cowork__update_artifact` with `id: "strategy-briefing"` and one-line `update_summary` like "Refreshed YYYY-MM-DD - top P0s from N projects".
  5. **Never call `create_artifact`.** Never create dated artifact id. Always update in place.
- **Carryover rule**: If items from yesterday's briefing are still open, surface at top of "Today's focus" with `(carry)` suffix. If something has been carrying 5+ days, flag in Friction watch with "blocked or de-prioritize?".
- **Final step**: After writing file and updating artifact, output 4-6 line chat summary: today's 3-5 focus anchors + single highest-leverage AM action + project count surfaced in Top P0s. Do not paste full plan into chat.
- **Style**: no em-dashes, references in Halim's voice (Anne Carson / Cheryl Strayed / Beckett), terse and concrete.
- **Tools required**: Filesystem, Cowork artifact MCP, glob/find across vault.
- **Output destinations**:
  - `00. To Do/Strategy-Briefing.md` (rolling)
  - Cowork rolling artifact id `strategy-briefing`

---

## TASK: outings-briefing

- **Source file**: `/Users/halim/Documents/Claude/Scheduled/outings-briefing/SKILL.md`
- **Cadence**: Monday 4am PT (week-ahead). Pair with `X4. Admin/P1 City Outings.md` (persistent invitations pipeline).
- **Purpose**: Halim is based in San Francisco. Surface every important event happening in SF this week, filtered by his taste profile, organized day by day with 3 top picks across categories. Output is a vault file + a rolling Cowork artifact. NO Gmail draft.
- **What to scan (mandatory)**:
  1. **GMAIL LABEL `City/_SF_`** (last 7-8 days). Search: `label:City/_SF_ newer_than:8d`. Page through with pageToken if >50. CALL get_thread on EVERY relevant match - snippet preview rarely has actual time/date/price. Senders to expect:
     - Manny's, ODC, The Lab, SF Playhouse, The Marsh, NCTC, Z Space, CounterPulse, LINES Ballet, SF Ballet, Oakland Ballet, Dance Mission, SF Performances, SFIAF, KR Misfit Cabaret, fouronenine, Black Cat, Groupmuse, The Midway, Public SF, Another Planet (Castro/Bill Graham), SFJAZZ, Daybreaker, The Roxie, ArtSpan, Hashimoto Contemporary, Rebecca Camacho, 1-2-0-7-1-0 Gallery, Climate Control SF, Long Now, Commonwealth Club, Shack15, Bond AI/Luma, Big Brain SF, Generic Luma SF, Gray Area, Nerd Nite SF, CityArts, Reimagine, Burning Man Jackrabbit Speaks, SF Station, FunCheap SF, SF Chronicle Datebook, Exploratorium, Cal Academy NightLife, Alliance Française SF, Beat Museum, Alchemy Springs, Reboot Spa, SF Writing Institute, Detour Productions, Full Bloom, Magic Theatre, Minnesota Street Project, Moth Belly, Hollie Hardy / Write Now, FoundSF, Mortified.
  2. **WEB FETCH** (always do this; Gmail alone misses gallery openings, museum exhibitions, BAMPFA, Other Minds, Public Works late-announce, SFJAZZ irregular newsletter):
     - SF Funcheap weekend guide: https://sf.funcheap.com/this-weeks-events/
     - SF Standard events: https://sfstandard.com (filter for events tag) and https://sfstandard.com/author/josh-constine/ (Outgoers Wed evening column)
     - 48 Hills events: https://48hills.org/events
     - DoTheBay: https://dothebay.com/?ref=this-week
     - KQED Arts: https://www.kqed.org/arts
     - The Frisc: https://thefrisc.com
     - Mission Local
     - Eater SF, The Bay Bridged, 7x7
     - SFJAZZ calendar: https://www.sfjazz.org/calendar
     - Public Works calendar: https://publicsf.com/calendar
     - The Castro / Another Planet: https://www.thecastro.com
     - BAMPFA: https://bampfa.org/calendar
     - YBCA: https://ybca.org/whats-on
     - Cal Performances: https://calperformances.org/events
     - Manny's: https://welcometomannys.com
     - Long Now: https://longnow.org/seminars
     - Commonwealth Club: https://www.commonwealthclub.org/events
     - Other Minds: https://www.otherminds.org
     - Center for New Music: https://centerfornewmusic.com
     - SF Symphony SoundBox: https://www.sfsymphony.org/Buy-Tickets/SoundBox
     - Pier 24 Photography: https://pier24.org
     - Minnesota Street Project: https://minnesotastreetproject.com/exhibitions
     - 49 Geary Street galleries (Fraenkel, Haines, Maybaum, Robert Koch)
     - McEvoy Foundation: https://mcevoyarts.org
     - KADIST: https://www.kadist.org
     - ICA SF: https://icasf.org
     - SFMOMA: https://www.sfmoma.org/exhibitions
     - de Young: https://deyoung.famsf.org
     - Asian Art Museum: https://exhibitions.asianart.org
     - Legion of Honor: https://legionofhonor.famsf.org
     - MoAD: https://www.moadsf.org
     - OMCA: https://museumca.org
     - Cantor (Stanford): https://museum.stanford.edu
     - Walt Disney Family Museum, GLBT History Museum, Beat Museum
     - Other Cinema at ATA: https://www.othercinema.com
     - Roxie: https://roxie.com
     - Vogue, Balboa, 4-Star, Alamo Drafthouse SF
     - The Independent, The Chapel, Great American Music Hall, Bottom of the Hill, The Fillmore, The Warfield, The Regency Ballroom, Cafe du Nord/Swedish American Hall, Bird & Beckett (jazz), Old First Concerts, Yoshi's Oakland, Freight & Salvage Berkeley, UC Theatre Berkeley, Rickshaw Stop, Brick & Mortar, Bender's, Knockout, Madrone Art Bar, Boom Boom Room, Halcyon SF, New Parish Oakland, Fox Theater Oakland
     - Internet Archive: https://archive.org/about/events.php
     - Mechanics' Institute: https://www.milibrary.org/events
     - City Lights, Booksmith, Green Apple, Books Inc readings
     - AI Tinkerers SF: https://aitinkerers.org, AI Salon SF, GenAI Collective, Sundai Club
     - Magic Theatre: https://magictheatre.org/upcoming
     - Crowded Fire, Brava Theater, ACT, Berkeley Rep
     - ODC, LINES, AXIS Dance, Joe Goode, Margaret Jenkins, Robert Moses' Kin
     - Cal Academy NightLife (Thursdays 21+): https://www.calacademy.org/nightlife
     - Exploratorium After Dark (Thursdays 18+): https://www.exploratorium.edu/visit/after-dark
     - Stern Grove Festival (June-Aug): https://sterngrove.org
     - 5Rhythms SF, Ecstatic Dance Oakland (Sweet's Ballroom Tuesdays)
     - Off the Grid Friday Fort Mason / Sunday Picnic at the Presidio
     - Ferry Plaza Farmers Market
  3. **ANNUAL / SEASONAL FLAGS for "On the horizon"**: Bay Area Dance Week (late Apr), SF Cookbook Week (Apr), SFFILM Festival (Apr-May), Carnaval SF (late May), Frameline (June), SF Pride (June), Stern Grove Festival (June-Aug), Outside Lands (Aug), Folsom Street Fair (Sept), Mill Valley Film Festival (Oct), Hardly Strictly Bluegrass (Oct), Litquake (Oct), Day of the Dead (Nov), SF Silent Film Festival (varies), CAAMFest (varies), Other Minds Festival (varies), SF Tape Music Festival (Jan), Switchboard Music Festival.
- **Filter by taste**:
  - **HIGH SIGNAL (always include)**: art x technology (generative art, AI art, TIAT, Gray Area, Pier 24, McEvoy), ideas + intellectual discourse (Long Now, Commonwealth Club, Manny's, Big Brain SF, Shack15, Internet Archive, City Lights, Mechanics' Institute), experimental performance (The Lab, CounterPulse, ODC, YBCA, Cal Performances, Magic Theatre, Crowded Fire), new/experimental music (Other Minds, Switchboard, SF Tape, Center for New Music, SF Symphony SoundBox, Old First, Bird & Beckett), niche cultural moments (rare film with director Q&A, gallery openings with artist present, intimate concerts), SF-specific culture, curiosity-driven weirdness (Other Cinema at ATA, algae yarn workshops, Doggy Flautists), politics + civic life, soundsystem music (Public Works Funktion-One, dub, electronic, jazz), photography openings (Pier 24, Fraenkel, Robert Koch, Hashimoto), Singulars-aligned events (art x tech x lit overlap with Halim's pieces in A2. Make).
  - **LOW SIGNAL (drop)**: mainstream pop concerts at large arenas (Chase Center pop), sports unless tied to community events, generic happy hours, celebrity comedy specials at Castro unless very unusual, generic startup demo nights, wine bar / cocktail-of-the-week openings.
- **TOP 3 PICKS RULE**: Pick 3 across DIFFERENT categories. 2-sentence reason each. Common winners: 1 gallery/art + 1 ideas/talk + 1 unique experience. Or 1 performance + 1 ideas + 1 niche/weird thing. Don't pick 3 music events.
- **Output 1 - vault file** (overwrite `/Users/halim/Documents/second-brain/X4. Admin/Outings-Briefing.md`):

  ```
  # Outings Briefing - YYYY-MM-DD

  [2-3 sentence "Week Pulse" - what's the texture of this week?]

  ## Top picks
  [3 across categories, 2-sentence reason each]

  ## Day-by-day
  ### Monday MMM D
  - [event row: emoji + bold title (P0/P1/P2 tag if applicable) + monospace time/venue/price line + 1-2 sentence description + source credit]
  ### Tuesday MMM D
  ... (skip days with nothing)

  ## Recurring this week
  [weekly events: Black Cat Soul Sessions Wed, Exploratorium After Dark Thu, Off the Grid Fri Fort Mason, Sundays at the Presidio, Cal Academy NightLife Thu, Ferry Plaza market Tue/Thu/Sat, etc.]

  ## Galleries + Museums open this week
  [current shows + opening receptions this week + closing-soon flags. Always include SFMOMA, Fraenkel, Minnesota Street Project status, Pier 24, Asian Art, de Young, Legion of Honor, ICA SF, KADIST]

  ## On the horizon (2-8 weeks out)
  [2-8 events worth flagging now for tickets / sell-out risk]

  ## Manual checks (Tier 4)
  - Liz Cahill stories (Messenger)
  - Mika Sigourney stories
  - Notion List SF
  - Decentered: http://tinyurl.com/dca-eventracker

  ## Footer
  - Sort rule: P0 always at top, then P1, then P2. Color: P0 red only. Deadline secondary.
  - Briefing pairs with [[X4. Admin/P1 City Outings]] - flag a candidate by adding to that file's `## Tasks ### Ideas to schedule`.
  - Source coverage: 50+ Gmail subscriptions + 80+ web-fetched venues/aggregators. See [[X4. Admin/Outings-Briefing-Proposal]] for the full source list.
  ```

  (Source SKILL uses emoji glyphs on the Top picks / Galleries / On-the-horizon / Manual-checks headings; stripped here per Halim's no-emoji global rule, but the source still emits them.)
  Sort within each section: P0 first, P1 second, P2 third. P0 only renders red. Frontmatter:

  ```
  ---
  id: <stable-uuid>
  type: rolling-briefing
  area: X4. Admin
  anchors_on: <stable-source-id>
  ---
  ```

- **Output 2 - Cowork artifact**: Call `mcp__cowork__list_artifacts` first, then `mcp__cowork__update_artifact` on canonical id `outings-briefing` (only call `create_artifact` if missing). Visual: dark-mode editorial - background near-black (#0C0B09), vermillion red (#D6242D) day headers, gold (#C4A832) top-pick boxes, off-white (#F5EDD8) headlines, monospace times. Width 660-680px max. Mobile-readable.
- **Quality checklist (verify before finishing)**:
  - All events Mon -> Sun this week. Drop anything before today.
  - Every event has exact date + time (or "time TBC" flag).
  - Events sorted day-by-day, then by time within day.
  - Top 3 across different categories.
  - Galleries + Museums section included with current shows + closing-soon flags.
  - SF Standard / Outgoers / Josh Constine checked on web (no Gmail thread for SMS-only Outgoers).
  - Public Works calendar checked.
  - SFJAZZ checked on sfjazz.org/calendar.
  - BAMPFA checked.
  - Recurring events in dedicated section, not repeated daily.
  - On-the-Horizon includes 2-8 weeks out.
  - Sold-out events marked SOLD OUT but kept in.
  - Manual-check section nudges Halim re: Liz Cahill / Mika Sigourney / Notion / Decentered.
  - HTML in artifact: inline styles only (table layout for Gmail-strip-safe even though no Gmail draft).
  - Footer restates the P0 sort + color rule.
- **Do NOT skip the web sweep.** Gmail alone misses BAMPFA, Pier 24, Other Minds, gallery openings, museum exhibitions, Public Works late-announce. Web fetch is mandatory.
- **Do NOT create a Gmail draft.** Artifact + .md only.
- **Tools required**: Filesystem, Gmail MCP (list/get*thread on label `City/\_SF*`), Cowork artifact MCP, web fetch (80+ venues/aggregators).
- **Output destinations**:
  - `/Users/halim/Documents/second-brain/X4. Admin/Outings-Briefing.md` (rolling, weekly + Thursday delta)
  - Cowork rolling artifact id `outings-briefing`

---

## TASK: outings-briefing-thursday

- **Source file**: `/Users/halim/Documents/Claude/Scheduled/outings-briefing-thursday/SKILL.md`
- **Cadence**: Thursday 4am PT.
- **Purpose**: Lighter delta refresh of Outings Briefing for weekend lock-in (Thu -> Sun this week + Mon -> Wed next week). Catches late-announce weekend events, Wed-evening Outgoers column, gallery First-Saturdays, late club nights. Updates rolling `outings-briefing` Cowork artifact in place.
- **What to scan (delta only - skip the full Monday sweep)**:
  1. Gmail label `City/_SF_` since Monday. Search: `label:City/_SF_ newer_than:3d`. CALL get_thread on every relevant match.
  2. Wednesday-evening updates (just published):
     - SF Standard / Outgoers / Josh Constine column: https://sfstandard.com/author/josh-constine/ (publishes Wed evening)
     - SF Funcheap "this weekend" updated guide: https://sf.funcheap.com/this-weeks-events/
     - 48 Hills weekend update: https://48hills.org/events
  3. Re-check for late-announce additions (these venues often post Wed/Thu):
     - Public Works calendar: https://publicsf.com/calendar
     - SFJAZZ: https://www.sfjazz.org/calendar
     - BAMPFA: https://bampfa.org/calendar
     - Other Minds: https://www.otherminds.org
     - The Castro / Another Planet: https://www.thecastro.com
     - The Independent, The Chapel, Great American Music Hall
  4. Friday/Saturday/Sunday club nights, gallery First-Saturday openings (if first weekend of month - check Minnesota Street Project, McEvoy, KADIST, ICA SF).
  5. Cal Academy NightLife (every Thursday) and Exploratorium After Dark (every Thursday) - confirm tonight's theme.
- **Output**:
  1. Overwrite `/Users/halim/Documents/second-brain/X4. Admin/Outings-Briefing.md` (keep same structure as Monday run; new H1 date). Roll the briefing forward through Mon-Wed of next week so there's no gap before next Monday's full run.
  2. Update the `outings-briefing` Cowork artifact in place via `mcp__cowork__update_artifact` (call `list_artifacts` first to confirm canonical id).
  3. In the Week Pulse, lead with what's tightening THIS WEEKEND (sold-out warnings, late-announce highlights, weather flags, last-day-to-see exhibitions).
- **Filter by taste**: same as Monday run.
  - HIGH SIGNAL: art x technology (Gray Area, Pier 24, TIAT, McEvoy, ICA SF, KADIST), ideas + intellectual discourse (Long Now, Commonwealth Club, Manny's, Big Brain SF, Shack15), experimental performance (The Lab, CounterPulse, ODC, YBCA, Cal Performances, Magic Theatre, Crowded Fire), new/experimental music (Other Minds, Center for New Music, SF Symphony SoundBox, Old First, Bird & Beckett), niche cultural moments, SF-specific culture, curiosity-driven weirdness, politics + civic life, soundsystem music (Public Works Funktion-One), photography openings, Singulars-aligned events.
  - LOW SIGNAL (drop): arena pop, sports, generic happy hours, celebrity comedy specials, generic startup demos.
- **TOP 3 PICKS RULE**: 3 across DIFFERENT categories. Re-pick from updated event list - don't just carry Monday's picks if better options surfaced this week.
- **Quality checklist**:
  - Drop anything before today.
  - Every event has exact date + time.
  - Events sorted day-by-day, then by time within day.
  - Top 3 across different categories.
  - Galleries + Museums section refreshed (closing-soon flags).
  - SF Standard / Outgoers checked on web.
  - Public Works calendar re-checked.
  - SFJAZZ re-checked.
  - Sold-out events marked SOLD OUT.
  - Manual-check section retained.
  - Footer restates P0 sort + color rule.
- **Do NOT create a Gmail draft.** Artifact + .md only.
- **Tools required**: Filesystem, Gmail MCP, Cowork artifact MCP, web fetch (subset of Monday list focused on Wed-evening late-announce venues).
- **Output destinations**:
  - `/Users/halim/Documents/second-brain/X4. Admin/Outings-Briefing.md` (rolling, overwrite Monday's)
  - Cowork rolling artifact id `outings-briefing`

---

## TASK: sync-raw-weekly

- **Source file**: `/Users/halim/Documents/Claude/Scheduled/sync-raw-weekly/SKILL.md`
- **Cadence**: Sunday 8 PM PT (weekly).
- **Purpose**: Two-phase weekly job: (1) pull Granola transcripts from three folders into the vault, then (2) sweep everything in `A1. Learn/0. raw/` modified since last run and ingest into the LLM Wiki.
- **State file (source of truth for "since last run")**: `/Users/halim/Documents/second-brain/A1. Learn/0. raw/.sync_state.json`. Read at start, write at end. Schema:
  ```json
  {
    "last_run_iso": "2026-05-07T20:00:00-07:00",
    "transcripts_pulled_total": 60,
    "wiki_entries_added_total": 142,
    "last_run_summary": "Pulled 4 transcripts (Friend Talks 2, hmart 2). Appended 9 source notes across 6 wikis. Created 3 raw/notes entries. Proposed 1 new tag (#sf-arts-scene)."
  }
  ```
  If file doesn't exist, treat `last_run_iso` as null and process everything (first-run mode).
- **Phase 1 - pull Granola transcripts**:
  - Three Granola folder IDs (verified 2026-05-07):
    - Art coaching: `a1521dcd-e77d-4b04-8a33-7b6fc6640afb`
    - Friend Talks: `d54024c5-ae50-4d1d-ba1f-d614e7c9663a`
    - hmart: `fe1a6e4f-3bdd-45db-a67f-a0b774625330`
  - For each folder:
    1. Call `list_meetings` with `folder_id` and `time_range` covering `last_run_iso` to now. If first run, use `time_range: "custom"` with `custom_start: "2024-01-01"` and `custom_end: today`.
    2. For each meeting whose `created_at` (or modified time) is `> last_run_iso` (or all on first run), check whether transcript file already exists at `A1. Learn/0. raw/transcripts/<filename>` (filename rule below). If yes, skip - non-destructive, never overwrite.
    3. Otherwise call `get_meeting_transcript` with meeting id.
    4. Clean for legibility (see cleanup rules below).
    5. Write cleaned transcript to `A1. Learn/0. raw/transcripts/<filename>.md`.
  - **Filename rule**: `YYYY-MM-DD - <folder> - <meeting title slugified>.md`. Example: `2026-04-22 - Art coaching - Studio visit with Mira.md`. Date = meeting's `created_at` (not today). Slugify by stripping punctuation, replacing spaces with single spaces, max 80 chars before extension.
  - **File frontmatter**:
    ```yaml
    ---
    id: <new uuid>
    type: transcript
    source: granola
    granola_id: <meeting uuid>
    folder: <Art coaching|Friend Talks|hmart>
    meeting_date: YYYY-MM-DD
    pulled_at: YYYY-MM-DD
    participants: [<name>, <name>]
    ---
    ```
  - **Transcript cleanup rules**:
    - Strip Granola-isms (timestamps inline, "Speaker 1:" placeholders if a real name is known elsewhere - keep them if not).
    - Add paragraph breaks every 3-5 turns or every ~150 words within single speaker's turn.
    - Fix obviously transcribed-wrong words ONLY if confident (preserve uncertainty otherwise - mark with `[?]`).
    - Do NOT summarize, paraphrase, or compress. Transcript stays verbatim. Cleanup is structural only.
    - Keep speaker labels as `**Halim:**` and `**<Name>:**` at start of each turn, on its own line.
    - Strip filler ("um", "uh", "you know" when used as filler) sparingly - only when removal genuinely helps legibility. Bias toward keeping.
    - Do NOT use em dashes. Use hyphen with spaces ( - ) instead.
  - **Granola handling**: non-destructive. Don't tag, don't modify, don't delete the original Granola meeting. Just pull.
- **Phase 2 - ingest raw into wikis**:
  - After Phase 1, sweep `A1. Learn/0. raw/` (recursively) for files where `mtime > last_run_iso` (or all files if first run). Include all subfolders: `kindle/`, `matter/`, `notes/`, `transcripts/`, `web/`.
  - For each new raw file:
    1. Read end-to-end.
    2. Identify candidate tags by matching against `A1. Learn/index.md ## Tag taxonomy (canonical)` and existing wiki filenames at `A1. Learn/1. Wikis/`.
    3. **Decision tree**:
       - If file's takes meaningfully extend an EXISTING wiki (file resonates with one or more wikis at `1. Wikis/<tag>.md`): append a dated entry under that wiki's `## Source notes` (latest at TOP, not appended-to-bottom). Format per wiki page template in `A1. Learn/CLAUDE.md`:
         ```
         - **YYYY-MM-DD.** One-paragraph distillation of what this source contributes to this wiki's argument. Source: [[0. raw/<subfolder>/<filename>]].
         - Work / images: [Title](url) (only if source has link to a work/image)
         ```
         Increment wiki's frontmatter `sources` count and update `last_ingest`. Refresh synthesis paragraph (blockquote at top) ONLY if source meaningfully shifts picture.
       - If file is a single observation about a new artist / quote / passing thought (no clear fit): leave it where it is in `0. raw/<subfolder>/`. Do NOT move it. The lint rule already says solo notes live in raw and only get promoted to wikis at 3+ sources.
       - If file's takes argue for a NEW canonical tag that doesn't exist yet: do NOT create the wiki. Instead append a row to `A1. Learn/index.md ## Proposed tags` with proposed tag, one-line argument, and source. New wikis only created when 3+ sources have referenced proposed tag (per lint rule).
    4. Cross-refs: if source connects two existing wikis not currently cross-linked, add cross-ref to both wikis' `## Cross-refs` section.
  - **Important**: auto-append source notes to existing wikis is allowed (wiki is LLM-owned per schema). New wiki creation is NOT - goes through proposal -> 3 sources -> lint promotion. Tag taxonomy changes go through `index.md ## Proposed`.
- **Phase 3 - log + briefing**:
  1. Append single entry to `A1. Learn/log.md`:
     ```
     ## [YYYY-MM-DD] sync-raw-weekly | <N> transcripts pulled, <N> wiki entries added, <N> raw/notes entries, <N> proposed tags
     - Transcripts: <count by folder>
     - Wiki entries by wiki: <wiki>: +<n>; ...
     - Proposed tags: <list or "none">
     - New cross-refs: <count or "none">
     ```
  2. Update `A1. Learn/index.md ## Recent activity` (last 14 days) with run summary.
  3. Write new `.sync_state.json` with current ISO timestamp and one-paragraph `last_run_summary`.
  4. Surface run in next `learn-briefing` by leaving log entry where briefing's "Tag movement this week" section already reads from.
- **Output to chat (concise summary)**:

  ```
  Sync Raw Weekly | YYYY-MM-DD

  Transcripts pulled: <N> (Art coaching <n>, Friend Talks <n>, hmart <n>)
  Wiki entries added: <N> across <K> wikis (top: [[wiki-a]] +<n>, [[wiki-b]] +<n>)
  Raw notes added: <N> (e.g., "Artist X - Work Y")
  Proposed tags: <list or none>
  Cross-refs added: <N>

  Notable threads this week: <2-3 sentence narrative of what's coalescing>
  ```

  If anything blocks (Granola tool error, missing folder, write conflict), report block and stop - do NOT silently skip.

- **Anti-patterns**:
  - Do NOT create new wikis automatically. Propose to `index.md ## Proposed`.
  - Do NOT overwrite existing transcript files. Skip if filename collides.
  - Do NOT modify or delete Granola originals.
  - Do NOT use em dashes anywhere. Hyphen with spaces.
  - Do NOT pull from Things 3.
  - Do NOT use dropped tags: `#non-conformity`, `#frontier-tech`/`#tech-frontier`, `#grand-vision`, `#abruptness`, `#empathy`, `#conviviality`, `#zero-degree` (use `#artist-present` instead).
  - Do NOT pattern-match merges. One source touching three wikis is normal; merging two wikis because they look similar is a lint-pass decision, not a sync-pass decision.
- **Tools required**: Filesystem, Granola MCP (`list_meetings`, `get_meeting_transcript`, `list_meeting_folders`).
- **Output destinations**:
  - `A1. Learn/0. raw/transcripts/<YYYY-MM-DD - <folder> - <title>.md` (new files)
  - `A1. Learn/1. Wikis/<tag>.md` (appended `## Source notes`, updated frontmatter)
  - `A1. Learn/index.md ## Proposed tags`, `## Recent activity`
  - `A1. Learn/log.md` (append run entry)
  - `A1. Learn/0. raw/.sync_state.json` (rewrite)
  - Chat summary

---

## Coverage summary

All 18 tasks found and extracted from `/Users/halim/Documents/Claude/Scheduled/`. Each task has its own `SKILL.md` file - no missing tasks, no need to fall back to alternative sources (Claude Code Scheduled Tasks settings, command prompts, etc.).

Cross-checked vs the user's enumerated list:

1. inbox-hourly-process - FOUND
2. daily-sync - FOUND
3. learn-briefing (weekday 6:05) - FOUND
4. share-briefing (weekday 6:06) / share-p0-morning-briefing - FOUND as `share-briefing`
5. apply-briefing (weekday 6:07) / daily-apply-submit-briefing - FOUND as `apply-briefing`
6. network-briefing / meet-briefing (weekday 6:08) - FOUND as `network-briefing` (combines what was meet-briefing - see Gmail draft floor + 2/2/1/1 slate)
7. admin-briefing (daily 6:09) - FOUND
8. make-briefing (weekday 6:10) - FOUND
9. earn-briefing (daily 6:10) - FOUND
10. write-briefing (weekday 6:11) - FOUND
11. invisible-briefing (daily 6:16) - FOUND
12. health-briefing (Monday 6:05) / weekly-health-briefing - FOUND as `health-briefing`
13. wealth-briefing (Monday 6:01) / monday-weekly-priorities-briefing - FOUND as `wealth-briefing`
14. health-protocol-monday - FOUND
15. strategy-briefing (Sunday eve) - FOUND (actually fires daily 7am per SKILL.md, runs after area briefings; the "Sunday eve" framing in the PRD predates the migration)
16. outings-briefing (Monday 4am) - FOUND
17. outings-briefing-thursday - FOUND
18. sync-raw-weekly (Sunday 8pm) - FOUND

No alternative-source fallback was needed for any task.
