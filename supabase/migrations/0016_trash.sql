-- 0016_trash.sql
-- The trash: every delete on a user table copies the row into hmart.trash
-- first, so nothing deleted from the app, a routine or a Claude session is
-- gone for good. Rows removed by a cascade (the checklist of a deleted task,
-- the tasks of a deleted project, a task's tag links) are filed as children
-- of the entry that caused them, so one restore brings the whole thing back.
--
-- Read:    hmart.trash_search(q, kind, limit, offset), hmart.trash_kinds()
-- Restore: hmart.trash_restore(id, batch), hmart.trash_restore_row(table, row_id)
-- Nothing in the app can write or delete trash rows directly.

-- ---------------------------------------------------------------- table

create table if not exists hmart.trash (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid,
  source_table    text not null,
  row_id          text not null,
  title           text not null default '(untitled)',
  detail          text,
  data            jsonb not null,
  parent_trash_id uuid references hmart.trash(id) on delete set null,
  root_id         uuid not null,
  tx_id           bigint not null default txid_current(),
  deleted_at      timestamptz not null default now(),
  deleted_by      text not null default 'claude',
  deleted_via     text,
  restored_at     timestamptz,
  restored_by     text,
  search          tsvector generated always as
                    (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(detail, ''))) stored
);

comment on table hmart.trash is
  'Every deleted row from hmart user tables, captured by hmart_private.trash_capture(). Restore with hmart.trash_restore().';

create index if not exists trash_open_by_user on hmart.trash (user_id, deleted_at desc) where restored_at is null;
create index if not exists trash_open_by_row on hmart.trash (source_table, row_id) where restored_at is null;
create index if not exists trash_by_tx on hmart.trash (tx_id);
create index if not exists trash_by_parent on hmart.trash (parent_trash_id);
create index if not exists trash_search_idx on hmart.trash using gin (search);

alter table hmart.trash enable row level security;

drop policy if exists "owner reads trash" on hmart.trash;
create policy "owner reads trash" on hmart.trash
  for select to authenticated using (auth.uid() = user_id);

-- the schema's default privileges hand new tables to anon/authenticated:
-- take that back, the app only reads, the functions below do the writing
revoke all on hmart.trash from public, anon, authenticated;
grant select on hmart.trash to authenticated;
grant all on hmart.trash to service_role;

-- ---------------------------------------------------------------- helpers

-- primary key of a row as text ('a:b' for composite keys)
create or replace function hmart_private.trash_pk(p_rel regclass, p_data jsonb)
returns text
language sql stable
set search_path = ''
as $$
  select string_agg(p_data ->> a.attname, ':' order by k.ord)
    from pg_catalog.pg_index i
    cross join lateral unnest(i.indkey::int2[]) with ordinality as k(attnum, ord)
    join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
   where i.indrelid = p_rel and i.indisprimary
$$;

-- who is acting: app (signed-in user), routine (service role, cron) or claude (direct sql)
create or replace function hmart_private.trash_actor()
returns text
language sql stable
set search_path = ''
as $$
  select case
    when (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'authenticated' then 'app'
    when (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role' then 'routine'
    when (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') is not null
      then nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    when current_setting('application_name', true) ilike '%cron%' then 'routine'
    else 'claude'
  end
$$;

-- may the current caller restore this user's rows?
create or replace function hmart_private.trash_can_touch(p_user uuid)
returns boolean
language sql stable
set search_path = ''
as $$
  select case
    -- direct database session (claude via sql, cron): already privileged
    when (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') is null then true
    when (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role' then true
    when (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'authenticated'
      then auth.uid() is not null and auth.uid() = p_user
    else false
  end
$$;

-- a short human line of context for a trashed row: its task, project, area, scope...
create or replace function hmart_private.trash_context(p_data jsonb)
returns text
language sql stable
set search_path = ''
as $$
  select coalesce(
    case when p_data ->> 'todo_id' is not null then coalesce(
      (select t.title from hmart.todos t where t.id = (p_data ->> 'todo_id')::uuid),
      (select x.title from hmart.trash x where x.source_table = 'todos' and x.row_id = p_data ->> 'todo_id'
        order by x.deleted_at desc limit 1)) end,
    case when p_data ->> 'project_id' is not null then coalesce(
      (select p.name from hmart.projects p where p.id = (p_data ->> 'project_id')::uuid),
      (select x.title from hmart.trash x where x.source_table = 'projects' and x.row_id = p_data ->> 'project_id'
        order by x.deleted_at desc limit 1)) end,
    case when p_data ->> 'area_id' is not null then coalesce(
      (select a.name from hmart.areas a where a.id = (p_data ->> 'area_id')::uuid),
      (select x.title from hmart.trash x where x.source_table = 'areas' and x.row_id = p_data ->> 'area_id'
        order by x.deleted_at desc limit 1)) end,
    nullif(p_data ->> 'scope', ''),
    nullif(p_data ->> 'organization', ''),
    nullif(p_data ->> 'venue', ''),
    nullif(p_data ->> 'arc_slug', ''),
    nullif(p_data ->> 'board', '')
  )
$$;

-- ---------------------------------------------------------------- capture

-- BEFORE DELETE, per row. Args: mode ('always' | 'cascade'), parents
-- ('todos:todo_id,tags:tag_id'). 'cascade' tables are only kept when their
-- parent went to the trash in the same transaction (a tag removed from a task
-- is an edit, not a deletion). Runs before the row is gone and before any
-- cascade, so a parent's entry always exists when its children arrive.
create or replace function hmart_private.trash_capture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode    text := coalesce(tg_argv[0], 'always');
  v_parents text := nullif(tg_argv[1], '');
  v_data    jsonb := to_jsonb(old);
  v_tx      bigint := txid_current();
  v_id      uuid := gen_random_uuid();
  v_spec    text;
  v_ptable  text;
  v_pcol    text;
  v_pval    text;
  v_pid     uuid;
  v_proot   uuid;
  v_puser   uuid;
  v_uid     uuid;
  v_title   text;
  v_detail  text;
begin
  if v_parents is not null then
    foreach v_spec in array string_to_array(v_parents, ',') loop
      v_ptable := split_part(v_spec, ':', 1);
      v_pcol := split_part(v_spec, ':', 2);
      v_pval := v_data ->> v_pcol;
      continue when v_pval is null;
      select t.id, t.root_id, t.user_id into v_pid, v_proot, v_puser
        from hmart.trash t
       where t.tx_id = v_tx and t.source_table = v_ptable and t.row_id = v_pval
         and t.restored_at is null
       order by t.deleted_at desc
       limit 1;
      exit when v_pid is not null;
    end loop;
  end if;

  if v_mode = 'cascade' and v_pid is null then
    return old;
  end if;

  v_uid := nullif(v_data ->> 'user_id', '')::uuid;
  if v_uid is null then
    v_uid := v_puser;
  end if;
  if v_uid is null and v_parents is not null then
    -- a child deleted on its own (one checklist item): owner of its live parent
    v_ptable := split_part(split_part(v_parents, ',', 1), ':', 1);
    v_pcol := split_part(split_part(v_parents, ',', 1), ':', 2);
    if v_data ->> v_pcol is not null then
      execute format('select user_id from hmart.%I where id = $1::uuid', v_ptable)
         into v_uid using v_data ->> v_pcol;
    end if;
  end if;
  v_uid := coalesce(v_uid, auth.uid());

  v_title := case tg_table_name
    when 'todo_tags' then coalesce(
      (select g.name from hmart.tags g where g.id = (v_data ->> 'tag_id')::uuid),
      (select x.title from hmart.trash x where x.source_table = 'tags' and x.row_id = v_data ->> 'tag_id'
        order by x.deleted_at desc limit 1),
      'tag')
    when 'repeating_rules' then 'repeat rule'
    when 'surfaced_from' then 'surfaced from ' || replace(coalesce(v_data ->> 'source_table', 'a source'), '_', ' ')
    else coalesce(
      nullif(btrim(v_data ->> 'title'), ''),
      nullif(btrim(v_data ->> 'name'), ''),
      nullif(btrim(left(v_data ->> 'raw_text', 200)), ''),
      nullif(btrim(v_data ->> 'tag'), ''),
      nullif(btrim(left(v_data ->> 'prompt_text', 200)), ''),
      nullif(btrim(left(v_data ->> 'body', 200)), ''),
      nullif(btrim(v_data ->> 'slug'), ''),
      '(untitled)')
  end;

  v_detail := left(coalesce(
    nullif(btrim(v_data ->> 'notes'), ''),
    nullif(btrim(v_data ->> 'synthesis'), ''),
    nullif(btrim(v_data ->> 'inference_summary'), ''),
    nullif(btrim(v_data ->> 'hook'), ''),
    nullif(btrim(v_data ->> 'fit_note'), ''),
    case when v_data ? 'title' or v_data ? 'name' then nullif(btrim(v_data ->> 'body'), '') end,
    nullif(btrim(v_data ->> 'result_text'), '')), 2000);

  insert into hmart.trash (id, user_id, source_table, row_id, title, detail, data,
                           parent_trash_id, root_id, tx_id, deleted_by, deleted_via)
  values (v_id, v_uid, tg_table_name,
          coalesce(hmart_private.trash_pk(tg_relid, v_data), v_data ->> 'id', ''),
          v_title, v_detail, v_data,
          v_pid, coalesce(v_proot, v_id), v_tx,
          hmart_private.trash_actor(),
          concat_ws(' ', nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
                    nullif(current_setting('application_name', true), ''), session_user::text));
  return old;
end
$$;

-- AFTER INSERT, per statement: a row coming back with the same key (the app's
-- undo toast re-inserting a task, a restore) closes its open trash entries.
create or replace function hmart_private.trash_mark_reinserted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update hmart.trash t
     set restored_at = now(),
         restored_by = coalesce(t.restored_by, hmart_private.trash_actor())
    from (select hmart_private.trash_pk(tg_relid, to_jsonb(n)) as pk from new_rows n) s
   where t.source_table = tg_table_name
     and t.restored_at is null
     and t.row_id = s.pk;
  return null;
end
$$;

revoke all on function hmart_private.trash_pk(regclass, jsonb) from public, anon, authenticated;
revoke all on function hmart_private.trash_actor() from public, anon, authenticated;
revoke all on function hmart_private.trash_can_touch(uuid) from public, anon, authenticated;
revoke all on function hmart_private.trash_capture() from public, anon, authenticated;
revoke all on function hmart_private.trash_mark_reinserted() from public, anon, authenticated;
-- trash_context runs inside the invoker-rights search, for the signed-in user
revoke all on function hmart_private.trash_context(jsonb) from public, anon;
grant usage on schema hmart_private to authenticated;
grant execute on function hmart_private.trash_context(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------- attach

do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      -- table                 mode       parents (cascade sources)
      ('todos',               'always',  'projects:project_id'),
      ('checklist_items',     'always',  'todos:todo_id'),
      ('projects',            'always',  'areas:area_id'),
      ('headings',            'always',  'projects:project_id'),
      ('areas',               'always',  ''),
      ('area_goals',          'always',  'areas:area_id'),
      ('captures',            'always',  ''),
      ('tags',                'always',  ''),
      ('board_notes',         'always',  ''),
      ('claude_tasks',        'always',  ''),
      ('learn_items',         'always',  ''),
      ('learn_wikis',         'always',  ''),
      ('make_wikis',          'always',  ''),
      ('memory_entries',      'always',  ''),
      ('network_contacts',    'always',  ''),
      ('apply_opportunities', 'always',  ''),
      ('share_items',         'always',  ''),
      ('outings_events',      'always',  ''),
      ('write_drafts',        'always',  ''),
      ('todo_tags',           'cascade', 'todos:todo_id,tags:tag_id'),
      ('repeating_rules',     'cascade', 'todos:todo_id'),
      ('surfaced_from',       'cascade', 'todos:todo_id')
    ) as v(tbl, mode, parents)
  loop
    if to_regclass(format('hmart.%I', spec.tbl)) is null then
      continue;
    end if;
    execute format('drop trigger if exists trash_capture on hmart.%I', spec.tbl);
    execute format(
      'create trigger trash_capture before delete on hmart.%I for each row execute function hmart_private.trash_capture(%L, %L)',
      spec.tbl, spec.mode, spec.parents);
    execute format('drop trigger if exists trash_reinserted on hmart.%I', spec.tbl);
    execute format(
      'create trigger trash_reinserted after insert on hmart.%I referencing new table as new_rows for each statement execute function hmart_private.trash_mark_reinserted()',
      spec.tbl);
  end loop;
end
$$;

-- ---------------------------------------------------------------- restore

-- put one trash entry's row back. Returns null when restored, 'exists' when the
-- row is already live, otherwise the reason it was skipped. Missing optional
-- parents (a project or area that no longer exists) are cleared; a missing
-- required parent (the task of a checklist item) skips the row.
create or replace function hmart_private.trash_reinsert(p_entry hmart.trash)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rel    regclass := to_regclass(format('hmart.%I', p_entry.source_table));
  v_data   jsonb := p_entry.data;
  v_fk     record;
  v_exists boolean;
  v_pk     text;
  v_cols   text;
  v_label  text;
begin
  if v_rel is null then
    return 'its table no longer exists';
  end if;

  select string_agg(format('x.%I = r.%I', a.attname, a.attname), ' and ')
    into v_pk
    from pg_catalog.pg_index i
    join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey::int2[])
   where i.indrelid = v_rel and i.indisprimary;
  if v_pk is not null then
    execute format('select exists (select 1 from %s x, jsonb_populate_record(null::%s, $1) r where %s)',
                   v_rel, v_rel, v_pk)
       into v_exists using v_data;
    if v_exists then
      return 'exists';
    end if;
  end if;

  for v_fk in
    select a.attname as col, a.attnotnull as notnull, c.confrelid::regclass as ref, rc.relname::text as refname,
           ra.attname as refcol, format_type(ra.atttypid, ra.atttypmod) as reftype
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_catalog.pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = c.confkey[1]
      join pg_catalog.pg_class rc on rc.oid = c.confrelid
      join pg_catalog.pg_namespace rn on rn.oid = rc.relnamespace
     where c.conrelid = v_rel and c.contype = 'f' and array_length(c.conkey, 1) = 1
       and rn.nspname <> 'auth'
  loop
    continue when v_data ->> v_fk.col is null;
    execute format('select exists (select 1 from %s where %I = $1::%s)', v_fk.ref, v_fk.refcol, v_fk.reftype)
       into v_exists using v_data ->> v_fk.col;
    if not v_exists then
      if v_fk.notnull then
        v_label := case v_fk.refname
          when 'todos' then 'task' when 'projects' then 'project' when 'areas' then 'area'
          when 'tags' then 'tag' when 'headings' then 'heading'
          else replace(v_fk.refname, '_', ' ') end;
        if exists (select 1 from hmart.trash x
                    where x.source_table = v_fk.refname and x.row_id = v_data ->> v_fk.col
                      and x.restored_at is null) then
          return format('restore its %s first', v_label);
        end if;
        return format('its %s is gone', v_label);
      end if;
      v_data := jsonb_set(v_data, array[v_fk.col], 'null'::jsonb);
    end if;
  end loop;

  select string_agg(format('%I', a.attname), ', ' order by a.attnum)
    into v_cols
    from pg_catalog.pg_attribute a
   where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
     and a.attgenerated = '' and v_data ? a.attname;
  if v_cols is null then
    return 'nothing to put back';
  end if;

  begin
    execute format('insert into %s (%s) overriding system value select %s from jsonb_populate_record(null::%s, $1)',
                   v_rel, v_cols, v_cols, v_rel)
      using v_data;
  exception
    when unique_violation then
      return 'something with the same name is already there';
    when others then
      return 'could not restore: ' || sqlerrm;
  end;
  return null;
end
$$;

revoke all on function hmart_private.trash_reinsert(hmart.trash) from public, anon, authenticated;

-- restore an entry and everything that was deleted with it (p_batch: every
-- entry from the same deletion). Returns {restored: [...], skipped: [...]}.
create or replace function hmart.trash_restore(p_id uuid, p_batch boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e        hmart.trash;
  v_r        hmart.trash;
  v_id       uuid;
  v_reason   text;
  v_by       text := hmart_private.trash_actor();
  v_restored jsonb := '[]'::jsonb;
  v_skipped  jsonb := '[]'::jsonb;
begin
  select * into v_e from hmart.trash where id = p_id;
  if not found then
    raise exception 'trash entry % not found', p_id using errcode = 'P0002';
  end if;
  if not hmart_private.trash_can_touch(v_e.user_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  for v_id in
    with recursive tree as (
      select t.id, 0 as depth
        from hmart.trash t
       where t.restored_at is null
         and (t.id = v_e.id
              or (p_batch and t.tx_id = v_e.tx_id
                  and t.user_id is not distinct from v_e.user_id
                  and (t.parent_trash_id is null
                       or exists (select 1 from hmart.trash p
                                   where p.id = t.parent_trash_id and p.restored_at is not null))))
      union all
      select c.id, tree.depth + 1
        from hmart.trash c
        join tree on c.parent_trash_id = tree.id
       where c.restored_at is null
    )
    select tree.id from tree
      join hmart.trash t on t.id = tree.id
     group by tree.id, t.deleted_at
     order by min(tree.depth), t.deleted_at, tree.id
  loop
    select * into v_r from hmart.trash where id = v_id;
    continue when v_r.restored_at is not null;
    v_reason := hmart_private.trash_reinsert(v_r);
    if v_reason is null or v_reason = 'exists' then
      update hmart.trash
         set restored_at = coalesce(restored_at, now()),
             restored_by = v_by
       where id = v_id;
      v_restored := v_restored || jsonb_build_object('table', v_r.source_table, 'id', v_r.row_id, 'title', v_r.title);
    else
      v_skipped := v_skipped || jsonb_build_object('table', v_r.source_table, 'title', v_r.title, 'reason', v_reason);
    end if;
  end loop;

  return jsonb_build_object('restored', v_restored, 'skipped', v_skipped);
end
$$;

-- restore the latest trash entry of one row (used by the app's undo toast)
create or replace function hmart.trash_restore_row(p_table text, p_row_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select t.id into v_id
    from hmart.trash t
   where t.source_table = p_table and t.row_id = p_row_id and t.restored_at is null
     and hmart_private.trash_can_touch(t.user_id)
   order by t.deleted_at desc, t.id
   limit 1;
  if v_id is null then
    return jsonb_build_object('restored', '[]'::jsonb,
      'skipped', jsonb_build_array(jsonb_build_object('table', p_table, 'title', p_row_id, 'reason', 'not in the trash')));
  end if;
  return hmart.trash_restore(v_id, false);
end
$$;

-- ---------------------------------------------------------------- read

-- visible entries: open (not restored) rows whose parent is not also open.
-- Search covers title, detail and the titles of cascaded children; a child
-- match surfaces its entry with the child's title in `hits`.
create or replace function hmart.trash_search(
  p_q text default '',
  p_kind text default null,
  p_limit integer default 60,
  p_offset integer default 0)
returns table (
  id uuid,
  source_table text,
  row_id text,
  title text,
  detail text,
  context text,
  deleted_at timestamptz,
  deleted_by text,
  tx_id bigint,
  child_count integer,
  children jsonb,
  hits text[],
  batch_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive
  params as (
    select nullif(btrim(coalesce(p_q, '')), '') as q
  ),
  pat as (
    select p.q,
           '%' || replace(replace(replace(p.q, '\', '\\'), '%', '\%'), '_', '\_') || '%' as like_pat,
           websearch_to_tsquery('simple', coalesce(p.q, '')) as tsq
      from params p
  ),
  open_rows as (
    select t.* from hmart.trash t where t.restored_at is null
  ),
  visible as (
    select o.*, count(*) over (partition by o.tx_id, o.user_id)::int as batch_n
      from open_rows o
     where o.parent_trash_id is null
        or not exists (select 1 from open_rows p where p.id = o.parent_trash_id)
  ),
  matched as (
    select o.id, o.title, o.parent_trash_id
      from open_rows o, pat
     where pat.q is not null
       and (o.search @@ pat.tsq or o.title ilike pat.like_pat or o.detail ilike pat.like_pat)
  ),
  climb as (
    select m.id as hit_id, m.title as hit_title, m.id as cur, m.parent_trash_id as up
      from matched m
    union all
    select c.hit_id, c.hit_title, p.id, p.parent_trash_id
      from climb c
      join open_rows p on p.id = c.up
  ),
  entries as (
    select distinct c.hit_id, c.hit_title, c.cur as entry_id
      from climb c
      join visible v on v.id = c.cur
  ),
  picked as (
    select v.*
      from visible v, params
     where (p_kind is null or v.source_table = p_kind)
       and (params.q is null or exists (select 1 from entries e where e.entry_id = v.id))
     order by v.deleted_at desc, v.id
     limit greatest(coalesce(p_limit, 60), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select p.id, p.source_table, p.row_id, p.title, left(p.detail, 280),
         hmart_private.trash_context(p.data),
         p.deleted_at, p.deleted_by, p.tx_id,
         coalesce(d.n, 0)::int,
         coalesce(d.kinds, '{}'::jsonb),
         h.hits,
         p.batch_n
    from picked p
    left join lateral (
      with recursive down as (
        select c.id, c.source_table from open_rows c where c.parent_trash_id = p.id
        union all
        select c.id, c.source_table from open_rows c join down on c.parent_trash_id = down.id
      )
      select sum(k.cnt) as n, jsonb_object_agg(k.source_table, k.cnt) as kinds
        from (select down.source_table, count(*) as cnt from down group by down.source_table) k
    ) d on true
    left join lateral (
      select (array_agg(e.hit_title order by e.hit_title))[1:3] as hits
        from entries e
       where e.entry_id = p.id and e.hit_id <> p.id
    ) h on true
   order by p.deleted_at desc, p.id
$$;

create or replace function hmart.trash_kinds()
returns table (source_table text, n integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with open_rows as (
    select t.id, t.source_table, t.parent_trash_id from hmart.trash t where t.restored_at is null
  )
  select o.source_table, count(*)::int
    from open_rows o
   where o.parent_trash_id is null
      or not exists (select 1 from open_rows p where p.id = o.parent_trash_id)
   group by o.source_table
   order by count(*) desc, o.source_table
$$;

revoke all on function hmart.trash_restore(uuid, boolean) from public, anon;
revoke all on function hmart.trash_restore_row(text, text) from public, anon;
revoke all on function hmart.trash_search(text, text, integer, integer) from public, anon;
revoke all on function hmart.trash_kinds() from public, anon;
grant execute on function hmart.trash_restore(uuid, boolean) to authenticated, service_role;
grant execute on function hmart.trash_restore_row(text, text) to authenticated, service_role;
grant execute on function hmart.trash_search(text, text, integer, integer) to authenticated, service_role;
grant execute on function hmart.trash_kinds() to authenticated, service_role;
