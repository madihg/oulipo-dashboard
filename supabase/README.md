# supabase

Schema + seed for Hmart Kanban. Run via the Supabase CLI or the project's SQL editor.

## First-time setup

```bash
# 1. Create a free Supabase project at https://supabase.com/dashboard
#    -> Settings -> API to grab the URL + anon key.
# 2. Fill .env.local in the repo root with VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.
# 3. (Optional) link the CLI:
pnpm dlx supabase link --project-ref <your-project-ref>

# 4. Apply the schema:
pnpm dlx supabase db push
#    or paste migrations/0001_init.sql into the Supabase SQL editor manually.

# 5. Generate fresh TypeScript types (replaces src/types/database.ts):
pnpm dlx supabase gen types typescript --project-id <your-project-ref> \
  > ../src/types/database.ts

# 6. Sign in once via magic link in the app, then run seed.sql with your
#    auth.users.id substituted for REPLACE_WITH_YOUR_USER_ID.
```

## Layout

```
supabase/
  migrations/
    0001_init.sql    schema + RLS for areas/projects/headings/todos/checklist_items/tags/todo_tags/repeating_rules/captures/claude_tasks/picker_runs/memory_entries
  seed.sql           Halim's 8 areas + projects (run after first sign-in)
```

## Edge Functions

To be added in US-013 (route_capture), US-014 (memory_enricher), US-015 (10 pickers + synth + archive), US-016 (draft_for_todo), US-011 (tick_repeating). Each will live under `supabase/functions/<name>/index.ts` and deploy via `pnpm dlx supabase functions deploy <name>`.
