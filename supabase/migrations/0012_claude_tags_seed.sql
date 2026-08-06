-- 0012: seed the claude routine's system tags and backfill todo_tags from
-- metadata.claude. The tags/todo_tags tables themselves are from 0001; this
-- makes them live. Idempotent - safe to re-run.

-- join-path indexes (the app now hydrates tags on every todo load)
create index if not exists todo_tags_todo_id_idx on hmart.todo_tags (todo_id);
create index if not exists todo_tags_tag_id_idx on hmart.todo_tags (tag_id);

-- system tags, per user that has todos
insert into hmart.tags (user_id, name)
select u.user_id, v.name
from (select distinct user_id from hmart.todos) u
cross join (
  values ('suggested'), ('task'), ('offer'), ('decision'), ('claude-delivered')
) as v(name)
on conflict (user_id, name) do nothing;

-- every claude suggestion carries 'suggested'
insert into hmart.todo_tags (todo_id, tag_id)
select t.id, tg.id
from hmart.todos t
join hmart.tags tg on tg.user_id = t.user_id and tg.name = 'suggested'
where t.metadata->'claude'->>'suggested' = 'true'
on conflict do nothing;

-- ... plus its kind as a tag
insert into hmart.todo_tags (todo_id, tag_id)
select t.id, tg.id
from hmart.todos t
join hmart.tags tg
  on tg.user_id = t.user_id
 and tg.name = t.metadata->'claude'->>'kind'
where t.metadata->'claude'->>'suggested' = 'true'
  and t.metadata->'claude'->>'kind' in ('task', 'offer', 'decision')
on conflict do nothing;

-- 'claude-delivered' marks rows where claude already produced the work
insert into hmart.todo_tags (todo_id, tag_id)
select t.id, tg.id
from hmart.todos t
join hmart.tags tg on tg.user_id = t.user_id and tg.name = 'claude-delivered'
where t.metadata->'claude'->>'status' = 'done'
   or t.metadata->'claude'->>'acted' = 'true'
on conflict do nothing;
