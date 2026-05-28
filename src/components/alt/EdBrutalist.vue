<script setup lang="ts">
import type { AltToday } from "./types";
defineProps<{ today: AltToday }>();
</script>

<template>
  <div class="br">
    <div class="mx-auto max-w-3xl px-s-4 py-s-5">
      <!-- Massive identifier slab -->
      <div class="br-id">
        <div class="br-id-line">today</div>
        <div class="br-id-line br-id-line-meta">
          {{ today.weekday }}.{{ today.date.replace(/\s/g, ".") }}
        </div>
      </div>

      <!-- Each group is a labeled rack with a 4px accent top border -->
      <div class="mt-s-5 flex flex-col gap-s-4">
        <section
          v-for="g in today.groups"
          :key="g.label"
          class="br-rack"
          :class="g.accent === 'carnation' ? 'br-rack-acc' : 'br-rack-neutral'"
        >
          <header class="br-rack-head">
            <span class="br-rack-label">{{ g.label }}</span>
            <span class="br-rack-count">{{ g.tasks.length }}</span>
          </header>
          <ol class="br-rack-list">
            <li v-for="(t, i) in g.tasks" :key="t.id" class="br-row">
              <span class="br-row-idx">{{
                String(i + 1).padStart(2, "0")
              }}</span>
              <div class="br-row-body">
                <p class="br-row-title">{{ t.title.toUpperCase() }}</p>
                <p class="br-row-meta">
                  <span>{{ t.area }} // {{ t.project }}</span>
                  <span v-if="t.deadline">
                    · {{ t.deadline.toUpperCase() }}</span
                  >
                  <span v-for="tag in t.tags" :key="tag"> · #{{ tag }}</span>
                </p>
              </div>
            </li>
          </ol>
        </section>
      </div>

      <footer class="br-foot">
        <span>file://hmart/today/{{ today.date.replace(/\s/g, "-") }}.md</span>
        <span>SIGNED-OFF: HALIM.MADI</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.br {
  font-family: "Space Mono", "JetBrains Mono", ui-monospace, monospace;
  color: rgba(0, 0, 0, 0.88);
  background: repeating-linear-gradient(
    90deg,
    rgba(0, 0, 0, 0) 0 calc(100% - 1px),
    rgba(0, 0, 0, 0.04) calc(100% - 1px) 100%
  );
}
.br-id {
  border: 2px solid #000;
  padding: 0.75rem 1rem;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.br-id-line {
  font-size: clamp(2rem, 6vw, 3.5rem);
  font-weight: 700;
  letter-spacing: -0.04em;
  text-transform: uppercase;
  line-height: 0.95;
}
.br-id-line-meta {
  font-size: 0.875rem;
  letter-spacing: 0.05em;
}
.br-rack {
  border: 2px solid #000;
  border-top-width: 6px;
}
.br-rack-acc {
  border-top-color: #f6009b;
}
.br-rack-neutral {
  border-top-color: #000;
}
.br-rack-head {
  border-bottom: 1px solid #000;
  padding: 0.4rem 0.75rem;
  display: flex;
  justify-content: space-between;
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: rgba(0, 0, 0, 0.04);
}
.br-rack-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.br-row {
  display: flex;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  border-top: 1px solid rgba(0, 0, 0, 0.85);
}
.br-row:first-child {
  border-top: 0;
}
.br-row-idx {
  font-size: 0.6875rem;
  color: rgba(0, 0, 0, 0.55);
  padding-top: 2px;
}
.br-row-body {
  flex: 1;
  min-width: 0;
}
.br-row-title {
  font-size: 0.9375rem;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.25;
}
.br-row-meta {
  margin-top: 4px;
  font-size: 0.6875rem;
  color: rgba(0, 0, 0, 0.55);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.br-foot {
  margin-top: 1.5rem;
  border-top: 2px solid #000;
  padding-top: 0.75rem;
  display: flex;
  justify-content: space-between;
  font-size: 0.6875rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.55);
}
</style>
