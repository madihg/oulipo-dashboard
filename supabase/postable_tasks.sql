-- Run this in your Supabase SQL Editor if postable_tasks does not exist.
-- Assumes you have an events table with id UUID.

CREATE TABLE IF NOT EXISTS postable_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  notes TEXT,
  posting_idea TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  source_event_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Optional: Add FK if events table exists with id
-- ALTER TABLE postable_tasks ADD CONSTRAINT fk_source_event
--   FOREIGN KEY (source_event_id) REFERENCES events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS postable_tasks_status_idx ON postable_tasks(status);
CREATE INDEX IF NOT EXISTS postable_tasks_created_at_idx ON postable_tasks(created_at DESC);
