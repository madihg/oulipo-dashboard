-- Context layer: every scope can carry BOTH local instructions (kind
-- 'project_rule', already exists) and a running context note - a wiki
-- (new kind 'wiki'). Scope convention (already in use for rules):
--   'global' | 'area:<slug>' | 'project:<slug>'
-- Resolution order everywhere is global -> area -> project, most specific
-- last (readers treat later layers as overriding earlier ones).
alter type hmart.memory_kind add value if not exists 'wiki';

-- Scoped context pulls filter on exactly these three columns.
create index if not exists memory_entries_user_kind_scope
  on hmart.memory_entries (user_id, kind, scope);
