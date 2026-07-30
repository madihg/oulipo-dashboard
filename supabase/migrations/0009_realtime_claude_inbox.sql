-- Realtime for the "from claude" inbox section: run-status chips and the
-- drafts strip update live in ClaudeInboxSection.vue. Both tables already
-- carry owner-only RLS (auth.uid() = user_id).
alter publication supabase_realtime add table hmart.claude_tasks;
alter publication supabase_realtime add table hmart.inbox_reply_drafts;

-- One active run per todo: a double-approve fails loudly at the DB instead of
-- queuing the same offer twice (client also guards, this is the backstop).
create unique index if not exists claude_tasks_one_active_per_todo
  on hmart.claude_tasks (todo_id)
  where todo_id is not null and status in ('queued', 'running');
