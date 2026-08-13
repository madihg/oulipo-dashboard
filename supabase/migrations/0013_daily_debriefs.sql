-- The debrief: one row per day, written by the daily-desk routine each run
-- (and seeded on Mondays by weekly-desk's review). The Today view renders it
-- as a collapsible panel. Realtime so the panel refreshes when a run lands.
create table if not exists hmart.daily_debriefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  day date not null,
  body text not null,
  generated_at timestamptz not null default now(),
  unique (user_id, day)
);
alter table hmart.daily_debriefs enable row level security;
create policy "owner full access" on hmart.daily_debriefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
alter publication supabase_realtime add table hmart.daily_debriefs;
