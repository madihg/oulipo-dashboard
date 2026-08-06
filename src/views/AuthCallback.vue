<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "../lib/supabase";

/**
 * Lands every Supabase auth redirect: magic links, OAuth, and password
 * recovery. Recovery links used to fall through the generic path - the user
 * clicked "forgot password?", got signed in, and was routed to /today with no
 * chance to actually SET a new password, so the next session expiry locked
 * them out again. Now a recovery link shows a new-password form first.
 */

const router = useRouter();
const error = ref<string | null>(null);

// Capture the recovery marker SYNCHRONOUSLY at setup - detectSessionInUrl
// consumes and strips the hash soon after, so a later read would miss it.
const isRecovery =
  typeof window !== "undefined" &&
  (window.location.hash.includes("type=recovery") ||
    window.location.search.includes("type=recovery"));

const mode = ref<"working" | "set-password" | "done">("working");
const newPassword = ref("");
const confirmPassword = ref("");
const saving = ref(false);

let authSub: { unsubscribe: () => void } | null = null;

onMounted(async () => {
  // Belt and suspenders: the SDK fires PASSWORD_RECOVERY when it processes a
  // recovery link, even if the hash was consumed before we could read it.
  authSub = supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") mode.value = "set-password";
  }).data.subscription;

  try {
    const { data, error: err } = await supabase.auth.getSession();
    if (err) throw err;
    if (data.session) {
      if (isRecovery) {
        mode.value = "set-password";
        return;
      }
      if (mode.value === "working") void router.replace("/today");
      return;
    }
    // Session may land a beat after the redirect - try once more.
    setTimeout(async () => {
      const { data: d2 } = await supabase.auth.getSession();
      if (!d2.session) {
        void router.replace("/login");
        return;
      }
      if (isRecovery) mode.value = "set-password";
      else if (mode.value === "working") void router.replace("/today");
    }, 400);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
});
onBeforeUnmount(() => authSub?.unsubscribe());

async function savePassword() {
  error.value = null;
  if (newPassword.value.length < 8) {
    error.value = "use at least 8 characters";
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = "passwords don't match";
    return;
  }
  saving.value = true;
  try {
    const { error: err } = await supabase.auth.updateUser({
      password: newPassword.value,
    });
    if (err) throw err;
    mode.value = "done";
    setTimeout(() => void router.replace("/today"), 900);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="mt-s-7 max-w-sm">
    <template v-if="mode === 'set-password'">
      <h2 class="font-title text-section lowercase">set a new password</h2>
      <p
        class="mt-s-2 font-mono uppercase tracking-tracked text-meta text-text-tertiary"
      >
        you're signed in via the reset link - pick the new password now
      </p>
      <form class="mt-s-5 flex flex-col gap-s-4" @submit.prevent="savePassword">
        <label
          class="font-mono uppercase tracking-tracked text-meta text-text-tertiary"
        >
          new password
          <input
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            class="input-bare"
            autofocus
          />
        </label>
        <label
          class="font-mono uppercase tracking-tracked text-meta text-text-tertiary"
        >
          confirm it
          <input
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            class="input-bare"
          />
        </label>
        <button
          type="submit"
          class="self-start bg-text-primary text-bg px-s-5 py-s-2 lowercase interactive"
          :disabled="saving"
        >
          {{ saving ? "saving…" : "save password" }}
        </button>
      </form>
    </template>

    <p
      v-else-if="mode === 'done'"
      class="font-mono uppercase tracking-tracked text-caption text-text-secondary"
    >
      password updated - taking you in…
    </p>

    <p
      v-else-if="!error"
      class="font-mono uppercase tracking-tracked text-caption text-text-tertiary"
    >
      signing you in...
    </p>

    <p v-if="error" class="mt-s-3 font-mono text-meta text-acc-versus-text">
      {{ error }}
    </p>
  </section>
</template>
