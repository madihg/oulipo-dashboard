<script setup lang="ts">
import { computed, ref } from "vue";
import Popover from "./Popover.vue";
import WhenPanel from "./WhenPanel.vue";
import WhenSheet from "./WhenSheet.vue";
import { useIsPhone } from "../composables/useMediaQuery";
import type { TodoState } from "../types/database";
import { effectiveWhen, type WhenPatch } from "../utils/when";

/**
 * Things-3-style "when" picker. The trigger is a chip; the body (WhenPanel) is
 * quick rows around one continuous scrolling calendar. Emits a single bundled
 * {state,start_date,evening} patch, which the parent persists in one
 * updateTodo call. deadline is a separate control and is never touched here.
 *
 * Two surfaces, same panel: an anchored popover on a laptop, a bottom sheet
 * under 767px where an anchored menu cannot give seven columns a finger-sized
 * target.
 *
 * variant "editor": a labelled control inside TodoEditor.
 * variant "chip": a compact row affordance so any task can be scheduled
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
const isPhone = useIsPhone();

const eff = computed(() =>
  effectiveWhen({
    state: props.state,
    start_date: props.startDate,
    evening: props.evening,
  }),
);

function apply(patch: WhenPatch) {
  emit("change", patch);
}
function toggle() {
  open.value = !open.value;
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
         chip sits at the right, so open it leftward. Keeps it on-screen.
         Popover must stay a DIRECT child of .when-anchor: it measures against
         its own parentElement. -->
    <Popover
      v-if="!isPhone"
      :open="open"
      :anchor="variant === 'chip' ? 'right' : 'left'"
      @close="open = false"
    >
      <WhenPanel
        :state="state"
        :start-date="startDate"
        :evening="evening"
        @pick="apply"
        @close="open = false"
      />
    </Popover>

    <WhenSheet v-else :open="open" @close="open = false">
      <WhenPanel
        sheet
        :state="state"
        :start-date="startDate"
        :evening="evening"
        @pick="apply"
        @close="open = false"
      />
    </WhenSheet>
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
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
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
</style>
