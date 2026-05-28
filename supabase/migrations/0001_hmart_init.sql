-- =============================================================================
-- hmart schema: personal task manager (Things 3 model + Claude augmentation)
-- See ~/Documents/hmart/hmart-kanban/tasks/prd-hmart-kanban.md
--
-- Applies to project `oulipo_main` (ref: smytgqkgomsfyurskpcl) alongside
-- existing schemas: singulars, oulipo_dashboard, becoming_border,
-- hatchings_eyes, wikitongues, public.
-- 100% additive - no existing schema/table modified.
-- =============================================================================

create schema if not exists hmart;

-- Allow anon + authenticated + service_role to use the schema (RLS still enforced)
grant usage on schema hmart to anon, authenticated, service_role;
alter default privileges in schema hmart grant all on tables to authenticated, service_role;
alter default privileges in schema hmart grant all on sequences to authenticated, service_role;
alter default privileges in schema hmart grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema hmart grant usage on sequences to authenticated;

-- =============================================================================
-- Enums
-- =============================================================================
create type hmart.project_state as enum ('active','someday','completed','cancelled');
create type hmart.cadence as enum ('daily','weekly','monthly','yearly');
create type hmart.todo_state as enum (
  'inbox','today','anytime','upcoming','someday','completed','cancelled','logbook'
);
create type hmart.priority as enum ('P0','P1','P2');
create type hmart.capture_source as enum ('mobile','web','dispatch','obsidian');
create type hmart.capture_state as enum ('pending','routing','routed','needs_review','failed');
create type hmart.claude_mode as enum ('manual','auto','checkin');
create type hmart.claude_status as enum ('queued','running','completed','failed');
create type hmart.memory_kind as enum ('user_rule','project_rule','feedback','reference','style_guide');
create type hmart.network_category as enum (
  'podcast','publication','gallery','peer','curator','journalist','org','collector','other'
);
create type hmart.network_status as enum (
  'lead','contacted','responded','meeting_scheduled','in_relationship','dormant'
);
create type hmart.apply_kind as enum (
  'residency','submission','grant','fellowship','journal','podcast_pitch','other'
);
create type hmart.apply_status as enum (
  'watchlist','doing','applied','accepted','rejected','declined','skipped'
);
create type hmart.learn_kind as enum ('lit','tech');
create type hmart.learn_status as enum ('backlog','doing','done','skipped');
create type hmart.wiki_priority as enum ('P0','P1','P2','dormant');
create type hmart.piece_kind as enum (
  'Piece','Exhibition','Residency','Talk','Workshop','Show','Writing','Gathering','Press','Press Kit'
);
create type hmart.piece_status as enum ('someday','active','in_progress','shipped','archived');
create type hmart.write_state as enum ('in_progress','active','completed');
create type hmart.outings_signal as enum ('high','medium','low');
create type hmart.share_kind as enum (
  'work_share','announcement','event_reminder','reshare',
  'substack_essay','substack_chat','quote_card','micro','other'
);
create type hmart.share_format as enum (
  'ig_carousel','ig_reel','ig_single','ig_story',
  'substack_post','substack_chat','cross_platform','other'
);
create type hmart.share_status as enum (
  'backlog','suggested','locked','drafted','shipped','slot_skipped','dropped'
);
create type hmart.share_touchpoint as enum ('announce','during','after');

-- =============================================================================
-- Core productivity tables
-- =============================================================================
create table hmart.areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  name text not null,
  position int not null default 0,
  color text,
  icon text,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);
create index areas_user_position on hmart.areas (user_id, position);

create table hmart.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  area_id uuid not null references hmart.areas(id) on delete cascade,
  slug text not null,
  name text not null,
  notes text,
  deadline date,
  state hmart.project_state not null default 'active',
  cadence hmart.cadence,
  cadence_target int,
  position int not null default 0,
  obsidian_uri text,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);
create index projects_user_area on hmart.projects (user_id, area_id, position);
create index projects_user_state on hmart.projects (user_id, state);

create table hmart.headings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references hmart.projects(id) on delete cascade,
  title text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index headings_project on hmart.headings (project_id, position);

create table hmart.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  area_id uuid references hmart.areas(id) on delete set null,
  project_id uuid references hmart.projects(id) on delete cascade,
  heading_id uuid references hmart.headings(id) on delete set null,
  title text not null,
  notes text,
  state hmart.todo_state not null default 'inbox',
  priority hmart.priority,
  start_date date,
  deadline date,
  evening boolean not null default false,
  completed_at timestamptz,
  position int not null default 0,
  obsidian_uri text,
  drafts jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index todos_user_state on hmart.todos (user_id, state);
create index todos_user_deadline on hmart.todos (user_id, deadline);
create index todos_project_position on hmart.todos (project_id, position);
create index todos_user_priority on hmart.todos (user_id, priority);

create table hmart.checklist_items (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references hmart.todos(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index checklist_todo on hmart.checklist_items (todo_id, position);

create table hmart.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  unique (user_id, name)
);
create index tags_user on hmart.tags (user_id);

create table hmart.todo_tags (
  todo_id uuid not null references hmart.todos(id) on delete cascade,
  tag_id uuid not null references hmart.tags(id) on delete cascade,
  primary key (todo_id, tag_id)
);
create index todo_tags_tag on hmart.todo_tags (tag_id);

create table hmart.repeating_rules (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references hmart.todos(id) on delete cascade,
  rule jsonb not null,
  next_fire_at timestamptz,
  last_fired_at timestamptz,
  on_miss text not null default 'backfill',
  created_at timestamptz not null default now()
);
create index repeating_next on hmart.repeating_rules (next_fire_at);
create index repeating_todo on hmart.repeating_rules (todo_id);

create table hmart.captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_text text not null,
  source hmart.capture_source not null,
  state hmart.capture_state not null default 'pending',
  routed_to_todo_id uuid references hmart.todos(id) on delete set null,
  routed_to_claude_id uuid,
  inference_summary text,
  reasoning text,
  confidence numeric,
  tools_used text[],
  prep_duration_ms int,
  created_at timestamptz not null default now()
);
create index captures_user_state on hmart.captures (user_id, state, created_at desc);

create table hmart.claude_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  todo_id uuid references hmart.todos(id) on delete set null,
  mode hmart.claude_mode not null default 'manual',
  prompt_text text not null,
  status hmart.claude_status not null default 'queued',
  result_text text,
  result_url text,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index claude_user_status on hmart.claude_tasks (user_id, status, created_at desc);
create index claude_todo on hmart.claude_tasks (todo_id);

alter table hmart.captures
  add constraint captures_routed_claude_fk
  foreign key (routed_to_claude_id) references hmart.claude_tasks(id) on delete set null;

create table hmart.picker_runs (
  id uuid primary key default gen_random_uuid(),
  area_id uuid references hmart.areas(id) on delete set null,
  function_name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  summary jsonb
);
create index picker_runs_area_started on hmart.picker_runs (area_id, started_at desc);
create index picker_runs_function on hmart.picker_runs (function_name, started_at desc);

create table hmart.memory_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind hmart.memory_kind not null,
  scope text not null default 'global',
  title text not null,
  body text not null,
  source_file text,
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index memory_user_scope on hmart.memory_entries (user_id, scope);
create index memory_user_kind on hmart.memory_entries (user_id, kind);

-- =============================================================================
-- Specialty reservoirs (evergreen sources that feed the core via pickers)
-- =============================================================================
create table hmart.network_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category hmart.network_category not null,
  tier int not null default 4 check (tier between 1 and 4),
  email text,
  phone text,
  twitter text,
  instagram text,
  website text,
  status hmart.network_status not null default 'lead',
  hook text,
  hook_fetched_at timestamptz,
  last_touch_at timestamptz,
  last_touched_thread_id text,
  last_surfaced_at timestamptz,
  surfaced_count int not null default 0,
  maintenance_due_at date,
  warm_bridge text,
  notes text,
  created_at timestamptz not null default now()
);
create index network_user_tier on hmart.network_contacts (user_id, tier, category);
create index network_user_maintenance on hmart.network_contacts (user_id, maintenance_due_at);
create index network_user_surfaced on hmart.network_contacts (user_id, last_surfaced_at desc nulls last);

create table hmart.apply_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind hmart.apply_kind not null,
  name text not null,
  organization text,
  deadline date,
  rolling boolean not null default false,
  url text,
  fit_note text,
  status hmart.apply_status not null default 'watchlist',
  priority hmart.priority,
  materials_status text,
  last_surfaced_at timestamptz,
  surfaced_count int not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
create index apply_user_deadline on hmart.apply_opportunities (user_id, deadline);
create index apply_user_status on hmart.apply_opportunities (user_id, status);

create table hmart.learn_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind hmart.learn_kind not null,
  title text not null,
  url text,
  source text,
  tags text[] not null default '{}',
  priority hmart.priority,
  deadline date,
  status hmart.learn_status not null default 'backlog',
  resurface_at date,
  surfaced_count int not null default 0,
  last_surfaced_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
create index learn_items_user_kind on hmart.learn_items (user_id, kind, status);
create index learn_items_tags_gin on hmart.learn_items using gin (tags);
create index learn_items_user_resurface on hmart.learn_items (user_id, resurface_at) where resurface_at is not null;

create table hmart.learn_wikis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tag text not null,
  title text not null,
  priority hmart.wiki_priority not null default 'P2',
  synthesis text,
  body text,
  sources_count int not null default 0,
  last_ingest_at timestamptz,
  cross_refs text[] not null default '{}',
  frontmatter jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, tag)
);
create index learn_wikis_user_priority on hmart.learn_wikis (user_id, priority);

create table hmart.make_pieces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_piece_id uuid references hmart.make_pieces(id) on delete set null,
  slug text not null,
  name text not null,
  piece_kind hmart.piece_kind not null default 'Piece',
  status hmart.piece_status not null default 'someday',
  deadline date,
  ship_target_at date,
  shipped_at date,
  brief text,
  drive_folder_id text,
  drive_folder_url text,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);
create index make_user_status on hmart.make_pieces (user_id, status);
create index make_parent on hmart.make_pieces (parent_piece_id);

create table hmart.write_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  title text not null,
  state hmart.write_state not null default 'in_progress',
  wikis_used uuid[] not null default '{}',
  obsidian_uri text,
  ship_target_at date,
  last_touched_at timestamptz,
  shipped_at date,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);
create index write_drafts_user_state on hmart.write_drafts (user_id, state);

create table hmart.outings_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  kind text,
  venue text,
  address text,
  starts_at timestamptz,
  ends_at timestamptz,
  url text,
  source text,
  signal hmart.outings_signal not null default 'medium',
  price text,
  notes text,
  captured_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (user_id, title, starts_at)
);
create index outings_user_starts on hmart.outings_events (user_id, starts_at);
create index outings_user_signal on hmart.outings_events (user_id, signal);

create table hmart.share_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_piece_id uuid references hmart.make_pieces(id) on delete set null,
  arc_slug text,                                         -- e.g. 'culturehub-la-2026'
  touchpoint hmart.share_touchpoint,                     -- announce / during / after (per Share strategy 3-touchpoint rule)
  title text not null,
  hook text,                                             -- one-line "why share"
  kind hmart.share_kind not null default 'work_share',
  format hmart.share_format not null default 'ig_carousel',
  platform_targets text[] not null default '{ig}',       -- 'ig'|'substack'|'youtube_shorts'|'website'
  status hmart.share_status not null default 'backlog',
  priority hmart.priority,
  target_slot_at date,                                   -- when scheduled to ship (Tue/Fri for IG, Sun for Substack)
  shipped_at timestamptz,
  -- Drafts (populated by drafter; one entry can hold IG + Substack + slides)
  draft_caption text,
  draft_hashtags text[] not null default '{}',
  draft_substack_title text,
  draft_substack_subtitle text,
  draft_substack_body text,
  draft_slides jsonb,                                    -- array of {n, image_url|filename, copy}
  draft_images jsonb,                                    -- array of {filename, viewUrl, reason, source}
  drive_folder_url text,
  external_url text,                                     -- link to the work (Mosaic interview, MQR essay, etc.)
  last_surfaced_at timestamptz,
  surfaced_count int not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
create index share_user_status on hmart.share_items (user_id, status, target_slot_at);
create index share_user_target on hmart.share_items (user_id, target_slot_at) where target_slot_at is not null;
create index share_arc on hmart.share_items (user_id, arc_slug) where arc_slug is not null;
create index share_piece on hmart.share_items (source_piece_id);

create table hmart.surfaced_from (
  todo_id uuid primary key references hmart.todos(id) on delete cascade,
  source_table text not null,
  source_id uuid not null,
  surfaced_at timestamptz not null default now(),
  picker_run_id uuid references hmart.picker_runs(id) on delete set null,
  check (source_table in (
    'network_contacts','apply_opportunities','learn_items','learn_wikis',
    'make_pieces','write_drafts','outings_events','share_items'
  ))
);
create index surfaced_from_source on hmart.surfaced_from (source_table, source_id);

-- =============================================================================
-- RLS - every user-owned table scoped to auth.uid()
-- =============================================================================
alter table hmart.areas              enable row level security;
alter table hmart.projects           enable row level security;
alter table hmart.headings           enable row level security;
alter table hmart.todos              enable row level security;
alter table hmart.checklist_items    enable row level security;
alter table hmart.tags               enable row level security;
alter table hmart.todo_tags          enable row level security;
alter table hmart.repeating_rules    enable row level security;
alter table hmart.captures           enable row level security;
alter table hmart.claude_tasks       enable row level security;
alter table hmart.picker_runs        enable row level security;
alter table hmart.memory_entries     enable row level security;
alter table hmart.network_contacts   enable row level security;
alter table hmart.apply_opportunities enable row level security;
alter table hmart.learn_items        enable row level security;
alter table hmart.learn_wikis        enable row level security;
alter table hmart.make_pieces        enable row level security;
alter table hmart.write_drafts       enable row level security;
alter table hmart.outings_events     enable row level security;
alter table hmart.share_items        enable row level security;
alter table hmart.surfaced_from      enable row level security;

create policy "owner full access" on hmart.areas              using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner full access" on hmart.projects           using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner full access" on hmart.headings           using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner full access" on hmart.todos              using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner full access" on hmart.tags               using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner full access" on hmart.captures           using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner full access" on hmart.claude_tasks       using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner full access" on hmart.memory_entries     using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner full access" on hmart.network_contacts   using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner full access" on hmart.apply_opportunities using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner full access" on hmart.learn_items        using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner full access" on hmart.learn_wikis        using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner full access" on hmart.make_pieces        using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner full access" on hmart.write_drafts       using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner full access" on hmart.outings_events     using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner full access" on hmart.share_items        using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "owner via todo" on hmart.checklist_items
  using (exists (select 1 from hmart.todos t where t.id = checklist_items.todo_id and t.user_id = auth.uid()))
  with check (exists (select 1 from hmart.todos t where t.id = checklist_items.todo_id and t.user_id = auth.uid()));
create policy "owner via todo" on hmart.todo_tags
  using (exists (select 1 from hmart.todos t where t.id = todo_tags.todo_id and t.user_id = auth.uid()))
  with check (exists (select 1 from hmart.todos t where t.id = todo_tags.todo_id and t.user_id = auth.uid()));
create policy "owner via todo" on hmart.repeating_rules
  using (exists (select 1 from hmart.todos t where t.id = repeating_rules.todo_id and t.user_id = auth.uid()))
  with check (exists (select 1 from hmart.todos t where t.id = repeating_rules.todo_id and t.user_id = auth.uid()));
create policy "owner via todo" on hmart.surfaced_from
  using (exists (select 1 from hmart.todos t where t.id = surfaced_from.todo_id and t.user_id = auth.uid()))
  with check (exists (select 1 from hmart.todos t where t.id = surfaced_from.todo_id and t.user_id = auth.uid()));
create policy "owner via area" on hmart.picker_runs
  using (picker_runs.area_id is null or exists (select 1 from hmart.areas a where a.id = picker_runs.area_id and a.user_id = auth.uid()))
  with check (picker_runs.area_id is null or exists (select 1 from hmart.areas a where a.id = picker_runs.area_id and a.user_id = auth.uid()));

-- =============================================================================
-- Trigger: on todo completion, bump reservoir source rows so future picker
-- runs see the touchpoint.
-- =============================================================================
create or replace function hmart.on_todo_completed() returns trigger
language plpgsql security definer set search_path = hmart, public as $$
declare
  link record;
begin
  if (new.state = 'completed' or new.state = 'logbook') and
     (old.state is distinct from new.state) then
    select source_table, source_id into link
    from hmart.surfaced_from where todo_id = new.id;
    if found then
      if link.source_table = 'network_contacts' then
        update hmart.network_contacts set last_touch_at = now() where id = link.source_id;
      elsif link.source_table = 'apply_opportunities' then
        update hmart.apply_opportunities
          set status = case when status = 'doing' then 'applied' else status end
          where id = link.source_id;
      elsif link.source_table = 'learn_items' then
        update hmart.learn_items set status = 'done' where id = link.source_id;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger todos_on_completion
  after update of state on hmart.todos
  for each row execute function hmart.on_todo_completed();

grant select, insert, update, delete on all tables in schema hmart to authenticated;
grant usage, select on all sequences in schema hmart to authenticated;
grant all on all tables in schema hmart to service_role;
grant all on all sequences in schema hmart to service_role;
