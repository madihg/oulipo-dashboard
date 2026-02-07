[PRD]
# PRD: Oulipo Dashboard — Gallery (v0)

## Overview
V0 of the Oulipo Dashboard, focused on the Gallery section. The dashboard is a password-protected Next.js app for Halim Madi's creative practice. This version ships the app shell with side panel navigation (all three sections visible: Studio, Gallery, Market) but only implements the Gallery tools: Content Publisher (Substack + IG carousel), Update Events, and Deadline Calendar. Studio and Market sections show placeholder states.

## Goals
- Ship a functional dashboard shell with password auth and navigation
- Implement all four Gallery tools end-to-end
- Reduce friction for publishing to Substack and Instagram
- Keep oulipo.xyz events updated without manual HTML editing
- Track application deadlines in Google Calendar
- Follow oulipo brand identity exactly (invoke `/oulipo-brand` for all UI work)

## Quality Gates

These commands must pass for every user story:
- `npm run build` — successful production build
- `npm run typecheck` — zero type errors

For UI stories, also include:
- Visual verification in browser (desktop + mobile viewports)
- Design must follow oulipo brand rules (invoke `/oulipo-brand`): vanilla CSS, opacity system, no shadows/rounded corners/gradients, Standard/Terminal Grotesque/Diatype fonts, grid system

## User Stories

### US-001: Project scaffolding and password protection
**Description:** As Halim, I want a password-protected Next.js app so that only I can access my tools.

**Acceptance Criteria:**
- [ ] Next.js 14 app initialized in `oulipo-dashboard/` with App Router
- [ ] Single shared password stored in env var (`DASHBOARD_PASSWORD`)
- [ ] Login page with password input, session persisted via HTTP-only cookie
- [ ] Unauthenticated requests redirect to `/login`
- [ ] Middleware checks auth cookie on all routes except `/login`
- [ ] CSS follows oulipo brand identity — vanilla CSS only, no Tailwind/Bootstrap
- [ ] Fonts loaded from type.cargo.site: Standard, Terminal Grotesque, Diatype
- [ ] Opacity system: black at 85%/70%/60%/50%/40% — no gray hex values
- [ ] No shadows, no rounded corners, no gradients
- [ ] Hover states use opacity 0.7, transitions 0.3s ease
- [ ] App loads in under 1 second — minimal client-side JS

### US-002: Side panel navigation
**Description:** As Halim, I want a navigation panel with three sections so I can switch between tools.

**Acceptance Criteria:**
- [ ] Desktop: side panel on the right, always visible
- [ ] Mobile (< 600px): bottom tab bar with three tabs
- [ ] Three sections: Studio, Gallery, Market
- [ ] Each section expands to show its apps
- [ ] Studio contains: Context Scan (shows "Coming soon" placeholder)
- [ ] Gallery contains: Content Publisher, Update Events, Deadline Calendar
- [ ] Market contains: CRM, Outreach Agent (shows "Coming soon" placeholder)
- [ ] Active app highlighted in panel
- [ ] Navigation is instant — no loading spinners
- [ ] Panel follows oulipo grid system: clean layout, 2rem gaps
- [ ] Default view on login: Gallery > Content Publisher

### US-003: Content Publisher — Substack draft generator
**Description:** As Halim, I want to paste a piece of writing and generate a Substack-ready draft so I can publish faster.

**Acceptance Criteria:**
- [ ] Text input area that accepts pasted text (textarea, full-width)
- [ ] Optional: paste a Google Doc link to fetch content (requires Google OAuth — see US-008)
- [ ] "Generate draft" button triggers Claude API call
- [ ] Claude API transforms text into Substack-formatted copy: title, subtitle, body with markdown
- [ ] Output displayed in an editable preview area below the input
- [ ] Iterative editing: text input below preview to request changes ("make intro shorter", "add section about X")
- [ ] Each edit request sends the current draft + instruction to Claude API
- [ ] "Copy to clipboard" button copies the final markdown output
- [ ] Handles: essays, workshop descriptions, talk summaries, art piece write-ups
- [ ] Claude API responses stream for perceived speed
- [ ] Environment variable: `ANTHROPIC_API_KEY`

### US-004: Content Publisher — Instagram carousel generator
**Description:** As Halim, I want to upload photos and a long text, and get back an IG carousel with text overlaid on photos plus a separate caption.

**Acceptance Criteria:**
- [ ] Photo upload area accepts multiple images (drag-and-drop + file picker)
- [ ] Text input area for the long-form source text
- [ ] "Generate carousel" button triggers Claude API
- [ ] Claude API generates: (a) short overlay text per slide, distributed across the number of photos, and (b) a separate IG caption
- [ ] Carousel preview: all slides shown side-by-side in a horizontal scrollable strip
- [ ] Each slide shows the uploaded photo with text overlaid
- [ ] Carousel format: 5:4 aspect ratio (1080x1350px)
- [ ] Text overlay is editable per slide — click to edit directly on the preview
- [ ] Text position adjustable per slide (drag to reposition)
- [ ] Text size adjustable per slide (resize handle or controls)
- [ ] Font selector for overlay text (font options to be provided later, default to Diatype)
- [ ] Can reorder slides (drag), remove slides, or add a slide with another photo
- [ ] IG caption displayed below the carousel, editable inline
- [ ] Can request caption edits via text input ("shorter", "add hashtags")
- [ ] "Export" button generates PNGs server-side (Sharp or node-canvas) and downloads as ZIP
- [ ] "Copy caption" button copies caption to clipboard
- [ ] Preview rendered with Canvas API in browser, export is server-side for pixel-perfect output
- [ ] Claude API responses stream for perceived speed

### US-005: Update Events
**Description:** As Halim, I want to paste event info and have the dashboard update my website's upcoming page and CV automatically.

**Acceptance Criteria:**
- [ ] Text input where I paste event info (link, location, freeform text)
- [ ] "Parse event" button sends text to Claude API for extraction
- [ ] Claude API extracts: organization, title, description, type, location, date, link
- [ ] Types are: `workshop`, `work`, `keynote`
- [ ] If any field is ambiguous, shows a confirmation form with pre-filled fields I can edit
- [ ] "Save event" button writes to three locations:
  - `events.json` at `/Users/halim/Documents/oulipo/events.json`
  - Inline `const EVENTS` in `upcoming/index.html`
  - Inline `const EVENTS` in `cv/index.html`
- [ ] Event inserted in chronological order (by date)
- [ ] Uses proper Unicode characters for arrows and dashes
- [ ] Shows confirmation with the formatted event entry after save
- [ ] Previous events listed below the form for reference (read from events.json)

### US-006: Deadline Calendar
**Description:** As Halim, I want to paste a deadline link and have it added to my Google Calendar so I can track application deadlines.

**Acceptance Criteria:**
- [ ] Text input where I paste a link or describe a deadline
- [ ] "Parse deadline" button sends text to Claude API for extraction
- [ ] Claude API extracts: deadline name, date, organization, link
- [ ] If ambiguous, shows confirmation form with pre-filled editable fields
- [ ] "Add to calendar" button creates event in Google Calendar via Calendar API
- [ ] Event created in a dedicated "Application Deadlines" calendar
- [ ] If "Application Deadlines" calendar doesn't exist, creates it automatically
- [ ] Calendar event includes the link in the description
- [ ] Shows confirmation with what was added and the date
- [ ] Upcoming deadlines listed below the form (fetched from Google Calendar)

### US-007: Google OAuth setup
**Description:** As a developer, I want Google OAuth so the Deadline Calendar can access Google Calendar and the Content Publisher can optionally fetch Google Docs.

**Acceptance Criteria:**
- [ ] OAuth consent screen configured with scopes: Drive (read-only), Calendar (read + write)
- [ ] OAuth flow triggered on first use of any Google-dependent feature
- [ ] "Connect Google" button shown inline where needed (not a separate settings page)
- [ ] Tokens stored server-side (encrypted, or via secure HTTP-only cookie)
- [ ] Token refresh handled automatically
- [ ] If token expires/revoked, re-prompts for login without losing form context
- [ ] Environment variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- [ ] Gmail scope NOT included in v0 (that's for Market/Outreach, future work)

### US-008: Claude API integration layer
**Description:** As a developer, I want a shared Claude API integration so all Gallery tools use streaming responses consistently.

**Acceptance Criteria:**
- [ ] Server-side API route that proxies Claude API calls (`/api/claude`)
- [ ] Supports streaming responses (Server-Sent Events)
- [ ] Each Gallery tool sends a system prompt + user content, receives streamed response
- [ ] System prompts per tool:
  - Substack: "Format this text as a Substack post with title, subtitle, and markdown body"
  - IG carousel: "Generate short overlay text per slide and a separate IG caption"
  - Update Events: "Extract event fields: organization, title, description, type, location, date, link"
  - Deadline Calendar: "Extract deadline fields: name, date, organization, link"
- [ ] Error handling: shows user-friendly message if API fails
- [ ] Rate limiting awareness: if 429, shows "Try again in a moment"
- [ ] Environment variable: `ANTHROPIC_API_KEY`
- [ ] Uses latest Claude model (claude-sonnet-4-5-20250929 or newer at build time)

## Functional Requirements
- FR-1: All pages load in under 1 second on a fast connection
- FR-2: Dashboard is fully functional on mobile with bottom tab navigation
- FR-3: CSS follows oulipo brand identity exactly — vanilla CSS, no frameworks
- FR-4: Claude API calls stream responses for perceived speed
- FR-5: Event updates write directly to files in the oulipo repo on disk
- FR-6: IG carousel exports at 1080x1350px (5:4) as PNG
- FR-7: Google OAuth covers Drive (read) and Calendar (read/write) in a single flow
- FR-8: Studio and Market sections show clean "Coming soon" placeholders
- FR-9: All text inputs accept paste (no file upload required for text content)
- FR-10: Dashboard must run locally (for file system access to oulipo repo)

## Non-Goals (Out of Scope for v0)
- Studio section features (Context Scan, Notion integration, Kindle import)
- Market section features (CRM, Outreach Agent)
- Gmail API integration (no inbox scan, no draft creation in v0)
- Supabase database (no CRM data in v0 — only Google Calendar + local files)
- Multi-user support (single-user dashboard)
- Direct Instagram/Substack API posting (copy-paste workflow)
- Deployment to Vercel (runs locally for file system access)
- Automated email sending

## Technical Considerations
- Next.js 14 App Router, standalone app in `oulipo-dashboard/`
- Vanilla CSS — invoke `/oulipo-brand` for design system rules
- Claude API (Anthropic SDK) for all LLM features, streaming via Server-Sent Events
- Google OAuth with combined scopes (Drive read + Calendar read/write)
- Canvas API for browser-side carousel preview
- Sharp or node-canvas for server-side PNG export (carousel)
- File system access: dashboard reads/writes `events.json`, `upcoming/index.html`, `cv/index.html` in the parent oulipo directory
- Password auth via middleware + HTTP-only cookie (no user accounts, no database)
- No Supabase needed for v0 — all persistence is file system + Google Calendar

## Success Metrics
- Dashboard loads in under 1 second
- Substack draft generation takes under 10 seconds
- IG carousel export produces correct 5:4 PNGs with text overlays
- Event updates reflect in events.json, upcoming/index.html, and cv/index.html immediately
- Deadline appears in Google Calendar within 3 seconds of confirmation
- All features work on mobile (bottom tab nav, responsive layouts)
- `npm run build && npm run typecheck` pass with zero errors
- All UI matches oulipo brand identity (verified via `/oulipo-brand` review)

## Open Questions
- What font should be used for IG carousel text overlays? (defaulting to Diatype for now)
- For event updates: should the dashboard also commit + push to git after writing files?
- Should deadlines have reminders in Google Calendar (e.g. 1 week before, 1 day before)?
- Should the Substack draft generator support different content types with different templates (essay vs. workshop recap vs. art piece)?
[/PRD]
