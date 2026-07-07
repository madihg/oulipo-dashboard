-- Add an "ongoing" priority (rendered as ~ in the UI) alongside P0/P1/P2, for
-- continuous / background work that isn't a one-shot urgency tier.
-- Applied live via the management API on 2026-07-07; kept here for reproducibility.

alter type hmart.priority add value if not exists 'ongoing' after 'P2';
