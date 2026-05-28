<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "../lib/supabase";

const router = useRouter();
const error = ref<string | null>(null);

onMounted(async () => {
  // Supabase JS auto-detects the OTP / PKCE code in the URL via
  // detectSessionInUrl. We just wait a tick for the session to land, then
  // route to /today (or /login on failure).
  try {
    const { data, error: err } = await supabase.auth.getSession();
    if (err) throw err;
    if (data.session) {
      void router.replace("/today");
      return;
    }
    // Fallback: try one more time after a short pause.
    setTimeout(async () => {
      const { data: d2 } = await supabase.auth.getSession();
      void router.replace(d2.session ? "/today" : "/login");
    }, 400);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
});
</script>

<template>
  <section class="mt-s-7">
    <p
      v-if="!error"
      class="font-mono uppercase tracking-tracked text-caption text-text-tertiary"
    >
      signing you in...
    </p>
    <p v-else class="font-mono text-meta text-acc-carnation-text">
      {{ error }}
    </p>
  </section>
</template>
