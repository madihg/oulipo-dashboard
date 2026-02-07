# Oulipo Dashboard

A password-protected, locally-run Next.js dashboard for Halim Madi's creative practice. V0 ships the full app shell with side panel navigation (Studio, Gallery, Market) but only implements the Gallery section tools.

## Gallery Tools (V0)

- **Content Publisher** - Substack draft generator + Instagram carousel generator
- **Update Events** - Parse and save events to oulipo portfolio (events.json + HTML files)
- **Deadline Calendar** - Parse deadlines and add to Google Calendar

## Tech Stack

- **Frontend**: Next.js 14 (App Router), vanilla CSS (no frameworks)
- **Styling**: Oulipo design system - opacity-based colors, no shadows/rounded corners/gradients
- **Fonts**: Standard, Terminal Grotesque, Diatype (from type.cargo.site)
- **APIs**: Anthropic Claude API (streaming via SSE), Google Calendar API, Google Drive API
- **Auth**: Single shared password via environment variable, HTTP-only cookie session

## Setup

### Prerequisites

- Node.js 18+
- Anthropic API key
- Google Cloud Console project with OAuth credentials (Calendar + Drive API enabled)
- Local oulipo repo at `/Users/halim/Documents/oulipo/`

### Installation

1. Clone this repository
2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```
3. Fill in your values in `.env.local`
4. Run the setup script:
   ```bash
   ./init.sh
   ```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DASHBOARD_PASSWORD` | Single shared password for login |
| `ANTHROPIC_API_KEY` | Claude API key for all LLM features |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `OULIPO_REPO_PATH` | Path to local oulipo repo (default: `/Users/halim/Documents/oulipo`) |

## Development

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Start production server
npm run typecheck # TypeScript type checking
```

## Project Structure

```
app/
  (auth)/login/          # Login page
  (dashboard)/           # Authenticated dashboard shell
    gallery/
      content-publisher/ # Substack + Instagram tools
      update-events/     # Event management
      deadline-calendar/ # Deadline tracking
    studio/
      context-scan/      # Coming soon
    market/
      crm/               # Coming soon
      outreach-agent/    # Coming soon
  api/
    auth/                # Login/logout endpoints
    claude/              # Claude API proxy (SSE streaming)
    events/              # Events CRUD (reads/writes events.json)
    carousel/export/     # PNG export with ZIP download
    google/              # OAuth flow
    calendar/deadlines/  # Google Calendar integration
    docs/fetch/          # Google Docs content fetch
    health/              # Health check endpoint
components/
  navigation/            # Side panel + bottom tab bar
lib/
  constants.ts           # App constants and system prompts
styles/
  globals.css            # Global styles + design system
  fonts.css              # Font face declarations
```

## Design System

- **Colors**: Black at opacity levels (85%/70%/60%/50%/40%) - no gray hex values
- **Typography**: Terminal Grotesque (headings), Standard (body), Diatype (UI)
- **Spacing**: 2rem grid gaps
- **Interactions**: Hover opacity 0.7, transitions 0.3s ease
- **Rules**: No shadows, no rounded corners, no gradients
