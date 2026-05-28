<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  open: boolean;
  anchor?: "left" | "right";
}>();
const emit = defineEmits<{ close: [] }>();

const root = ref<HTMLElement | null>(null);

function onDocClick(e: MouseEvent) {
  if (!props.open) return;
  const el = root.value;
  if (!el) return;
  const target = e.target as Node;
  if (el.contains(target)) return;
  emit("close");
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && props.open) {
    emit("close");
  }
}

onMounted(() => {
  window.addEventListener("mousedown", onDocClick, true);
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  window.removeEventListener("mousedown", onDocClick, true);
  window.removeEventListener("keydown", onKey);
});

watch(
  () => props.open,
  (v) => {
    if (v) {
      void requestAnimationFrame(() => {
        root.value
          ?.querySelector<HTMLElement>("input,button,[tabindex='0']")
          ?.focus();
      });
    }
  },
);
</script>

<template>
  <div
    v-if="open"
    ref="root"
    :class="['d-pop', anchor === 'right' && 'd-pop-right']"
  >
    <slot />
  </div>
</template>

<style scoped>
.d-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  min-width: 200px;
  max-width: 320px;
  background: #ffffff;
  border: 1px solid #000000;
  border-radius: 2px;
  padding: 8px;
  font-size: 0.8125rem;
}
.d-pop-right {
  left: auto;
  right: 0;
}
</style>
