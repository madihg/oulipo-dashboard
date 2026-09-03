<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useToastStore } from "../stores/toast";

const store = useToastStore();
const { toasts } = storeToRefs(store);
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed bottom-s-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-s-2 pointer-events-none"
    >
      <div
        v-for="t in toasts"
        :key="t.id"
        class="bg-text-primary text-bg px-s-4 py-s-3 flex items-center gap-s-4 pointer-events-auto shadow-lg"
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
          <span class="font-mono uppercase tracking-tracked text-meta tb-act">
            {{ t.action.label }} ›
          </span>
        </button>
        <span v-else class="text-base">{{ t.message }}</span>
        <button
          class="font-mono uppercase tracking-tracked text-meta opacity-60 interactive"
          aria-label="dismiss"
          @click="store.dismiss(t.id)"
        >
          ×
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
.tb-act {
  opacity: 0.7;
}
.tb-msg:hover .tb-act {
  opacity: 1;
}
</style>
