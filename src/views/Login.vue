<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";

const { signInWithPassword, resetPassword, loading } = useAuth();
const router = useRouter();

const email = ref("");
const password = ref("");
const error = ref<string | null>(null);
const resetSent = ref(false);
const submitting = ref(false);

async function submit() {
  error.value = null;
  if (!email.value || !password.value) return;
  submitting.value = true;
  try {
    const { error: err } = await signInWithPassword(
      email.value,
      password.value,
    );
    if (err) {
      error.value = err.message;
      return;
    }
    void router.push("/today");
  } finally {
    submitting.value = false;
  }
}

async function forgot() {
  error.value = null;
  resetSent.value = false;
  if (!email.value) {
    error.value = "enter your email first";
    return;
  }
  const { error: err } = await resetPassword(email.value);
  if (err) {
    error.value = err.message;
    return;
  }
  resetSent.value = true;
}
</script>

<template>
  <section class="mt-s-7">
    <h2 class="font-title text-section lowercase">sign in</h2>
    <p
      class="mt-s-2 font-mono uppercase tracking-tracked text-caption text-text-tertiary"
    >
      email + password
    </p>

    <form class="mt-s-6 flex flex-col gap-s-4" @submit.prevent="submit">
      <label
        class="font-mono uppercase tracking-tracked text-meta text-text-secondary"
        for="email"
        >email</label
      >
      <input
        id="email"
        v-model="email"
        type="email"
        required
        autocomplete="email"
        class="border-b border-border-light bg-transparent py-s-2 text-base focus:outline-none focus-visible:outline focus-visible:outline-focus focus-visible:outline-acc-carnation"
      />

      <label
        class="font-mono uppercase tracking-tracked text-meta text-text-secondary mt-s-3"
        for="password"
        >password</label
      >
      <input
        id="password"
        v-model="password"
        type="password"
        required
        autocomplete="current-password"
        class="border-b border-border-light bg-transparent py-s-2 text-base focus:outline-none focus-visible:outline focus-visible:outline-focus focus-visible:outline-acc-carnation"
      />

      <button
        type="submit"
        class="self-start bg-text-primary text-bg px-s-5 py-s-3 font-body font-bold disabled:opacity-50"
        :disabled="loading || submitting || !email || !password"
      >
        {{ submitting ? "signing in..." : "sign in" }}
      </button>

      <button
        type="button"
        class="self-start font-mono uppercase tracking-tracked text-meta text-text-tertiary hover:text-text-primary"
        @click="forgot"
      >
        forgot password?
      </button>

      <p v-if="error" class="font-mono text-meta text-acc-carnation-text">
        {{ error }}
      </p>
      <p v-if="resetSent" class="font-mono text-meta text-text-secondary">
        reset link sent to {{ email }}. open it on this device.
      </p>
    </form>
  </section>
</template>
