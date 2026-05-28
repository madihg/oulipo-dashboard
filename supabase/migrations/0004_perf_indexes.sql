-- =============================================================================
-- 0004_perf_indexes: indexes for the hot read paths.
--
-- 100% additive. Targets:
--   area_goals: lookups by (area_id, active=true)
--   network_contacts: ordering by last_touch_at within a user
--   picker_runs: filtering by function_name + ordering started_at desc
-- =============================================================================

create index if not exists area_goals_area_active
  on hmart.area_goals (area_id, active) where active;

create index if not exists network_contacts_user_last_touch
  on hmart.network_contacts (user_id, last_touch_at desc nulls last);

create index if not exists picker_runs_function_started
  on hmart.picker_runs (function_name, started_at desc);
