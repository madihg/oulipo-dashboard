-- Hmart Kanban seed. Run AFTER signing in once via magic link so auth.users
-- has a row, then execute these inserts with your user_id substituted in.
--
-- The 8 areas + their projects match Halim's 2026-04-25 IA spec.
-- Each project's `position` orders within its area.

-- Replace this with your actual auth.users.id after first magic-link sign-in.
-- Easiest: `select id, email from auth.users;` in the Supabase SQL editor.
-- Then re-run this script with that id substituted everywhere below.
\set user_id 'REPLACE_WITH_YOUR_USER_ID'

-- ============================================================================
-- 8 Areas
-- ============================================================================
insert into public.areas (user_id, slug, name, position) values
  (:'user_id', 'admin',   'admin',   1),
  (:'user_id', 'apply',   'apply',   2),
  (:'user_id', 'earn',    'earn',    3),
  (:'user_id', 'learn',   'learn',   4),
  (:'user_id', 'make',    'make',    5),
  (:'user_id', 'network', 'network', 6),
  (:'user_id', 'share',   'share',   7),
  (:'user_id', 'write',   'write',   8);

-- ============================================================================
-- Projects per area (placeholders - flesh out as you actually use them)
-- ============================================================================

-- admin (subsumes wealth + health + outings per PRD)
insert into public.projects (user_id, area_id, slug, name, position) values
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'admin'), 'admin-general', 'general admin',     1),
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'admin'), 'wealth',         'wealth',            2),
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'admin'), 'health',         'health',            3),
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'admin'), 'outings',        'outings',           4);

-- apply
insert into public.projects (user_id, area_id, slug, name, position) values
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'apply'), 'residencies-27', 'apply to 27 residencies', 1),
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'apply'), 'submissions',    'submissions',             2);

-- earn
insert into public.projects (user_id, area_id, slug, name, position) values
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'earn'), 'invisible',         'invisible',          1),
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'earn'), 'clarinet',          'clarinet',           2),
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'earn'), 'teaching-27',       '3 teaching gigs 27', 3),
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'earn'), 'wikitongues',       'wikitongues',        4);

-- learn (daily cadence)
insert into public.projects (user_id, area_id, slug, name, cadence, cadence_target, position) values
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'learn'), 'learn-e-poetry', 'learn e-poetry', 'daily', 1, 1),
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'learn'), 'learn-tech',     'learn tech',     null,    null, 2),
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'learn'), 'wikis',          'wikis',          null,    null, 3);

-- make (weekly cadence)
insert into public.projects (user_id, area_id, slug, name, cadence, cadence_target, position) values
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'make'), 'make-1-piece',  'make 1 piece',         'weekly', 1, 1),
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'make'), 'singulars',     'singulars',            null, null, 2),
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'make'), 'brand-website', 'brand and website',    null, null, 3),
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'make'), 'reading-room',  'reading room',         null, null, 4);

-- network (monthly cadence)
insert into public.projects (user_id, area_id, slug, name, cadence, cadence_target, position) values
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'network'), 'gather-people', 'gather people', 'monthly', 1, 1);

-- share (weekly cadence)
insert into public.projects (user_id, area_id, slug, name, cadence, cadence_target, position) values
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'share'), 'share-2-bits',  'share 2 bits', 'weekly', 1, 1),
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'share'), 'ig-aesthetics', 'ig aesthetics', null, null, 2);

-- write
insert into public.projects (user_id, area_id, slug, name, position) values
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'write'), 'write-active',    'active drafts',    1),
  (:'user_id', (select id from public.areas where user_id = :'user_id' and slug = 'write'), 'write-completed', 'completed pieces', 2);
