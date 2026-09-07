<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useToastStore } from "../stores/toast";

const store = useToastStore();
const { toasts } = storeToRefs(store);
</script>

<template>
  <Teleport to="body">
    <!-- A polite live region: with an action, the toast is the only way
         back, so a screen reader has to hear it before the six seconds
         run out. -->
    <div
      role="status"
      aria-live="polite"
      class="fixed bottom-s-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-s-2 pointer-events-none"
    >
      <div
        v-for="t in toasts"
        :key="t.id"
        class="bg-text-primary text-bg px-s-4 py-s-3 flex items-center gap-s-4 pointer-events-auto"
      >
        <!-- With an action, the message itself is the target: a toast is a
             small moving thing, and a separate 4-letter label inside it is a
             harder tap than the toast. -->
        <button
          v-if="t.action"
          type="button"
          class="text-base text-left interactive tb-msg"
          @click="store.runAction(t.id)"
        >
          {{ t.message }}
          <span class="cap tb-act">{{ t.action.label }}</span>
        </button>
        <span v-else class="text-base">{{ t.message }}</span>
        <button
          type="button"
          class="tb-x"
          aria-label="dismiss"
          @click="store.dismiss(t.id)"
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
          </svg>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tb-msg {
  background: transparent;
  border: 0;
  padding: 0;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
}
/* The caption inherits the toast's paper-on-ink colour. */
.tb-act {
  color: inherit;
  opacity: 0.7;
}
.tb-msg:hover .tb-act {
  opacity: 1;
}
.tb-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.tb-x svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
}
.tb-x:hover {
  opacity: 1;
}
@media (pointer: coarse) {
  .tb-msg,
  .tb-x {
    min-height: 32px;
  }
  .tb-x {
    min-width: 32px;
  }
}
</style>
