[PRD]
# PRD: Oulipo Dashboard — Inbox Agent (v0)

## Overview
An automated email drafting system for Halim's Gmail inbox. A Modal cron job runs every morning, fetches unanswered emails (starred first), gathers deep context (full thread, sender history, company history, personal memory), uses Claude to draft responses, and creates Gmail drafts automatically. The dashboard's Inbox Agent tab is a control panel for tuning the system prompt, editing memory, viewing run history, and triggering on-demand runs. Drafts are never sent automatically — Halim reviews and sends from Gmail.

## Goals
- Automate morning email triage: wake up to drafted responses for every unanswered email
- Produce high-quality drafts by gathering deep context before drafting (thread, sender, company, memory)
- Give Halim a control panel to tune drafting quality over time (system prompt, memory, rules)
- Never send automatically — always create Gmail drafts for manual review
- Prioritize starred emails (processed first in every run)

## Quality Gates

These commands must pass for every user story:
- `npm run build` — successful production build
- `npm run typecheck` — zero type errors

For UI stories, also include:
- Visual verification in browser (desktop + mobile viewports)
- Design must follow oulipo brand rules: vanilla CSS, opacity system, no shadows/rounded corners/gradients, Standard/Terminal Grotesque/Diatype fonts, grid system

## User Stories

### US-001: Gmail OAuth scope expansion
**Description:** As a developer, I want to expand the existing Google OAuth flow to include Gmail scopes so the automation can read emails and create drafts.

**Acceptance Criteria:**
- [ ] Add `gmail.readonly` scope to `lib/google-auth.ts` (read emails and threads)
- [ ] Add `gmail.compose` scope to `lib/google-auth.ts` (create drafts)
- [ ] Do NOT add `gmail.send` — the system must never auto-send
- [ ] Existing Drive and Calendar scopes remain unchanged
- [ ] If user has already authenticated, re-prompt for the expanded scopes on next Google-dependent action
- [ ] Tokens stored in Upstash Redis (existing pattern)

### US-002: Modal cron setup
**Description:** As a developer, I want a Modal Python app that runs on a daily cron schedule so the inbox agent operates autonomously.

**Acceptance Criteria:**
- [ ] `modal/inbox_agent.py` — Modal app with `@app.function(schedule=modal.Cron("0 7 * * *"))` (7am UTC daily)
- [ ] `modal/requirements.txt` — deps: `google-api-python-client`, `google-auth`, `anthropic`, `upstash-redis`
- [ ] On each run, reads config from Upstash Redis: system prompt, memory, settings
- [ ] On each run, reads Google OAuth tokens from Upstash Redis (same keys the dashboard uses)
- [ ] Writes structured run log to Redis on completion
- [ ] Handles errors gracefully — logs failures per-email, continues processing remaining emails
- [ ] Environment variables via Modal secrets: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ANTHROPIC_API_KEY`
- [ ] Deployable via `modal deploy modal/inbox_agent.py`

### US-003: Email fetch and relevance filtering
**Description:** As the automation, I want to fetch unanswered emails and filter out spam/transactional so I only draft responses for real conversations.

**Acceptance Criteria:**
- [ ] Fetch emails from Gmail using `messages.list` with query: `is:inbox -is:draft -label:sent -category:promotions -category:social -category:updates`
- [ ] Only fetch emails received after `lastRunTimestamp` (stored in Redis, updated after each run)
- [ ] For each email, extract: messageId, threadId, sender (name + email), subject, snippet, date, isStarred
- [ ] Send batch of email metadata (subject + sender + snippet) to Claude for relevance classification
- [ ] Claude classifies each as: `draft` (needs a response), `skip` (spam, transactional, newsletter, no-reply)
- [ ] Only emails classified as `draft` proceed to context gathering
- [ ] Starred emails sorted to front of the processing queue

### US-004: Context gathering pipeline
**Description:** As the automation, I want to gather deep context for each email so Claude can draft informed, relationship-aware responses.

**Acceptance Criteria:**
- [ ] **Thread context**: Fetch full thread via `threads.get(threadId)`, extract all messages in order
- [ ] **Sender history**: Search Gmail for `from:{sender_email}` limited to last 10 emails, extract subjects + snippets + dates
- [ ] **Company context**: Extract domain from sender email. If NOT a generic domain (gmail.com, yahoo.com, hotmail.com, outlook.com, icloud.com, protonmail.com, aol.com, me.com), search `from:@{domain}` limited to last 10 emails
- [ ] **Personal memory**: Load memory content from Redis key `inbox-agent:memory`
- [ ] Thread, sender, and company lookups run in parallel for speed
- [ ] Assemble all context into a structured prompt with clear sections: `[THREAD HISTORY]`, `[SENDER HISTORY]`, `[COMPANY HISTORY]`, `[ABOUT ME]`, `[EMAIL TO RESPOND TO]`

### US-005: AI draft generation
**Description:** As the automation, I want Claude to draft a response using all gathered context so the draft sounds natural and informed.

**Acceptance Criteria:**
- [ ] System prompt loaded from Redis key `inbox-agent:system-prompt`
- [ ] If no custom system prompt exists, use a sensible default (professional, warm, concise)
- [ ] Claude receives: system prompt + assembled context (from US-004) + the email to respond to
- [ ] Draft should match Halim's tone (as defined in memory)
- [ ] Draft should reference relevant context when appropriate (e.g., "following up on our conversation about X")
- [ ] Draft should NOT hallucinate facts not present in the context
- [ ] Uses Claude claude-sonnet-4-5-20250929 or newer
- [ ] Starred emails processed first

### US-006: Gmail draft creation
**Description:** As the automation, I want to create Gmail drafts that appear as replies in the correct thread so Halim can review and send from Gmail.

**Acceptance Criteria:**
- [ ] Create draft via Gmail API `drafts.create` with `threadId` set to the original thread
- [ ] Set `In-Reply-To` and `References` headers to the original message's `Message-ID`
- [ ] Set `To` to the original sender's email
- [ ] Set `Subject` to `Re: {original subject}` (preserving any existing Re: prefix)
- [ ] Draft body is the Claude-generated response (plain text)
- [ ] Draft appears in Gmail's Drafts folder, threaded with the original conversation
- [ ] Never calls `messages.send` — drafts only

### US-007: Run logging
**Description:** As the automation, I want to log every run's details to Redis so the dashboard can display run history.

**Acceptance Criteria:**
- [ ] Each run writes a JSON log to Redis key `inbox-agent:runs:{timestamp}`
- [ ] Log structure: `{ timestamp, emailsFetched, emailsFiltered, draftsCreated, errors, details: [{ sender, subject, status, draftSnippet }] }`
- [ ] Keep last 30 run logs (prune older entries)
- [ ] Update `inbox-agent:lastRunTimestamp` after successful completion
- [ ] If run fails entirely, log the error with `status: "failed"`

### US-008: Dashboard — Inbox Agent placeholder and navigation
**Description:** As Halim, I want an Inbox Agent tab under Market (above CRM) so I can access the control panel.

**Acceptance Criteria:**
- [ ] "Inbox Agent" added to Market section in `components/navigation/Navigation.tsx`, first item (above CRM)
- [ ] Route: `/market/inbox-agent`
- [ ] Page at `app/(dashboard)/market/inbox-agent/page.tsx`
- [ ] Placeholder state with title, description of the feature, and "Coming soon" for the control panel sections
- [ ] Description: "Automated email drafting — drafts responses to your Gmail every morning using AI context"
- [ ] Follows oulipo brand identity (Terminal Grotesque heading, Standard body, opacity system)

### US-009: Dashboard — system prompt editor
**Description:** As Halim, I want to edit the system prompt used by Claude for drafting so I can improve draft quality over time.

**Acceptance Criteria:**
- [ ] Textarea showing the current system prompt (loaded from Redis via API route)
- [ ] "Save" button writes the updated prompt to Redis key `inbox-agent:system-prompt`
- [ ] Changes take effect on the next run (no restart needed)
- [ ] If no custom prompt exists, show the default prompt (editable)
- [ ] Character count shown below textarea
- [ ] API route: `POST /api/inbox-agent/config` to read/write system prompt

### US-010: Dashboard — memory editor
**Description:** As Halim, I want to edit my personal memory/context from the dashboard so Claude drafts better responses as I refine it.

**Acceptance Criteria:**
- [ ] Textarea showing the current memory content (loaded from Redis via API route)
- [ ] Initialized from `lib/halim-context.md` template if no content exists in Redis
- [ ] "Save" button writes to Redis key `inbox-agent:memory`
- [ ] Sections are visible as markdown headings in the textarea
- [ ] Changes take effect on the next run
- [ ] API route: `POST /api/inbox-agent/memory` to read/write memory

### US-011: Dashboard — run history
**Description:** As Halim, I want to see what the automation did each morning so I can verify it's working and spot issues.

**Acceptance Criteria:**
- [ ] List of past runs showing: date/time, emails processed, drafts created, error count
- [ ] Click to expand a run and see per-email details: sender, subject, status (drafted/skipped/error), draft snippet
- [ ] Most recent run at the top
- [ ] Auto-refreshes or manual refresh button
- [ ] API route: `GET /api/inbox-agent/runs` to fetch run logs from Redis
- [ ] Shows empty state if no runs yet: "No runs yet. The agent runs daily at 7am UTC."

### US-012: Dashboard — settings and manual trigger
**Description:** As Halim, I want to configure the automation schedule and trigger runs manually so I have full control.

**Acceptance Criteria:**
- [ ] Settings panel with: schedule display (7am UTC daily), max emails per run (default: 50), starred-only mode toggle
- [ ] Settings saved to Redis key `inbox-agent:settings`
- [ ] "Run Now" button triggers the Modal function on-demand via Modal webhook
- [ ] Button shows loading state while run is in progress
- [ ] After manual run completes, run history refreshes to show results
- [ ] API route: `POST /api/inbox-agent/trigger` to invoke Modal webhook

## Functional Requirements
- FR-1: Automation runs fully autonomously — no dashboard or local machine required
- FR-2: Gmail drafts are NEVER sent automatically — always manual review from Gmail
- FR-3: Starred emails are always processed first
- FR-4: Context pipeline gathers thread + sender + company history before drafting
- FR-5: All config (system prompt, memory, settings) lives in Upstash Redis
- FR-6: Run logs persist in Redis for dashboard visibility (last 30 runs)
- FR-7: Dashboard control panel follows oulipo brand identity
- FR-8: Modal function handles errors per-email — one failure doesn't stop the whole run

## Non-Goals (Out of Scope for v0)
- Sending emails automatically (always drafts only)
- Real-time email monitoring (batch processing on schedule is sufficient)
- Email thread UI in the dashboard (Gmail is the email client, dashboard is controls only)
- CRM integration (contacts database is a separate feature)
- Attachment handling in drafts
- Multiple Gmail account support
- Draft quality feedback loop in the UI (thumbs up/down — future enhancement)

## Technical Considerations
- Modal for serverless Python cron — deployed via `modal deploy`, runs on Modal's infrastructure
- Gmail API via `google-api-python-client` (Python) in Modal, `googleapis` (Node.js) in dashboard for OAuth
- Claude API via `anthropic` Python SDK in Modal
- Upstash Redis as the shared state layer between Modal and the dashboard
- Google OAuth tokens already stored in Redis by the existing dashboard auth flow
- Dashboard API routes are thin — just read/write Redis keys
- Modal secrets for API keys (ANTHROPIC_API_KEY, Redis credentials)
- Company domain detection skips: gmail.com, yahoo.com, hotmail.com, outlook.com, icloud.com, protonmail.com, aol.com, me.com, live.com, msn.com

## Success Metrics
- Automation runs reliably every morning with zero manual intervention
- Drafts are contextually appropriate (reference thread history, match tone)
- Starred emails always have drafts waiting by morning
- System prompt and memory edits visibly improve draft quality over time
- Run history shows clear logs with per-email detail
- `npm run build && npm run typecheck` pass with zero errors

## Open Questions
- What time zone should the 7am cron be in? (defaulting to UTC, configurable later)
- Should the automation skip weekends or run every day?
- Should there be a max token budget per run to control Claude API costs?
- Should the company domain search also look at emails TO that domain (not just FROM)?
- How should the automation handle emails in languages other than English?
[/PRD]
