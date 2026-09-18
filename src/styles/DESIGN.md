# Hmart Kanban - Design System

In-repo distillation of the brand, ported to the **halimmadi.com** identity. Operative values live in `tokens.css` + `tailwind.config.ts`; this doc is the rulebook. Consult before writing any UI.

## Core principle

**Warm paper, neutral ink, one cobalt accent.** The background is white / warm off-white; text is a black-alpha opacity hierarchy; borders are warm hairlines. Emphasis comes from opacity plus a single functional accent (cobalt) at a time. No shadows, no rounded panels beyond 2px, no gradients, no accent washes.

## Neutral palette

Fills and borders go **warm**; text stays **black-alpha** (neutral ink) - exactly like halimmadi.com.

| Token        | Value              | Use                                  |
| ------------ | ------------------ | ------------------------------------ |
| `--paper`    | `#ffffff`          | base background                      |
| `--ground-2` | `#fbfaf7`          | warm off-white - subtle fills, hover |
| `--hair`     | `#e6e4de`          | warm hairline - the default divider  |
| `--ink`      | `#161617`          | near-black (`--sl-900`)              |
| `--ink-85`   | `rgba(0,0,0,.85)`  | primary text (`--sl-800`)            |
| `--ink-70`   | `rgba(0,0,0,.62)`  | hover / secondary                    |
| `--ink-50`   | `rgba(0,0,0,.50)`  | muted text, meta (`--sl-500`)        |
| `--ink-40`   | `rgba(0,0,0,.42)`  | hint text (`--sl-400`)               |
| `--ink-15`   | `rgba(0,0,0,.13)`  | faint lines                          |
| `--ink-08`   | `rgba(0,0,0,.055)` | faintest fill                        |

Legacy `--sl-*` names are preserved and repointed onto this palette so components inherit it. Prefer the semantic names on new surfaces.

## Functional accents (never as backgrounds)

Applied only at the functional moment - a pill fill, a 2px rail, a dot, a focus ring, a checkmark. Never a page wash. Primary accent is **cobalt**.

| Accent                           | Hex       | Meaning                                  |
| -------------------------------- | --------- | ---------------------------------------- |
| cobalt (`--acc-carnation`)       | `#1c39e8` | P0 / active nav / focus / submit         |
| gold (`--acc-hard`)              | `#e89b1b` | P1                                       |
| violet (`--acc-reverse`)         | `#6e4bd0` | P2                                       |
| viridian (`--acc-reinforcement`) | `#1e8e5a` | done / success                           |
| vermilion (`--acc-versus`)       | `#e5391c` | deadline urgency / delete / error        |
| teal (`--acc-ongoing`)           | `#0f766e` | ongoing (`~`) priority - continuous work |

For text on white, use the AA-darkened `*-text` variants (e.g. `--acc-carnation-text` = `#1430c0`). Semantic tokens `--success` / `--gold` / `--error` exist for status where the priority remap would scramble the hue.

## Typography

Real brand fonts, **self-hosted** in `public/fonts/` (from type.cargo.site), wired via `@font-face` in `tokens.css`.

- Body / UI: **Standard** (`--font-body`). Lowercase voice throughout.
- Headings: **Diatype Variable** (`--font-h`).
- Mono captions / meta / labels: **Diatype Mono Variable** (`--font-mono`) - the same variable file with the `"MONO" 1` axis (apply `font-variation-settings: "MONO" 1`, or use the `.font-mono` class). Uppercase, `letter-spacing: .06em`, 0.5625-0.6875rem.
- Display: **Terminal Grotesque** (`--font-display`) - at most once per page (the wordmark).
- Type scale (dense operator console): nav 13px, base 14px, caption 12px, meta 11px, section 20px.

## Spacing

8-step rem scale `--s-1..--s-8` (2, 4, 8, 12, 16, 24, 32, 48px). Use the tokens.

## Borders & shape

- One hairline weight: `1px solid var(--hair)`.
- Tight corners only: 2px on pills, 0 on cards/panels. No big radius.
- **One divider per boundary.** Never stack a section border-top against a row border-bottom.

## Interaction moves

- Hover: opacity/color shift only (to `--sl-900`) or a warm `--sl-100` bg, never layout-shifting scale transforms.
- Active/selected: cobalt - colored text + 2px left rail + faint `--cobalt-tint` background.
- Focus: visible ring `2px solid var(--acc-carnation)` (cobalt), `outline-offset: 1px`. Excluded on `.d-row`.
- Transitions: 120-200ms ease. Respect `prefers-reduced-motion`.

## Anti-patterns (rejected)

Shadows. Rounded corners beyond 2px. Gradients. Accent background washes. Em dashes (use " - "). Emojis as icons (SVG only). Marketing puff. Title Case in UI (lowercase).

## Nav specifics

- Primary nav: **solid** idle labels (`--sl-800`, not washed grey). Active = cobalt label + 2px cobalt left rail + faint cobalt-tint background.
- Areas list: tight rows; mono uppercase labels, solid idle, cobalt active. A discreet 6-dot grip (revealed on hover) drag-reorders areas.

## Decisions from the 2026-09 alignment to the master brand system v0.4

Source of truth for tokens and rules is `public.brand_system` (latest row) in
the oulipo_main Supabase project. This app is an instrument, so it keeps its
own dense scale, but it follows the master's laws.

- **Colour in a row means priority, and priority is a mark.** A level shows as
  a coloured dot beside a mono label (`.d-pri` + `.dot`), never as a fill. P0
  used to be a solid cobalt pill on every P0 row, which spent the one cobalt
  note per surface many times over. Contexts carry no colour at all: every
  hue they had was already a priority or status token. Area chips are neutral;
  the user's emoji is the mark. Project names are neutral; the dot carries the
  hue.
- **Cobalt is the note, not a tribe.** On a list surface the only cobalt is
  the active state: the selected row's rail and tint, the pressed nav item, the
  focus ring, the palette's caret and active row.
- **One chip family.** `.chip` in main.css: mono, uppercase, hairline border,
  neutral at rest; `.chip-on` and `[aria-pressed="true"]` are the ink
  inversion; `.chip-primary` is the ink-filled primary action; `.chip-quiet`
  and `.chip-danger` are the two modifiers. Priority buttons, context toggles,
  filter chips, toolbar tools and settings buttons all use it. `.dot` is the
  one place a tribe or level colour lives.
- **Motion tokens** are the master's: `--dur-fast` 120ms (hover, micro),
  `--dur-base` 200ms (drawers, reveals), `--dur-slow` 320ms, easing
  `--ease-out`. No literal durations in components.
- **Hairlines:** `--hair` for rules and dividers, `--metal` for frames and
  hovered chip borders. Never a raw rgba() on a border.
- **Type:** body leading 1.45; mono chrome may sit at 1.14. `var(--font-mono)`
  everywhere, never the literal stack. Standard ships 400 and 700 only, so a
  500 weight is a no-op.
- **Machine mode:** the command palette is the master's palette: a dimmed
  white room, a mono input with a cobalt caret, ink mono rows, the active row
  on the cobalt rail. Open work ranks above done work.
- **Anything that removes work from view offers undo**: delete, complete,
  bulk complete, dropping a capture.

## Decisions from the 2026-09-07 finish (the second pass on the master brand system)

- **One ramp.** `--fs-caption` 10, `--fs-label` 11, `--fs-small` 12, `--fs-row` 13, `--fs-body` 14, `--fs-lede` 16, `--fs-sub` 18, `--fs-h` 20, `--fs-input` 16px for fields. No literal `font-size` anywhere; `tests/designTokens.test.ts` refuses one. The `--type-size-*` names alias the ramp.
- **No slate.** Every `--sl-*` use became `--ink*`, `--hair`, `--metal`, `--ground-2` or `--paper`. The definitions stay in `tokens.css` only until the last branch that uses them merges.
- **The caption is a class.** `.cap` (mono, MONO axis, caption size, 1.14 leading, uppercase, .06em, ink-50) and `.cap-ink` (ink-70). Components no longer re-type the recipe; the group header is `cap d-list-label` with weight and label size as its only overrides.
- **One chevron.** `.chev` / `.chev-open`: a 7px box with two 1.5px borders, rotated. Every disclosure is a `type="button"` with `aria-expanded` and an `aria-hidden` chevron. Popover triggers (`aria-haspopup`) carry no chevron.
- **One checkbox.** 14px, 2px radius, 1.5px metal ring, ink on hover, ink fill with a drawn white check when done; a 44px hit area on coarse pointers through `::before`. Complete and select share it.
- **Focus is the master ring.** `*:focus-visible` 3px cobalt at 2px offset; rows and segmented controls keep it inside with a negative offset; bordered fields add a cobalt-tint halo. `outline: none` is gone and `tests/controls.test.ts` refuses it.
- **Empty states act.** One lowercase line and one chip: pull from anytime, clear filter, add one, go to today. The `.d-empty` rule lives in `main.css`.
- **The status bar is silent when things are fine.** Rows and groups on the left; on the right only `offline`, `n unsaved`, `saving n` or `reconnecting` (after a real drop, not while joining), in a `role="status"` region. One realtime channel for the whole app (`useSyncStatus`), not one per view. "last sync" is gone because it was never true.
- **Words, not glyphs.** `add repeat`, `add deadline`, `cmd k` / `ctrl k` from `src/lib/platform.ts`, `unknown` for a count that has not arrived, an SVG cross for remove. Every floating frame is 1px metal, the palette included.
- **Icons are 1.5px monolines** on ink or metal: the checkbox tick, the remove cross, the add plus, the system map arrows.
- **Gates run from a mirror.** Reads under `~/Documents` go through iCloud's file provider; jsdom and vue-tsc look hung there. `rsync` to the scratchpad, `pnpm install --offline`, Node 22 (`.nvmrc`).

## The open task (2026-09-16)

An open task is one framed window, the site's unit: a 1px `--metal` frame
with 2px radius, the row as its title bar, a `--hair` rule under the row, the
body inside. Nothing in the row moves or hides when it opens; the title turns
into a field where it stands (`.d-title-input`, same type, same position) and
the row carries a 2px cobalt rail as the one note that says "open". Close
lives in the bar's right corner, plus Escape and a click on the bar. The
editor renders no second title inline (`inline` prop) and no bottom close.

The facts about the task sit in the site's ledger (`.ed-ledger`): a 5.5em mono
label column, a value column, a hairline between rows, four rows: when (with
deadline and repeat inline), priority, context, filed (area and project).
Labels align, so the eye scans one column. Phones stack label over value.

The phone modal and the capture sheet keep their own title field and their
own "done" in the sheet header. The list keeps clearance under the floating
capture button so a panel's ledger never slides beneath it.

## Effort (2026-09-18)

Effort is how much of you a task takes: `S` minutes, `M` under an hour, `L`
half a day, `XL` a day or more. Four sizes on purpose: the only decision a
size supports is "does this fit right now", and finer scales invite
estimating instead of doing. One value per task, so it is a column
(`todos.effort`) like priority, not a tag like context.

- **Row.** An outlined mono mark, last in the row, against the fixed-width
  delete control. That position puts every size in one column down the list,
  and an unsized row spends no space. No colour: colour in a row is priority.
- **Editor.** Effort shares priority's ledger row (`priority [...] effort
  [s m l xl]`). Both answer "which one next", and a fifth row would cost
  notes their place for four letters. Pressing the pressed size clears it, so
  there is no "none" chip.
- **Finding small work.** Filter (second section, under priority, with
  `unsized` as a value so a backlog can be sized), sort "effort, smallest
  first" (unsized last), group by effort (empty sizes dropped), and the bulk
  bar sets or clears a size for a selection.

## The open bar on a phone (2026-09-18)

Under 600px the open row takes two lines. Line one is what you act on:
checkbox, the whole title, close, delete, aligned to the title's first line.
Line two is what describes it: priority, area with its name back, contexts,
tags, deadline, size. Visual order only (`order`); DOM and tab order are
unchanged. The open title is a wrapping field at every width, because a
closed row truncates and opening is the moment to read it whole. A pasted
line break is folded to a space on save.
