<script setup lang="ts">
import { computed } from "vue";
import type { BriefingFooter } from "../../types/briefing";

const props = defineProps<{ footer: BriefingFooter; refreshing: boolean }>();
defineEmits<{ refresh: [] }>();

const floorMet = computed(
  () => props.footer.gmail_floor.current >= props.footer.gmail_floor.target,
);
const lastRunLabel = computed(() => {
  try {
    const d = new Date(props.footer.last_run);
    return d.toLocaleString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    });
  } catch {
    return props.footer.last_run;
  }
});
</script>

<template>
  <footer class="d-brief-footer">
    <span :class="['d-brief-foot-item', !floorMet && 'is-warn']">
      gmail floor: <strong>{{ footer.gmail_floor.current }}</strong> /
      {{ footer.gmail_floor.target }}
      <span v-if="footer.gmail_floor.topped_up_today > 0">
        · topped up
        <strong>{{ footer.gmail_floor.topped_up_today }}</strong> today
      </span>
    </span>
    <span class="d-brief-foot-sep">|</span>
    <span class="d-brief-foot-item">
      last run:
      <strong>{{ lastRunLabel }}</strong>
      <span class="d-brief-foot-source">· {{ footer.source }}</span>
    </span>
    <button
      type="button"
      class="d-brief-refresh"
      :disabled="refreshing"
      @click="$emit('refresh')"
    >
      {{ refreshing ? "running…" : "refresh now" }}
    </button>
  </footer>
</template>

<style scoped>
.d-brief-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  border-top: 1px solid rgba(0, 0, 0, 0.12);
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(0, 0, 0, 0.6);
}
.d-brief-foot-item strong {
  color: rgba(0, 0, 0, 0.85);
  font-weight: 600;
}
.d-brief-foot-item.is-warn strong {
  color: var(--acc-carnation-text);
}
.d-brief-foot-sep {
  color: rgba(0, 0, 0, 0.3);
}
.d-brief-foot-source {
  color: rgba(0, 0, 0, 0.4);
  margin-left: 2px;
}
.d-brief-refresh {
  margin-left: auto;
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #ffffff;
  background: #000000;
  border: 1px solid #000000;
  padding: 4px 12px;
  border-radius: 2px;
  cursor: pointer;
}
.d-brief-refresh:disabled {
  opacity: 0.5;
  cursor: progress;
}
</style>
