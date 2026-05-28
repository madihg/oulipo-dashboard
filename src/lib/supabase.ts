import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing - the client will throw on first call. Copy .env.example to .env.local and fill in.",
  );
}

// Note: we deliberately type the client as `SupabaseClient` (any-schema) rather
// than `SupabaseClient<Database, "hmart">`. The strict generic version trips
// over supabase-js's expected GenericSchema shape (Views/Functions/etc.) and
// resolves table types to `never` at the write boundary. The runtime config
// `db.schema: "hmart"` still drives the Accept-Profile header on every request,
// so we get hmart-schema rows at runtime; we just attach the typed Row shapes
// at the call site instead of letting the generic infer them.
export const supabase: SupabaseClient<any, "hmart"> = createClient(
  url ?? "http://localhost:54321",
  anonKey ?? "anon",
  {
    db: { schema: "hmart" },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      storageKey: "hmart-kanban-auth",
      flowType: "pkce",
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  },
);
