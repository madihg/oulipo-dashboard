<script setup lang="ts">
import { computed } from "vue";
import type { GoalSnapshot } from "../../types/briefing";

const props = defineProps<{ goal: GoalSnapshot }>();

const subtallyEntries = computed(() =>
  Object.entries(props.goal.subtally).map(([k, v]) => ({
    label: k,
    sent: v.sent,
    target: v.target,
  })),
);

const daysLabel = computed(() => {
  if (props.goal.days_left == null) return null;
  if (props.goal.days_left < 0) return "deadline passed";
  if (props.goal.days_left === 0) return "deadline today";
  return `${props.goal.days_left} days left`;
});
</script>

<template>
  <p class="d-goal-strip">
    <span class="d-goal-name">{{ goal.name }}</span>
    <span class="d-goal-sep">|</span>
    <span class="d-goal-counter">
      <strong>{{ goal.total_sent }}</strong> of {{ goal.total_target }} sent
    </span>
    <template v-if="subtallyEntries.length">
      <span class="d-goal-sep">|</span>
      <span
        v-for="(entry, i) in subtallyEntries"
        :key="entry.label"
        class="d-goal-subtally"
      >
        {{ entry.label }} {{ entry.sent }}/{{ entry.target
        }}<span v-if="i < subtallyEntries.length - 1" class="d-goal-comma"
          >,</span
        >
      </span>
    </template>
    <template v-if="daysLabel">
      <span class="d-goal-sep">|</span>
      <span class="d-goal-deadline">{{ daysLabel }}</span>
    </template>
  </p>
</template>

<style scoped>
.d-goal-strip {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(0, 0, 0, 0.6);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: baseline;
  padding: 6px 0 10px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
  margin-bottom: 0.75rem;
}
.d-goal-name {
  color: rgba(0, 0, 0, 0.85);
  font-weight: 600;
}
.d-goal-sep {
  color: rgba(0, 0, 0, 0.3);
}
.d-goal-counter strong {
  color: rgba(0, 0, 0, 0.85);
  font-weight: 600;
}
.d-goal-subtally {
  color: rgba(0, 0, 0, 0.6);
}
.d-goal-comma {
  margin-right: 4px;
}
.d-goal-deadline {
  color: rgba(0, 0, 0, 0.85);
}
</style>
