# Hmart Kanban - Design System

In-repo distillation of the brand. Canonical source: `~/Documents/second-brain/A2. Make/Hmart Design System.md`. Operative values live in `tokens.css` + `tailwind.config.ts`; this doc is the rulebook. Consult before writing any UI.

## Core principle

**Hierarchy through opacity, not color or chrome.** White is the only background. There are no shadows, no rounded panels, no gradients, no accent washes. Depth and emphasis come from black-alpha opacity and a single functional accent at a time.

## Neutral palette (black over white)

| Token      | Value             | Use                                    |
| ---------- | ----------------- | -------------------------------------- |
| `--sl-900` | `#000000`         | hardest contrast, rare                 |
| `--sl-800` | `rgba(0,0,0,.85)` | primary text                           |
| `--sl-700` | `rgba(0,0,0,.75)` | tertiary borders, chip text            |
| `--sl-600` | `rgba(0,0,0,.60)` | secondary text                         |
| `--sl-500` | `rgba(0,0,0,.50)` | muted/nav text, meta                   |
| `--sl-400` | `rgba(0,0,0,.30)` | hint text                              |
| `--sl-300` | `rgba(0,0,0,.18)` | strong borders                         |
| `--sl-200` | `rgba(0,0,0,.12)` | hairline borders (the default divider) |
| `--sl-100` | `rgba(0,0,0,.04)` | hover bg, chips                        |
| `--sl-50`  | `#ffffff`         | page ground                            |

Five steps of text opacity (.85 / .70 / .60 / .50 / .40 conceptually) do all the work. Don't introduce tinted greys.

## Functional accents (never as backgrounds)

Applied only at the functional moment - a pill fill, a 2px rail, a dot, a focus ring, a checkmark. Never a page wash.

| Accent                | Hex                           | Meaning                           |
| --------------------- | ----------------------------- | --------------------------------- |
| carnation (magenta)   | `--acc-carnation #f6009b`     | P0 / active nav rail / focus ring |
| hard (cyan)           | `--acc-hard #2aa4dd`          | P1                                |
| reverse (purple)      | `--acc-reverse #8b5cf6`       | P2                                |
| reinforcement (green) | `--acc-reinforcement #02f700` | done / completed checks           |
| versus (yellow)       | `--acc-versus #fee005`        | deadline urgency                  |

For text on white, use the AA-darkened `*-text` variants (e.g. `--acc-carnation-text`).

## Typography

- Body / UI: Space Grotesk (`font-body`). Lowercase voice throughout.
- Mono captions / meta / labels: JetBrains Mono, uppercase, `letter-spacing: .06em`, sizes 0.5625-0.6875rem.
- Display (distressed humanist, e.g. VT323): at most once per page.
- Type scale: nav 13px, base 14px, caption 12px, meta 11px, section 20px.

## Spacing

8-step rem scale `--s-1..--s-8` (2px, 4px, 8px, 12px, 16px, 24px, 32px, 48px). Use the tokens, never arbitrary px.

## Borders & shape

- One hairline weight: `1px solid var(--sl-200)`.
- Tight corners only: 2px on pills, 0 on cards/panels. No big radius.
- **One divider per boundary.** Never stack a section border-top against a row border-bottom. Pattern: hairline above a group label, drop the first group's top rule, drop the last row's bottom rule.

## Interaction moves

- Hover: opacity/color shift only (to `--sl-900`), never layout-shifting scale transforms.
- Active/selected: opacity collapse + the single functional accent (e.g. carnation left-rail on active nav).
- Focus: visible ring `2px solid var(--acc-carnation)`, `outline-offset: 1px`. Excluded on `.d-row` (drag handles).
- Transitions: 120-200ms ease. Respect `prefers-reduced-motion`.

## Anti-patterns (rejected)

Shadows. Rounded corners beyond 2px. Gradients. Accent background washes. Em dashes (use " - "). Emojis as icons (SVG only). Marketing puff. Title Case in UI (lowercase).

## Nav specifics

- Primary nav (today / inbox / anytime / upcoming): no dot glyphs. Idle = `--sl-500` label. Active = full-opacity label + 2px carnation left rail.
- Areas list: tight rows (2px margins) so collapsed areas don't gap. Mono uppercase area labels at `--sl-500`. A single "collapse all / expand all" control under an "areas" label bar.
