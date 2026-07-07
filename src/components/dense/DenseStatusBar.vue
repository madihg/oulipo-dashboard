<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { supabase } from "../../lib/supabase";

defineProps<{
  rows?: number;
  groups?: number;
  /** Optional extra meta segments to show in the bar */
  extra?: string[];
}>();

// Realtime channel health - polled from the existing vault subscription state.
// Cheap: just opens a self-checking heartbeat channel.
const realtime = ref<"connecting" | "connected" | "disconnected">("connecting");
let chan: ReturnType<typeof supabase.channel> | null = null;

const lastSync = ref<Date | null>(new Date());
const tick = ref(0);
let interval: number | null = null;

const lastSyncLabel = computed(() => {
  if (!lastSync.value) return "never";
  // re-evaluate via tick to refresh the relative label
  const _ = tick.value;
  void _;
  const s = Math.floor((Date.now() - lastSync.value.getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
});

onMounted(() => {
  chan = supabase.channel("dense-statusbar-heartbeat").subscribe((status) => {
    if (status === "SUBSCRIBED") realtime.value = "connected";
    else if (status === "CLOSED" || status === "CHANNEL_ERROR")
      realtime.value = "disconnected";
    else realtime.value = "connecting";
  });
  interval = window.setInterval(() => {
    tick.value++;
  }, 15_000);
});
onBeforeUnmount(() => {
  if (chan) void supabase.removeChannel(chan);
  if (interval) window.clearInterval(interval);
});
</script>

<template>
  <footer class="d-status">
    <span v-if="rows != null">{{ rows }} rows</span>
    <span v-if="groups != null">{{ groups }} groups</span>
    <span v-for="(e, i) in extra ?? []" :key="i">{{ e }}</span>
    <span class="ml-auto">last sync: {{ lastSyncLabel }}</span>
    <span class="d-status-rt" :class="`d-status-rt-${realtime}`">
      <span class="d-status-dot"></span>realtime: {{ realtime }}
    </span>
  </footer>
</template>

<style scoped>
.d-status {
  margin-top: 1rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--sl-200);
  display: flex;
  gap: 1rem;
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--d-status-text);
  flex-wrap: wrap;
  align-items: center;
}
.ml-auto {
  margin-left: auto;
}
.d-status-rt {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.d-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}
/* Semantic status colors (green / amber / red), independent of the priority
   accent remap so "connecting" stays amber and "disconnected" stays red. */
.d-status-rt-connected .d-status-dot {
  background: var(--success);
  box-shadow: 0 0 0 3px rgba(30, 142, 90, 0.16);
}
.d-status-rt-connecting .d-status-dot {
  background: var(--gold);
  box-shadow: 0 0 0 3px rgba(232, 155, 27, 0.16);
}
.d-status-rt-disconnected .d-status-dot {
  background: var(--error);
  box-shadow: 0 0 0 3px rgba(229, 57, 28, 0.16);
}
</style>
