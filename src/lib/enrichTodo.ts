import { supabase } from "./supabase";

/**
 * Fire-and-forget AI enrichment of a freshly-created todo. Mirrors the capture
 * router invoke: never awaited by the caller, never throws. The edge function
 * appends a "suggested" notes block / infers a deadline server-side and the
 * change streams back via realtime. If the function or the API key is absent,
 * this quietly no-ops and the todo is unharmed.
 */
export async function invokeEnrich(todoId: string): Promise<void> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enrich_todo`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ todo_id: todoId }),
      },
    );
  } catch (e) {
    console.warn("[enrich] invoke failed (todo is unaffected)", e);
  }
}
