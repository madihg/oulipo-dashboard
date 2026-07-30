-- The routine's memory, in Supabase and nowhere else. Every unit any routine
-- ever processes (a meeting, a journal entry, an email thread, an offer
-- source - including ones evaluated and SKIPPED) gets exactly one row here.
-- The unique key makes dedupe bulletproof and model-agnostic: any agent
-- system that can read Postgres can run the routine with perfect memory.
create table if not exists hmart.routine_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  routine text not null, -- e.g. 'daily-desk'
  source text not null, -- 'granola' | 'dayone' | 'gmail' | 'hmart'
  source_id text not null, -- meeting id / entry uuid / gmail thread id / todo id
  kind text, -- 'task' | 'decision' | 'offer' | 'reply_draft' | 'skip'
  result jsonb, -- {todo_id} / {draft_row_id, gmail_draft_id} / {reason}
  processed_at timestamptz not null default now(),
  unique (user_id, routine, source, source_id)
);

alter table hmart.routine_ledger enable row level security;
create policy "owner full access" on hmart.routine_ledger
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
