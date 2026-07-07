<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";

/**
 * Keyboard shortcuts help overlay. Opened by "?" (desktop only - touch users
 * have no hardware keyboard). Dismiss on Esc or click-out. Brand-clean: hairline
 * border, mono rows of key + action, lowercase, no shadow/radius flourishes.
 */
const open = ref(false);

const groups: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: "general",
    items: [
      ["n", "new task in this view"],
      ["c", "capture to inbox"],
      ["/", "search"],
      ["⌘k", "command palette"],
      ["?", "this help"],
    ],
  },
  {
    title: "navigate",
    items: [
      ["g t", "go to today"],
      ["g i", "go to inbox"],
      ["g a", "go to anytime"],
    ],
  },
  {
    title: "rows",
    items: [
      ["j / k", "move selection down / up"],
      ["x / space", "toggle complete"],
      ["e / enter", "expand / edit"],
    ],
  },
];

function show() {
  open.value = true;
}
function close() {
  open.value = false;
}
function toggle() {
  open.value = !open.value;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && open.value) {
    e.preventDefault();
    e.stopPropagation();
    close();
  }
}
window.addEventListener("keydown", onKeydown);
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

defineExpose({ show, close, toggle });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="sh-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="keyboard shortcuts"
      @click.self="close"
    >
      <div class="sh-panel">
        <div class="sh-head">
          <p class="sh-title">keyboard shortcuts</p>
          <button class="sh-close interactive" type="button" @click="close">
            esc
          </button>
        </div>
        <div class="sh-groups">
          <section v-for="g in groups" :key="g.title" class="sh-group">
            <p class="sh-group-title">{{ g.title }}</p>
            <div v-for="[key, action] in g.items" :key="key" class="sh-row">
              <kbd class="sh-key">{{ key }}</kbd>
              <span class="sh-action">{{ action }}</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sh-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 6rem;
  padding-left: 1rem;
  padding-right: 1rem;
  background: rgba(0, 0, 0, 0.3);
}
.sh-panel {
  position: relative;
  width: 100%;
  max-width: 32rem;
  background: #ffffff;
  border: 1px solid var(--sl-200);
}
.sh-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--sl-200);
}
.sh-title {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-500);
}
.sh-close {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-400);
  background: transparent;
  border: 0;
  cursor: pointer;
}
.sh-groups {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  padding: 1rem;
}
.sh-group-title {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-400);
  margin-bottom: 0.375rem;
}
.sh-row {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 3px 0;
}
.sh-key {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.6875rem;
  color: var(--sl-900);
  background: var(--sl-100);
  border: 1px solid var(--sl-200);
  border-radius: 3px;
  padding: 1px 6px;
  min-width: 3.5rem;
  text-align: center;
  flex-shrink: 0;
}
.sh-action {
  font-size: 0.8125rem;
  color: var(--sl-700);
  text-transform: lowercase;
}
@media (min-width: 640px) {
  .sh-groups {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
