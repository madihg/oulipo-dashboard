-- 0017_trash_backfill.sql
-- Things deleted before the trash existed, recovered from the backup tables
-- that earlier cleanups left behind. Only rows that are no longer live are
-- filed. deleted_at is the backup's date (they were deleted some time after),
-- deleted_by 'backup'. Each backup group gets its own synthetic negative tx_id
-- so "restore all" restores one group at a time.

-- posts removed after the 2026-07-07 share_items backup
with src as (
  select gen_random_uuid() as tid, b.*
    from hmart.share_items_backup_20260707 b
   where not exists (select 1 from hmart.share_items s where s.id = b.id)
     and not exists (select 1 from hmart.trash t
                      where t.source_table = 'share_items' and t.row_id = b.id::text)
)
insert into hmart.trash (id, user_id, source_table, row_id, title, detail, data,
                         root_id, tx_id, deleted_at, deleted_by, deleted_via)
select s.tid, s.user_id, 'share_items', s.id::text,
       coalesce(nullif(btrim(s.title), ''), '(untitled)'),
       left(coalesce(nullif(btrim(s.notes), ''), nullif(btrim(s.hook), '')), 2000),
       to_jsonb(s) - 'tid',
       s.tid, -20260707, '2026-07-07 00:00:00+00', 'backup',
       'backfill: share_items_backup_20260707'
  from src s;

-- curriculum checklist items trimmed on 2026-09-19 (lists moved to Docs)
with src as (
  select gen_random_uuid() as tid, b.id as todo_id, b.user_id, b.backed_up_at, e.item,
         dense_rank() over (order by b.id) as grp
    from hmart.todos_curriculum_backup_20260919 b
   cross join lateral jsonb_array_elements(b.checklist_snapshot) as e(item)
   where not exists (select 1 from hmart.checklist_items c where c.id = (e.item ->> 'id')::uuid)
     and not exists (select 1 from hmart.trash t
                      where t.source_table = 'checklist_items' and t.row_id = e.item ->> 'id')
)
insert into hmart.trash (id, user_id, source_table, row_id, title, detail, data,
                         root_id, tx_id, deleted_at, deleted_by, deleted_via)
select s.tid, s.user_id, 'checklist_items', s.item ->> 'id',
       coalesce(nullif(btrim(s.item ->> 'title'), ''), '(untitled)'),
       null, s.item,
       s.tid, -(2026091900 + s.grp), s.backed_up_at, 'backup',
       'backfill: todos_curriculum_backup_20260919'
  from src s;
