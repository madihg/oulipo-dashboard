<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const deferred = ref<BIPEvent | null>(null);
const installed = ref<boolean>(
  window.matchMedia?.("(display-mode: standalone)").matches ?? false,
);

function onPrompt(e: Event) {
  e.preventDefault();
  deferred.value = e as BIPEvent;
}
function onInstalled() {
  installed.value = true;
  deferred.value = null;
}

async function trigger() {
  if (!deferred.value) return;
  await deferred.value.prompt();
  await deferred.value.userChoice;
  deferred.value = null;
}

function dismiss() {
  deferred.value = null;
  // Don't show again this session
  window.sessionStorage.setItem("hmart.install.dismissed", "1");
}

onMounted(() => {
  if (window.sessionStorage.getItem("hmart.install.dismissed")) return;
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
});
onBeforeUnmount(() => {
  window.removeEventListener("beforeinstallprompt", onPrompt);
  window.removeEventListener("appinstalled", onInstalled);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="deferred && !installed"
      class="fixed bottom-s-5 left-1/2 -translate-x-1/2 z-40 bg-text-primary text-bg px-s-4 py-s-3 flex items-center gap-s-4"
    >
      <span class="text-base lowercase">install hmart on this device</span>
      <button type="button" class="cap ip-btn" @click="trigger">install</button>
      <button type="button" class="cap ip-btn ip-later" @click="dismiss">
        later
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
/* Paper on ink, like the toast: the captions inherit the surface colour. */
.ip-btn {
  color: inherit;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.ip-btn:hover {
  opacity: 0.6;
}
.ip-later {
  opacity: 0.6;
}
.ip-later:hover {
  opacity: 1;
}
@media (pointer: coarse) {
  .ip-btn {
    min-height: 32px;
  }
}
</style>
