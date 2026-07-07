-- Priority board sticky notes shown on Today: an editable weekly-goals field
-- plus week / quarter / year priority notes (3 max each, enforced app-side).
-- Mindset post-its are read separately from memory_entries; this table only
-- holds the editable board content. App-side feature; no other table changes.
--
-- Applied live via the Supabase management API on 2026-07-06; this migration
-- keeps the schema reproducible from the repo.

create table if not exists hmart.board_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  board text not null check (board in ('week_goals', 'week', 'quarter', 'year')),
  position integer not null default 0,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table hmart.board_notes enable row level security;

create policy "board_notes_owner" on hmart.board_notes
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists board_notes_user_board_idx
  on hmart.board_notes (user_id, board, position);
