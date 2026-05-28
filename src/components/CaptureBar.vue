<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { enqueue, flush } from "../lib/captureQueue";
import { useToastStore } from "../stores/toast";

const open = ref(false);
const text = ref("");
const submitting = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);

const toast = useToastStore();

function openBar() {
  open.value = true;
  text.value = "";
  void nextTick(() => inputEl.value?.focus());
}
function close() {
  open.value = false;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && open.value) {
    e.preventDefault();
    close();
    return;
  }
  // `c` to open capture, but ignore when user is typing in another input
  const target = e.target as HTMLElement | null;
  const tag = target?.tagName;
  if (
    !open.value &&
    e.key === "c" &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    tag !== "INPUT" &&
    tag !== "TEXTAREA" &&
    !(target as HTMLElement | null)?.isContentEditable
  ) {
    e.preventDefault();
    openBar();
  }
}

async function submit() {
  const t = text.value.trim();
  if (!t || submitting.value) return;
  submitting.value = true;
  try {
    await enqueue(t, "web");
    toast.show("captured. claude is sorting it.");
    text.value = "";
    close();
    void flush();
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  void flush();
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

defineExpose({ open: openBar });
</script>

<template>
  <Teleport to="body">
    <!-- Sticky FAB - desktop only; on mobile the bottom tab bar's + handles capture -->
    <button
      v-if="!open"
      class="fixed bottom-s-5 right-s-5 z-40 w-12 h-12 bg-text-primary text-bg rounded-full shadow-lg hidden md:flex items-center justify-center text-xl interactive"
      title="capture (c)"
      aria-label="capture"
      @click="openBar"
    >
      +
    </button>

    <!-- Capture sheet -->
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:pt-s-8 px-s-4"
      role="dialog"
      aria-modal="true"
      aria-label="capture"
      @click.self="close"
    >
      <div
        class="absolute inset-0 bg-text-primary/30"
        aria-hidden="true"
        @click="close"
      ></div>
      <form
        class="relative w-full max-w-xl bg-bg border border-border-light shadow-xl p-s-5"
        @submit.prevent="submit"
      >
        <p
          class="font-mono uppercase tracking-tracked text-meta text-text-tertiary mb-s-3"
        >
          inbox capture · routed by claude
        </p>
        <input
          ref="inputEl"
          v-model="text"
          type="text"
          class="input-bare text-base"
          placeholder="just type what's in your head"
          autocomplete="off"
          :disabled="submitting"
        />
        <div
          class="mt-s-3 flex items-center justify-between font-mono uppercase tracking-tracked text-meta text-text-tertiary"
        >
          <span>esc to cancel</span>
          <button
            type="submit"
            class="bg-text-primary text-bg px-s-4 py-s-2 lowercase"
            :disabled="submitting || !text.trim()"
          >
            {{ submitting ? "sending…" : "capture (return)" }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
