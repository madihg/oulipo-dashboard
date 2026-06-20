<script setup lang="ts">
import { computed, ref } from "vue";
import Popover from "./Popover.vue";
import type { TodoState } from "../types/database";
import {
  WHEN_OPTIONS,
  effectiveWhen,
  whenPatch,
  type WhenKey,
  type WhenPatch,
} from "../utils/when";

/**
 * Things-3-style "when" picker. Opens a Popover of quick options (today / this
 * evening / tomorrow / this weekend / a specific date / someday) plus clear.
 * Emits one bundled {state,start_date,evening} patch; the parent persists it in
 * a single updateTodo call (deadline is a separate control, never touched here).
 *
 * variant "editor": a labelled control inside TodoEditor.
 * variant "chip": a compact row affordance so any task can be dropped into Today
 * without opening the editor.
 */
const props = defineProps<{
  state: TodoState;
  startDate: string | null;
  evening: boolean;
  variant?: "editor" | "chip";
}>();
const emit = defineEmits<{ change: [patch: WhenPatch] }>();

const open = ref(false);
const showCustom = ref(false);
const customDate = ref("");

const eff = computed(() =>
  effectiveWhen({
    state: props.state,
    start_date: props.startDate,
    evening: props.evening,
  }),
);

function pick(key: WhenKey) {
  emit("change", whenPatch(key));
  open.value = false;
  showCustom.value = false;
}
function pickDate() {
  if (!customDate.value) return;
  emit("change", whenPatch("date", { date: customDate.value }));
  open.value = false;
  showCustom.value = false;
}
function toggle() {
  open.value = !open.value;
  if (open.value) {
    showCustom.value = false;
    customDate.value = props.startDate ?? "";
  }
}
</script>

<template>
  <div class="when-anchor" @click.stop>
    <button
      type="button"
      class="when-trigger"
      :class="[
        variant === 'chip' ? 'when-chip' : 'when-editor',
        !eff.key && 'when-empty',
      ]"
      :aria-expanded="open"
      aria-haspopup="true"
      :aria-label="eff.label ? `when: ${eff.label}` : 'set when'"
      :title="eff.label ? `when: ${eff.label}` : 'set when'"
      @click="toggle"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" class="when-ico">
        <rect x="3" y="4.5" width="18" height="16" rx="1.5" />
        <path d="M3 9h18M8 2.5v4M16 2.5v4" />
      </svg>
      <!-- On a row chip, stay icon-only when nothing is scheduled to keep dense
           rows uncluttered; the editor variant always shows a "when" label. -->
      <span v-if="eff.label || variant !== 'chip'">{{
        eff.label ?? "when"
      }}</span>
    </button>

    <!-- Editor chip sits at the left, so open the menu rightward; the dense-row
         chip sits at the right, so open it leftward. Keeps it on-screen. -->
    <Popover
      :open="open"
      :anchor="variant === 'chip' ? 'right' : 'left'"
      @close="open = false"
    >
      <button
        v-for="o in WHEN_OPTIONS"
        :key="o.key"
        type="button"
        class="when-opt"
        :class="{ 'when-opt-active': o.key === eff.key }"
        @click="pick(o.key)"
      >
        {{ o.label }}
      </button>

      <button
        type="button"
        class="when-opt"
        :class="{ 'when-opt-active': eff.key === 'date' }"
        @click="showCustom = !showCustom"
      >
        specific date…
      </button>
      <div v-if="showCustom" class="when-custom">
        <input
          v-model="customDate"
          type="date"
          class="when-date-input"
          @change="pickDate"
        />
      </div>

      <div class="when-sep" aria-hidden="true"></div>
      <button type="button" class="when-opt when-clear" @click="pick('clear')">
        clear
      </button>
    </Popover>
  </div>
</template>

<style scoped>
.when-anchor {
  position: relative;
  display: inline-flex;
}
.when-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.6875rem;
  text-transform: lowercase;
  letter-spacing: 0.02em;
  color: var(--sl-700);
  background: transparent;
  border: 1px solid var(--sl-200);
  border-radius: 2px;
  padding: 3px 7px;
  cursor: pointer;
  transition:
    background 150ms ease,
    color 150ms ease,
    border-color 150ms ease;
}
.when-trigger:hover {
  background: var(--sl-100);
  color: var(--sl-900);
}
.when-empty {
  color: var(--sl-400);
}
/* Row chip stays compact so dense rows don't grow taller. */
.when-chip {
  padding: 1px 5px;
  font-size: 0.625rem;
  gap: 4px;
}
.when-chip .when-ico {
  width: 11px;
  height: 11px;
}
.when-ico {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.when-opt {
  display: block;
  width: 100%;
  text-align: left;
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.6875rem;
  text-transform: lowercase;
  letter-spacing: 0.02em;
  color: var(--sl-800);
  background: transparent;
  border: 0;
  border-radius: 2px;
  padding: 6px 10px;
  cursor: pointer;
  transition: background 120ms ease;
}
.when-opt:hover {
  background: rgba(0, 0, 0, 0.04);
}
.when-opt-active {
  background: #000000;
  color: #ffffff;
}
.when-custom {
  padding: 4px 6px 6px;
}
.when-date-input {
  font: inherit;
  font-size: 0.75rem;
  color: var(--sl-800);
  background: transparent;
  border: 1px solid var(--sl-200);
  border-radius: 2px;
  padding: 3px 6px;
  width: 100%;
}
.when-sep {
  border-top: 1px solid var(--sl-200);
  margin: 4px 0;
}
.when-clear {
  color: var(--sl-500);
}
</style>
