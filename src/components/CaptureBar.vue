<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useVaultStore } from "../stores/vault";
import { useToastStore } from "../stores/toast";
import type { TodoRow } from "../types/database";
import TodoEditor from "./TodoEditor.vue";

/**
 * Capture sheet - creates a real task directly.
 *
 * Step 1 ("name"): type the task title and hit return. The task is created
 * immediately in the inbox (the default destination until it's filed to an
 * area). Step 2 ("edit"): the full TodoEditor opens on the freshly-created
 * task so area / priority / deadline / notes / checklist / tags can be set;
 * assigning an area files it out of the inbox. Every field autosaves.
 *
 * (Claude inbox routing is intentionally not wired here yet - we create proper
 * tasks now and will revisit AI triage separately.)
 */

const open = ref(false);
const step = ref<"name" | "edit">("name");
const title = ref("");
const submitting = ref(false);
const created = ref<TodoRow | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);

const vault = useVaultStore();
const toast = useToastStore();

function openBar() {
  open.value = true;
  step.value = "name";
  title.value = "";
  created.value = null;
  // Make sure the editor's area/project pickers have data to show.
  void vault.loadAreasAndProjects();
  void nextTick(() => inputEl.value?.focus());
}

function close() {
  open.value = false;
  step.value = "name";
  created.value = null;
  title.value = "";
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
    !target?.isContentEditable
  ) {
    e.preventDefault();
    openBar();
  }
}

async function createTask() {
  const t = title.value.trim();
  if (!t || submitting.value) return;
  submitting.value = true;
  try {
    const row = await vault.createTodo({ title: t, state: "inbox" });
    if (row) {
      created.value = row;
      step.value = "edit";
    } else {
      toast.show("couldn't create task — try again");
    }
  } finally {
    submitting.value = false;
  }
}

function done() {
  toast.show("task saved");
  close();
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
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
      title="new task (c)"
      aria-label="new task"
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
      aria-label="new task"
      @click.self="close"
    >
      <div
        class="absolute inset-0 bg-text-primary/30"
        aria-hidden="true"
        @click="close"
      ></div>

      <!-- Step 1: name the task -->
      <form
        v-if="step === 'name'"
        class="relative w-full max-w-xl bg-bg border border-border-light shadow-xl p-s-5"
        @submit.prevent="createTask"
      >
        <p
          class="font-mono uppercase tracking-tracked text-meta text-text-tertiary mb-s-3"
        >
          new task
        </p>
        <input
          ref="inputEl"
          v-model="title"
          type="text"
          class="input-bare text-base"
          placeholder="what needs doing?"
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
            :disabled="submitting || !title.trim()"
          >
            {{ submitting ? "creating…" : "add details (return)" }}
          </button>
        </div>
      </form>

      <!-- Step 2: full editor on the freshly-created task -->
      <div
        v-else-if="created"
        class="relative w-full max-w-xl bg-bg border border-border-light shadow-xl p-s-5 max-h-[85vh] overflow-y-auto"
      >
        <div class="flex items-center justify-between mb-s-3">
          <p
            class="font-mono uppercase tracking-tracked text-meta text-text-tertiary"
          >
            add details · saved automatically
          </p>
          <button
            class="font-mono text-meta uppercase tracking-tracked text-text-tertiary interactive"
            @click="done"
          >
            done
          </button>
        </div>
        <TodoEditor :todo="created" @close="done" />
      </div>
    </div>
  </Teleport>
</template>
