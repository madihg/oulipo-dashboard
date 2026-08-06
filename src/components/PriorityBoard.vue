<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useBoardsStore } from "../stores/boards";
import type { BoardKind, BoardNoteRow } from "../types/database";

/**
 * Priority board on Today: a weekly-goals field + week / quarter / year
 * priority sticky notes (3 max each). Collapsible so it never crowds the task
 * list; state persists in localStorage. (The rotating mindset post-it was
 * removed 2026-07-29 per Halim - "doesn't look proper right now"; the boards
 * store still loads the data if it ever returns.)
 */

const store = useBoardsStore();

// Default: open on desktop, COLLAPSED on phones (no stored choice yet) - the
// expanded board pushed Today's first task ~400px down a fresh phone screen.
// An explicit toggle is stored either way and always wins.
const storedCollapsed = localStorage.getItem("today-board-collapsed");
const collapsed = ref(
  storedCollapsed === null
    ? window.matchMedia("(max-width: 600px)").matches
    : storedCollapsed === "1",
);
function toggleCollapsed() {
  collapsed.value = !collapsed.value;
  localStorage.setItem("today-board-collapsed", collapsed.value ? "1" : "0");
}

const LISTS: Array<{ board: BoardKind; label: string }> = [
  { board: "week", label: "this week" },
  { board: "quarter", label: "this quarter" },
  { board: "year", label: "this year" },
];

// Weekly goals: local draft, synced from the store, committed on blur.
const weekGoals = ref("");
const goalsEl = ref<HTMLTextAreaElement | null>(null);

// iOS Safari ignores `resize: vertical` on a textarea - there is no drag handle
// on a phone - so the field grows to fit its own content instead. Desktop keeps
// the manual handle as well.
const GOALS_MIN_PX = 64;
function autogrowGoals() {
  const el = goalsEl.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.max(el.scrollHeight, GOALS_MIN_PX)}px`;
}

watch(
  () => store.weekGoals,
  (v) => {
    weekGoals.value = v;
    void nextTick(autogrowGoals);
  },
  { immediate: true },
);
// Same persistence contract as task notes: blur alone loses text whenever the
// phone does not deliver one (swiping home, locking, the section collapsing).
// Debounce while typing, and flush on unmount / page-hide.
const GOALS_DEBOUNCE_MS = 800;
let goalsTimer: ReturnType<typeof setTimeout> | null = null;
function clearGoalsTimer() {
  if (goalsTimer) {
    clearTimeout(goalsTimer);
    goalsTimer = null;
  }
}
function flushGoals() {
  clearGoalsTimer();
  void store.saveWeekGoals(weekGoals.value);
}
function onGoalsInput() {
  autogrowGoals();
  clearGoalsTimer();
  goalsTimer = setTimeout(flushGoals, GOALS_DEBOUNCE_MS);
}
function onGoalsPageHidden() {
  if (document.visibilityState === "hidden") flushGoals();
}

onMounted(() => {
  void nextTick(autogrowGoals);
  window.addEventListener("visibilitychange", onGoalsPageHidden);
  window.addEventListener("pagehide", flushGoals);
});
onBeforeUnmount(() => {
  window.removeEventListener("visibilitychange", onGoalsPageHidden);
  window.removeEventListener("pagehide", flushGoals);
  flushGoals();
});
// Re-fit when the section is expanded back open.
watch(collapsed, (v) => {
  if (!v) void nextTick(autogrowGoals);
  else flushGoals();
});

const itemRefs = ref<Record<string, HTMLInputElement | null>>({});

async function addNote(board: BoardKind) {
  const row = await store.addNote(board, "");
  if (row) {
    await nextTick();
    itemRefs.value[row.id]?.focus();
  }
}
function commitNote(n: BoardNoteRow) {
  if (!n.body.trim()) void store.removeNote(n.id);
  else void store.updateNote(n.id, n.body.trim());
}
</script>

<template>
  <section class="pb">
    <button
      type="button"
      class="pb-toggle interactive"
      :aria-expanded="!collapsed"
      @click="toggleCollapsed"
    >
      <span class="pb-chev" :class="{ 'pb-chev-open': !collapsed }">›</span>
      focus
    </button>

    <div v-if="!collapsed" class="pb-body">
      <!-- Weekly goals -->
      <div class="pb-goals">
        <p class="pb-label">this week's goals</p>
        <textarea
          ref="goalsEl"
          v-model="weekGoals"
          class="pb-goals-input"
          rows="2"
          placeholder="what does a good week look like?"
          @input="onGoalsInput"
          @blur="flushGoals"
        />
      </div>

      <!-- Priority sticky lists -->
      <div class="pb-grid">
        <div v-for="l in LISTS" :key="l.board" class="pb-note">
          <div class="pb-note-head">
            <span class="pb-label">{{ l.label }}</span>
            <span class="pb-count">{{ store.notesFor(l.board).length }}/3</span>
          </div>
          <div v-for="n in store.notesFor(l.board)" :key="n.id" class="pb-item">
            <span class="pb-bullet" aria-hidden="true"></span>
            <input
              :ref="(el) => (itemRefs[n.id] = el as HTMLInputElement | null)"
              v-model="n.body"
              class="pb-item-input"
              placeholder="a priority…"
              @blur="commitNote(n)"
              @keydown.enter.prevent="commitNote(n)"
            />
            <button
              type="button"
              class="pb-item-del interactive"
              aria-label="remove"
              @click="store.removeNote(n.id)"
            >
              ×
            </button>
          </div>
          <button
            v-if="store.canAdd(l.board)"
            type="button"
            class="pb-add interactive"
            @click="addNote(l.board)"
          >
            + add
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pb {
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--sl-200);
}
.pb-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--sl-600);
  background: transparent;
  border: 0;
  cursor: pointer;
  padding: 2px 0;
}
.pb-toggle:hover {
  color: var(--sl-900);
}
.pb-chev {
  display: inline-block;
  transition: transform 120ms ease;
}
.pb-chev-open {
  transform: rotate(90deg);
}
.pb-body {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.pb-label {
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-500);
}
.pb-goals-input {
  width: 100%;
  margin-top: 4px;
  background: var(--ground-2);
  border: 1px solid var(--hair);
  border-radius: 2px;
  padding: 8px 10px;
  font-family: var(--font-body);
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--sl-900);
  resize: vertical;
  outline: none;
  min-height: 64px;
  overflow: hidden;
}
@media (max-width: 600px) {
  /* No drag handle exists on iOS, so the field sizes itself to the content
     (autogrowGoals). Allow a manual drag anyway where the platform supports it. */
  .pb-goals-input {
    max-height: 60vh;
    overflow-y: auto;
  }
}
.pb-goals-input:focus {
  border-color: var(--cobalt);
}
.pb-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
@media (max-width: 900px) {
  .pb-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 600px) {
  .pb-grid {
    grid-template-columns: 1fr;
  }
}
.pb-note {
  background: var(--ground-2);
  border: 1px solid var(--hair);
  border-radius: 2px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 84px;
}
.pb-note-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
}
.pb-count {
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: 0.5625rem;
  color: var(--sl-400);
}
.pb-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pb-bullet {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--cobalt);
  flex-shrink: 0;
}
.pb-item-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  border-bottom: 1px solid transparent;
  padding: 1px 0;
  font-size: 0.8125rem;
  color: var(--sl-900);
  outline: none;
}
.pb-item-input:focus {
  border-bottom-color: var(--hair);
}
.pb-item-del {
  color: var(--sl-400);
  background: transparent;
  border: 0;
  font-size: 0.9rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.pb-item-del:hover {
  color: var(--acc-versus-text);
}
.pb-add {
  align-self: flex-start;
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: 0.5625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--cobalt);
  background: transparent;
  border: 0;
  cursor: pointer;
  padding: 2px 0;
}
</style>
