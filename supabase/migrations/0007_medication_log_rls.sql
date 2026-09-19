-- =============================================================================
-- 0007_medication_log_rls: lock down hmart.medication_log.
--
-- This table was created out-of-band (no prior migration) to track post-op
-- medication and shipped with Row Level Security DISABLED. Because the `hmart`
-- schema is exposed through PostgREST, every row was readable and writable by
-- anyone holding the public `anon` key — a critical leak of personal health
-- data (Supabase advisor: rls_disabled_in_public).
--
-- Unlike the rest of the hmart tables, medication_log has no `user_id` column.
-- This is a single-user app, so the fix is to enable RLS and grant full access
-- to the `authenticated` role (the signed-in owner) while denying `anon`
-- entirely. The anon key can no longer touch this table.
-- =============================================================================

alter table hmart.medication_log enable row level security;

drop policy if exists "owner full access" on hmart.medication_log;
create policy "owner full access"
  on hmart.medication_log
  for all
  to authenticated
  using (true)
  with check (true);
