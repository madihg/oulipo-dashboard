-- =============================================================================
-- 0008_harden_network_views: stop hmart network views leaking to anon.
--
-- hmart.v_network_outreach_queue and hmart.v_network_weekly_scoreboard were
-- created out-of-band as SECURITY DEFINER views with SELECT granted to the
-- public `anon` role. Because the hmart schema is exposed via PostgREST, anyone
-- holding the anon key could read the entire network CRM (hmart.network_contacts
-- - names, emails, phones, notes) *through these views*, bypassing the RLS that
-- protects the underlying table (Supabase advisor: security_definer_view).
--
-- No application code references either view. Fix:
--   1. Revoke all anon privileges on both views.
--   2. Flip them to security_invoker so the querying role's own RLS is enforced
--      (the authenticated owner still sees their rows; service_role used by edge
--      functions is unaffected since it bypasses RLS).
-- =============================================================================

revoke all on hmart.v_network_outreach_queue from anon;
revoke all on hmart.v_network_weekly_scoreboard from anon;

alter view hmart.v_network_outreach_queue   set (security_invoker = on);
alter view hmart.v_network_weekly_scoreboard set (security_invoker = on);
