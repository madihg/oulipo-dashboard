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
        <span class="text-base">{{ t.message }}</span>
        <button
          v-if="t.action"
          class="font-mono uppercase tracking-tracked text-meta interactive"
          @click="store.runAction(t.id)"
        >
          {{ t.action.label }}
        </button>
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
