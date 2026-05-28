<script setup lang="ts">
import type { AltToday } from "./types";
defineProps<{ today: AltToday }>();

// Stable color per project name, like Notion / Linear projects do.
const PROJECT_COLOR: Record<string, string> = {
  "ai workflows": "#2AA4DD",
  "5x4": "#F6009B",
  apply: "#F59E0B",
  "clarinet strategy": "#8B5CF6",
  "be patient w. money": "#10B981",
};
function colorFor(project: string): string {
  return PROJECT_COLOR[project.toLowerCase()] ?? "#94A3B8";
}
</script>

<template>
  <div class="dense">
    <div class="mx-auto max-w-6xl px-s-5 py-s-5">
      <!-- Toolbar row -->
      <div class="dense-toolbar">
        <div class="flex items-baseline gap-s-3">
          <h1 class="dense-h1">today</h1>
          <span class="dense-h1-meta"
            >{{ today.weekday }} · {{ today.date }}</span
          >
        </div>
        <div class="flex gap-s-2">
          <button class="dense-tool">filter</button>
          <button class="dense-tool">sort</button>
          <button class="dense-tool">group</button>
          <button class="dense-tool dense-tool-primary">new</button>
        </div>
      </div>

      <!-- Three-column grid -->
      <div class="dense-grid">
        <section v-for="g in today.groups" :key="g.label" class="dense-col">
          <header class="dense-col-head">
            <span
              class="dense-col-dot"
              :class="
                g.accent === 'carnation'
                  ? 'dense-col-dot-acc'
                  : 'dense-col-dot-neutral'
              "
            ></span>
            <span class="dense-col-label">{{ g.label }}</span>
            <span class="dense-col-count">{{ g.tasks.length }}</span>
            <button class="dense-col-plus" aria-label="add to group">+</button>
          </header>
          <ul class="dense-rows">
            <li v-for="t in g.tasks" :key="t.id" class="dense-row">
              <input type="checkbox" class="dense-checkbox" />
              <p class="dense-title">{{ t.title }}</p>
              <span class="dense-proj" :style="{ color: colorFor(t.project) }">
                <span
                  class="dense-proj-dot"
                  :style="{ background: colorFor(t.project) }"
                ></span>
                {{ t.project }}
              </span>
              <span v-if="t.deadline" class="dense-when">{{ t.deadline }}</span>
              <span class="dense-tags">
                <span v-for="tag in t.tags" :key="tag" class="dense-tag">{{
                  tag
                }}</span>
              </span>
            </li>
          </ul>
        </section>
      </div>

      <!-- Status bar -->
      <div class="dense-status">
        <span
          >{{ today.groups.reduce((n, g) => n + g.tasks.length, 0) }} rows · 3
          groups</span
        >
        <span>last sync: just now</span>
        <span>realtime: connected</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dense {
  font-family:
    "Inter",
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  font-feature-settings: "tnum", "cv11";
  background: #ffffff;
  color: #0f172a;
}
.dense-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.dense-h1 {
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.dense-h1-meta {
  font-size: 0.75rem;
  color: #64748b;
}
.dense-tool {
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #475569;
  border: 1px solid #e2e8f0;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 150ms ease;
}
.dense-tool:hover {
  background: #f1f5f9;
}
.dense-tool-primary {
  background: #0f172a;
  color: #ffffff;
  border-color: #0f172a;
}
.dense-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 0.75rem;
}
.dense-col {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
  background: #fafbfd;
}
.dense-col-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 6px 10px;
  border-bottom: 1px solid #e2e8f0;
  background: #ffffff;
}
.dense-col-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}
.dense-col-dot-acc {
  background: #f6009b;
}
.dense-col-dot-neutral {
  background: #cbd5e1;
}
.dense-col-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: lowercase;
}
.dense-col-count {
  font-size: 0.625rem;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 999px;
}
.dense-col-plus {
  margin-left: auto;
  font-size: 0.875rem;
  color: #94a3b8;
  cursor: pointer;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px dashed #cbd5e1;
  line-height: 1;
}
.dense-col-plus:hover {
  color: #0f172a;
  border-color: #0f172a;
}
.dense-rows {
  list-style: none;
  margin: 0;
  padding: 0;
}
.dense-row {
  display: grid;
  grid-template-columns: 18px 1fr auto auto;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid #eef0f5;
  font-size: 0.8125rem;
  background: transparent;
  transition: background 120ms ease;
  cursor: pointer;
}
.dense-row:last-child {
  border-bottom: 0;
}
.dense-row:hover {
  background: #f1f5f9;
}
.dense-checkbox {
  width: 14px;
  height: 14px;
  border: 1.5px solid #cbd5e1;
  border-radius: 3px;
  appearance: none;
  cursor: pointer;
}
.dense-title {
  font-weight: 500;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dense-proj {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.6875rem;
  font-weight: 500;
}
.dense-proj-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.dense-when {
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 0.6875rem;
  color: #475569;
  white-space: nowrap;
}
.dense-tags {
  grid-column: 2 / -1;
  margin-top: 2px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.dense-tag {
  font-size: 0.625rem;
  color: #6366f1;
  background: #eef2ff;
  padding: 1px 6px;
  border-radius: 3px;
  text-transform: lowercase;
}
.dense-status {
  margin-top: 1rem;
  padding-top: 0.5rem;
  border-top: 1px solid #e2e8f0;
  display: flex;
  gap: 1rem;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #94a3b8;
  flex-wrap: wrap;
}
</style>
