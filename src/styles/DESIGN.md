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

| Accent                           | Hex       | Meaning                           |
| -------------------------------- | --------- | --------------------------------- |
| cobalt (`--acc-carnation`)       | `#1c39e8` | P0 / active nav / focus / submit  |
| gold (`--acc-hard`)              | `#e89b1b` | P1                                |
| violet (`--acc-reverse`)         | `#6e4bd0` | P2                                |
| viridian (`--acc-reinforcement`) | `#1e8e5a` | done / success                    |
| vermilion (`--acc-versus`)       | `#e5391c` | deadline urgency / delete / error |

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
