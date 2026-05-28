<script setup lang="ts">
import type { AltToday } from "./types";
defineProps<{ today: AltToday }>();
</script>

<template>
  <div class="calm">
    <div class="mx-auto max-w-2xl px-s-5 py-s-6">
      <header class="flex items-baseline justify-between flex-wrap gap-s-3">
        <div>
          <h1 class="calm-h1">today</h1>
          <p class="calm-sub">{{ today.weekday }} · {{ today.date }}</p>
        </div>
        <span class="calm-pill">
          {{ today.groups.reduce((n, g) => n + g.tasks.length, 0) }} items
        </span>
      </header>

      <div class="mt-s-6 flex flex-col gap-s-5">
        <section v-for="g in today.groups" :key="g.label">
          <div class="flex items-center gap-s-3 mb-s-3">
            <span
              class="calm-dot"
              :class="
                g.accent === 'carnation' ? 'calm-dot-acc' : 'calm-dot-neutral'
              "
            ></span>
            <h2 class="calm-h2">{{ g.label }}</h2>
            <span class="calm-count">{{ g.tasks.length }}</span>
          </div>
          <ul class="flex flex-col gap-s-2">
            <li v-for="t in g.tasks" :key="t.id" class="calm-card">
              <div class="flex items-start gap-s-3">
                <span
                  class="calm-check"
                  :class="g.accent === 'carnation' ? 'calm-check-acc' : ''"
                  aria-hidden="true"
                ></span>
                <div class="flex-1 min-w-0">
                  <p class="calm-title">{{ t.title }}</p>
                  <p class="calm-meta">
                    <span class="calm-chip">{{ t.project }}</span>
                    <span class="calm-meta-dot" v-if="t.deadline">·</span>
                    <span v-if="t.deadline" class="calm-when">{{
                      t.deadline
                    }}</span>
                    <span v-for="tag in t.tags" :key="tag" class="calm-tag"
                      >#{{ tag }}</span
                    >
                  </p>
                </div>
                <span class="calm-kbd" aria-hidden="true">↵</span>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.calm {
  /* Subtle warm-cool ground that doesn't compete with content */
  background: linear-gradient(180deg, #fbfbfd 0%, #f6f7fa 100%);
  min-height: 100%;
  font-family:
    "Inter",
    "Geist Sans",
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  font-feature-settings: "cv11", "ss03", "ss02";
}
.calm-h1 {
  font-size: 1.625rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: #0f172a;
  text-transform: lowercase;
}
.calm-sub {
  margin-top: 2px;
  font-size: 0.75rem;
  color: #64748b;
  text-transform: lowercase;
}
.calm-h2 {
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: #0f172a;
  text-transform: lowercase;
}
.calm-count {
  font-size: 0.75rem;
  color: #94a3b8;
  margin-left: 2px;
}
.calm-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.calm-dot-acc {
  background: #ef476f;
  box-shadow: 0 0 0 4px rgba(239, 71, 111, 0.12);
}
.calm-dot-neutral {
  background: #94a3b8;
  box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.16);
}
.calm-pill {
  font-size: 0.6875rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #475569;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  padding: 4px 10px;
  border-radius: 999px;
}
.calm-card {
  background: #ffffff;
  border: 1px solid #e7eaf0;
  border-radius: 10px;
  padding: 10px 12px;
  transition:
    border-color 200ms ease,
    box-shadow 200ms ease,
    transform 200ms ease;
  cursor: pointer;
}
.calm-card:hover {
  border-color: #c9d2e1;
  box-shadow:
    0 1px 0 0 rgba(15, 23, 42, 0.04),
    0 8px 24px -12px rgba(15, 23, 42, 0.18);
}
.calm-check {
  width: 16px;
  height: 16px;
  border: 1.5px solid #cbd5e1;
  border-radius: 6px;
  flex-shrink: 0;
  margin-top: 2px;
  transition:
    border-color 200ms ease,
    background 200ms ease;
}
.calm-card:hover .calm-check {
  border-color: #94a3b8;
}
.calm-check-acc {
  border-color: #ef476f;
}
.calm-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: #0f172a;
  line-height: 1.35;
}
.calm-meta {
  margin-top: 4px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 0.6875rem;
  color: #64748b;
}
.calm-chip {
  background: #f1f5f9;
  color: #334155;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.6875rem;
  text-transform: lowercase;
}
.calm-when {
  color: #475569;
}
.calm-meta-dot {
  color: #cbd5e1;
}
.calm-tag {
  color: #6366f1;
  font-weight: 500;
}
.calm-kbd {
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 0.625rem;
  color: #94a3b8;
  border: 1px solid #e2e8f0;
  padding: 1px 5px;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 200ms ease;
}
.calm-card:hover .calm-kbd {
  opacity: 1;
}
</style>
