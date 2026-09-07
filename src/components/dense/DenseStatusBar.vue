<script setup lang="ts">
import { computed } from "vue";
import { useSyncStatus } from "../../composables/useSyncStatus";

const props = defineProps<{
  rows?: number;
  groups?: number;
  /** Optional extra meta segments to show in the bar */
  extra?: string[];
}>();

const sync = useSyncStatus();

/** Left side: the counts, joined by a middle dot. Only the first survives a phone. */
const segments = computed(() => {
  const out: Array<{ text: string; optional: boolean }> = [];
  if (props.rows != null)
    out.push({ text: `${props.rows} rows`, optional: false });
  if (props.groups != null)
    out.push({ text: `${props.groups} groups`, optional: true });
  for (const e of props.extra ?? []) out.push({ text: e, optional: true });
  return out;
});

/**
 * Right side: speaks only when something needs saying. Offline comes first
 * because it is the reason nothing else is moving; then the writes the server
 * refused, which are not moving either; then the writes still in flight; then
 * a socket that is not joined. Connected and settled says nothing.
 */
const say = computed<{
  kind: "offline" | "unsaved" | "saving" | "reconnecting";
  text: string;
} | null>(() => {
  if (!sync.online) return { kind: "offline", text: "offline" };
  if (sync.failedCount > 0)
    return { kind: "unsaved", text: `${sync.failedCount} unsaved` };
  if (sync.pendingCount > 0)
    return { kind: "saving", text: `saving ${sync.pendingCount}` };
  if (sync.realtime === "disconnected")
    return { kind: "reconnecting", text: "reconnecting" };
  return null;
});
</script>

<template>
  <footer class="d-status cap">
    <span
      v-for="(s, i) in segments"
      :key="i"
      class="d-status-seg"
      :class="{ 'd-status-optional': s.optional }"
      ><span v-if="i > 0" class="d-status-sep" aria-hidden="true"> · </span
      >{{ s.text }}</span
    >
    <!-- Always mounted: a live region has to exist before its words change,
         or a screen reader never hears the app go offline or a write fail. -->
    <span
      class="d-status-say"
      :class="say ? `d-status-say-${say.kind}` : null"
      role="status"
      aria-atomic="true"
      ><template v-if="say"
        ><span class="dot" aria-hidden="true"></span>{{ say.text }}</template
      ></span
    >
  </footer>
</template>

<style scoped>
.d-status {
  margin-top: var(--space-4);
  padding-top: var(--space-2);
  border-top: 1px solid var(--hair);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}
.d-status-sep {
  white-space: pre;
}
.d-status-say {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}
/* Colour lives in the dot and nowhere else. Amber for "still moving",
   the error red for offline and for a write the server refused. The word
   carries the meaning; the dot only agrees with it. */
.d-status-say-saving,
.d-status-say-reconnecting {
  --dot: var(--live);
}
.d-status-say-offline,
.d-status-say-unsaved {
  --dot: var(--error);
}
/* Phone: one line. The rows count and the state carry the signal; groups and
   extras step aside instead of wrapping the bar to 2-3 lines. */
@media (max-width: 600px) {
  .d-status {
    flex-wrap: nowrap;
  }
  .d-status-optional {
    display: none;
  }
}
</style>
