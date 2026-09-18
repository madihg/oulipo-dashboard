-- Effort: the t-shirt size of a task, so a list can be cut down to what fits
-- the time or the energy at hand. One value per task, like priority, so it is
-- a column and not a tag. Null = unsized. Applied 2026-09-18.
alter table hmart.todos
  add column if not exists effort text
  check (effort is null or effort in ('S', 'M', 'L', 'XL'));

comment on column hmart.todos.effort is
  'T-shirt size of the work. S = minutes, M = under an hour, L = half a day, XL = a day or more. Null = unsized.';
