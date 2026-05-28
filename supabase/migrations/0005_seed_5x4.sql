-- =============================================================================
-- 0005_seed_5x4: ensure the 5-x-4 project exists under the network area.
--
-- This project is the canonical target for picks the network routine surfaces
-- from the network_contacts CRM reservoir. Cowork picker references it by
-- slug; without this row, picks land orphaned with project_id = null.
--
-- Idempotent: only inserts when missing per (user_id, slug).
-- =============================================================================

insert into hmart.projects (user_id, area_id, slug, name, position, state)
select
  a.user_id,
  a.id,
  '5-x-4',
  '5 x 4',
  0,
  'active'
from hmart.areas a
where a.slug = 'network'
  and not exists (
    select 1 from hmart.projects p
    where p.user_id = a.user_id and p.slug = '5-x-4'
  );
