<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useVaultStore } from "../stores/vault";
import { useToastStore } from "../stores/toast";
import type { TodoRow } from "../types/database";
import TodoEditor from "./TodoEditor.vue";

/**
 * New-task sheet - opens at the top into the full editor immediately.
 *
 * Opening creates a draft task (placeholder title, inbox) and shows the full
 * TodoEditor right away: title (autofocused + selected so typing replaces the
 * placeholder), notes, area/priority/deadline, checklist - everything ready on
 * one surface, like the command palette. Every field autosaves. An untouched
 * draft is discarded on close.
 */

const open = ref(false);
const submitting = ref(false);
const created = ref<TodoRow | null>(null);
const editorRef = ref<InstanceType<typeof TodoEditor> | null>(null);
// iOS keyboard primer - see openBar().
const primeEl = ref<HTMLInputElement | null>(null);

const vault = useVaultStore();
const toast = useToastStore();

const PLACEHOLDER = "new task";

// Open straight into the full editor on a freshly-created draft (inbox). The
// editor autofocuses + selects the placeholder title so the first keystroke
// replaces it, and every field autosaves - same one-surface feel as the command
// palette. An untouched draft (still the placeholder, no notes/area) is
// discarded on close. created.value stays live: updateTodo mutates in place.
async function openBar() {
  if (submitting.value) return;
  // iOS only raises the on-screen keyboard when focus happens synchronously
  // inside the user gesture. createTodo is async, so we focus a real (offscreen)
  // input right now - the keyboard comes up immediately and stays up across the
  // await, then hands off to the title field when the editor mounts.
  primeEl.value?.focus();
  submitting.value = true;
  open.value = true;
  void vault.loadAreasAndProjects();
  try {
    const row = await vault.createTodo({ title: PLACEHOLDER, state: "inbox" });
    if (row) {
      created.value = row;
    } else {
      toast.show("couldn't start a task - try again");
      open.value = false;
    }
  } finally {
    submitting.value = false;
  }
}

async function discardIfEmpty() {
  const row = created.value;
  if (!row) return;
  const t = (row.title ?? "").trim();
  // Read the editor's live text, not just row.notes: the optimistic mirror may
  // not have reached this particular object, and deleting a task the user just
  // wrote notes into is unrecoverable.
  const typedNotes = editorRef.value?.currentNotes?.() ?? row.notes ?? "";
  const untouched =
    (t === "" || t === PLACEHOLDER) &&
    !typedNotes.trim() &&
    !(row.notes ?? "").trim() &&
    !row.area_id &&
    !row.project_id &&
    !row.deadline &&
    !row.priority;
  if (untouched) await vault.deleteTodo(row);
}

async function close() {
  // Flush pending notes, but do NOT await the network - flushNotes stages the
  // patch synchronously, so the text is durable the moment this returns.
  // Awaiting the round trip made "done" / Escape / click-out feel dead on a
  // slow link, and hang outright on lie-fi.
  void editorRef.value?.flush();
  await discardIfEmpty();
  open.value = false;
  created.value = null;
}

function onKeydown(e: KeyboardEvent) {
  // Escape closes the sheet. Opening via `c` is owned by the global keyboard
  // registrar (useKeyboardShortcuts) so there's a single source of truth.
  if (e.key === "Escape" && open.value) {
    e.preventDefault();
    close();
  }
}

function done() {
  void close();
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

defineExpose({ open: openBar });
</script>

<template>
  <Teleport to="body">
    <!-- iOS keyboard primer: always-present offscreen input focused on tap so
         the on-screen keyboard rises before the async draft is created. -->
    <input
      ref="primeEl"
      class="capture-prime"
      type="text"
      tabindex="-1"
      aria-hidden="true"
    />

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

    <!-- New-task sheet: top-aligned on every screen, full editor immediately -->
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-start justify-center px-s-4 pt-[max(env(safe-area-inset-top),1rem)] overflow-y-auto"
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

      <div
        v-if="created"
        class="relative w-full max-w-xl bg-bg border border-border-light p-s-5 mb-s-8 max-h-[85vh] overflow-y-auto"
      >
        <div class="flex items-center justify-between mb-s-3">
          <p
            class="font-mono uppercase tracking-tracked text-meta text-text-tertiary"
          >
            new task · saved automatically
          </p>
          <button
            class="font-mono text-meta uppercase tracking-tracked text-text-tertiary interactive"
            @click="done"
          >
            done
          </button>
        </div>
        <TodoEditor
          ref="editorRef"
          :todo="created"
          :autofocus-title="true"
          @close="done"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Offscreen but focusable (not display:none/visibility:hidden, which block
   focus). 16px font-size avoids iOS input zoom; pointer-events:none so it never
   intercepts a tap. */
.capture-prime {
  position: fixed;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: 0;
  border: 0;
  opacity: 0;
  font-size: 16px;
  pointer-events: none;
}
</style>
