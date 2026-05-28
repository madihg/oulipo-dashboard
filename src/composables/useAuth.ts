import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

const user = ref<User | null>(null);
const session = ref<Session | null>(null);
const loading = ref(true);
let initialized = false;

export function useAuth() {
  onMounted(async () => {
    if (initialized) return;
    initialized = true;
    try {
      const { data } = await supabase.auth.getSession();
      session.value = data.session;
      user.value = data.session?.user ?? null;
    } finally {
      loading.value = false;
    }
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      session.value = s;
      user.value = s?.user ?? null;
    });
    onBeforeUnmount(() => sub.subscription.unsubscribe());
  });

  return {
    user: computed(() => user.value),
    session: computed(() => session.value),
    loading: computed(() => loading.value),
    isAuthed: computed(() => !!user.value),
    signInWithPassword: async (email: string, password: string) => {
      return supabase.auth.signInWithPassword({ email, password });
    },
    /** Kept as a fallback if we ever want to issue magic links again. */
    signInWithMagicLink: async (email: string) => {
      return supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
    },
    resetPassword: async (email: string) => {
      return supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
}
