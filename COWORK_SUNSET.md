# Cowork Sunset Checklist (US-022)

Once the per-area pickers (`area_picker` Edge Function, 10 cron schedules) and `tick_repeating` have run reliably for at least one week, disable the matching Cowork scheduled tasks one at a time. Disable, do not delete - rollback path matters.

For each task: verify the Hmart equivalent has produced equivalent output for 7 days, then flip the Cowork task off in `~/Library/Application Support/Claude/scheduled-tasks.json` (or via the Claude Code settings UI).

## Mapping

| Cowork scheduled task                          | Hmart replacement                                              | Status    | Verify before disabling                                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| `inbox-hourly-process`                         | `route_capture` Edge Function (real-time on `captures` insert) | live      | a capture flows to a routed todo within 30s with sensible reasoning + draft notes                          |
| `daily-sync`                                   | Live UI checkbox writes via Supabase                           | live      | check a box in the UI, confirm it persists across reload + on another device                               |
| `learn-briefing`                               | `area_picker` `area=learn` (13:06 UTC, weekdays)               | live      | check `picker_runs` table for a successful row each weekday, todos appear in Learn area with drafted notes |
| `share-briefing` + `share-p0-morning-briefing` | `area_picker` `area=share` (13:05 UTC daily)                   | live      | as above; verify the IG caption + Substack draft land in notes                                             |
| `apply-briefing`                               | `area_picker` `area=apply` (13:07 UTC, weekdays)               | live      | deadline-proximity scoring drives surfaced picks                                                           |
| `network-briefing` (meet-briefing)             | `area_picker` `area=network` (13:08 UTC, weekdays)             | live      | 4 picks/day, one per category, with email draft in notes                                                   |
| `admin-briefing`                               | `area_picker` `area=admin` (13:09 UTC daily)                   | live      | admin backlog surfaces with next-step framing                                                              |
| `make-briefing`                                | `area_picker` `area=make` (13:10 UTC, weekdays)                | live      | weekly ship-rhythm reflected in surfacing                                                                  |
| `earn-briefing`                                | `area_picker` `area=earn` (13:11 UTC daily)                    | live      | top 3 Earn picks by priority + recency                                                                     |
| `write-briefing`                               | `area_picker` `area=write` (13:12 UTC, weekdays)               | live      | drafts cross-referenced with active wikis                                                                  |
| `invisible-briefing`                           | (deferred - needs Granola MCP integration)                     | not built | when built, route to `area=write` with `source=invisible` tag                                              |
| `health-briefing`                              | `area_picker` `area=health` (Monday 13:05 UTC weekly)          | live      | P0 buy-recommendations include product link                                                                |
| `wealth-briefing`                              | `area_picker` `area=wealth` (Monday 13:01 UTC weekly)          | live      | tax countdown + Things 3 deep links surface                                                                |
| `health-protocol-monday`                       | (deferred - protocol review is a manual checkin item)          | not built | until built, leave Cowork task running                                                                     |
| `strategy-briefing`                            | (deferred - needs OKR synthesis)                               | not built | leave Cowork running                                                                                       |
| `outings-briefing` (Mon/Thu)                   | (deferred - needs web-scraping integration)                    | not built | leave Cowork running                                                                                       |
| `sync-raw-weekly`                              | (deferred - needs Granola MCP)                                 | not built | leave Cowork running                                                                                       |

## Procedure per task

1. Run the Hmart equivalent manually via `curl -X POST .../functions/v1/area_picker -d '{"area":"<slug>"}'` to spot-check output once.
2. Open the matching Hmart area in the app; confirm picks landed and notes are useful.
3. Wait one week of parallel operation. Compare quality.
4. When confidence is there, disable the Cowork task. Leave the SKILL.md intact for reference.
5. After 30 days of clean operation with no rollback needs, archive the Cowork task definition (move under `~/Documents/Claude/Scheduled/_archive_2026/`).

## Rollback

If a Hmart picker misbehaves:

1. Re-enable the Cowork twin.
2. Pause the Hmart cron with `select cron.unschedule('pick_<area>');` against Postgres.
3. Fix the picker's prompt fragment in `supabase/functions/area_picker/index.ts` AREAS map, redeploy.
4. Re-enable cron, re-run manually to verify, re-disable Cowork twin.

## What stays in Cowork forever (for now)

- The 4 deferred items above need additional MCP/integration work and won't move this quarter.
- Granola sync + outings scrape + strategy synthesizer + health protocol review are roadmap items, not blockers.
