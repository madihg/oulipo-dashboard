-- Granola transcripts join the permanent backup. transcript_fetched_at
-- distinguishes "not yet fetched" (null) from "fetched, and this note has no
-- transcript" (timestamp set, transcript_md null) - solo memos have none, and
-- the connector only reaches ~30 days back, so each note gets exactly one
-- fetch attempt while it is still reachable.
alter table hmart.granola_notes add column if not exists transcript_md text;
alter table hmart.granola_notes add column if not exists transcript_fetched_at timestamptz;
