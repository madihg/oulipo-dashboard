# hmart kanban

Personal task manager on the Things 3 model, augmented by Claude. Source of truth: Supabase Postgres. Web + iOS PWA. Inbox auto-routed by Claude. Offline inbox capture.

Replaces the 18 Cowork scheduled tasks with 10 continuous Edge Functions per `tasks/prd-hmart-kanban.md` (US-015). Brand follows `~/Documents/second-brain/A2. Make/Hmart Design System.md`.

## Quick start

```bash
cd ~/Documents/hmart/hmart-kanban
pnpm install
cp .env.example .env.local   # fill Supabase + Anthropic keys
pnpm dev                     # http://localhost:5173
```

## Scripts

| Command           | Purpose                                 |
| ----------------- | --------------------------------------- |
| `pnpm dev`        | Vite dev server, port 5173              |
| `pnpm build`      | Type-check then build PWA-ready `dist/` |
| `pnpm preview`    | Preview the built bundle                |
| `pnpm typecheck`  | `vue-tsc --noEmit`                      |
| `pnpm lint`       | ESLint                                  |
| `pnpm test`       | Vitest unit + integration               |
| `pnpm test:watch` | Vitest in watch mode                    |
| `pnpm e2e`        | Playwright                              |

## Layout

```
hmart-kanban/
  src/
    main.ts                 Vue app entry
    App.vue                 shell with router-view
    router.ts               vue-router routes (Today / Inbox / Anytime / Upcoming / Someday / Logbook / Area / Project)
    lib/
      contrast.ts           accessibleTextColor / accessibleUIColor (WCAG AA binary search)
      cursor.ts             dot cursor data-URI generator
    styles/
      tokens.css            design system CSS variables
      main.css              Tailwind base + design system layered components
    views/
      Today.vue
      Placeholder.vue       stub for routes not yet implemented
  tests/                    Vitest specs
  public/                   static assets (favicon + PWA icons)
  specs/
    pickers-source-spec.md  verbatim port spec for the 18 Cowork tasks
  tasks/
    prd-hmart-kanban.md     binding product spec
  tailwind.config.ts        design system tokens mirrored to Tailwind
  vite.config.ts            Vue + PWA plugin (Workbox)
  vitest.config.ts
  eslint.config.js
```

## Quality gates (per PRD)

All user stories must pass:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- UI stories: manual visual check against `~/Documents/second-brain/A2. Make/Hmart Design System.md`

## Conventions

- **No em dashes anywhere.** Use `-` with spaces.
- **No emojis as icons.** SVG only. The brand's only glyph is ↗.
- **Lower-case wordmark + chrome copy.** Title case is an anti-pattern.
- Tokens live in `src/styles/tokens.css`. Tailwind mirrors them. Don't add a color or spacing value without updating both.
- The five accents are functional moments only (chip fill, focus ring, border, button, cursor). Never as backgrounds or washes.
- Visible focus rings, always. Never `outline: none`.

## What lives where

- **Source-of-truth for spec** -> `tasks/prd-hmart-kanban.md`
- **Design system** -> `~/Documents/second-brain/A2. Make/Hmart Design System.md` (original `/Users/halim/Downloads/Hmart Design System.html`)
- **Cowork picker spec (lossless)** -> `specs/pickers-source-spec.md`
- **Plan history** -> `~/.claude/plans/plan-mode-let-s-say-shiny-bee.md` (informational; superseded by the PRD)
