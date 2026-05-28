-- =============================================================================
-- 0006_5x4_autorefill: Postgres trigger that fires the network picker via
-- pg_net when completing a 5-x-4 todo drops the project's open count below 5.
--
-- Reads two database-level settings, set out-of-band:
--   ALTER DATABASE postgres SET app.area_picker_url = '<edge function url>';
--   ALTER DATABASE postgres SET app.anon_key       = '<anon jwt>';
--
-- If either is unset (or pg_net isn't enabled), the trigger no-ops silently.
-- The picker also enforces a count gate so this trigger firing redundantly is
-- safe.
-- =============================================================================

create extension if not exists pg_net;

create or replace function hmart.tg_5x4_autorefill() returns trigger
language plpgsql security definer as $$
declare
  five_x_four_id uuid;
  open_count int;
  fn_url text := current_setting('app.area_picker_url', true);
  anon_key text := current_setting('app.anon_key', true);
begin
  -- Only react to state transitioning INTO completed.
  if NEW.state <> 'completed' or OLD.state = 'completed' then
    return NEW;
  end if;

  -- Resolve the 5-x-4 project for this user. Skip if the completed todo
  -- isn't attached to it.
  select id into five_x_four_id
  from hmart.projects
  where user_id = NEW.user_id and slug = '5-x-4'
  limit 1;

  if five_x_four_id is null
     or NEW.project_id is null
     or NEW.project_id <> five_x_four_id then
    return NEW;
  end if;

  -- Count remaining open todos in 5-x-4.
  select count(*) into open_count
  from hmart.todos
  where user_id = NEW.user_id
    and project_id = five_x_four_id
    and state in ('inbox','today','anytime','upcoming','someday');

  if open_count < 5 and fn_url is not null and anon_key is not null then
    perform net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object('area', 'network', 'source', 'auto')
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists todos_5x4_autorefill on hmart.todos;
create trigger todos_5x4_autorefill
  after update on hmart.todos
  for each row execute function hmart.tg_5x4_autorefill();
