<script setup lang="ts">
import type { AltToday } from "./types";
defineProps<{ today: AltToday }>();

// Single-letter selectors a/b/c/... matched to the row index, like vimium / ranger
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
function letterFor(groupIdx: number, taskIdx: number): string {
  return LETTERS[groupIdx * 10 + taskIdx] ?? "·";
}
</script>

<template>
  <div class="term">
    <div class="mx-auto max-w-3xl px-s-4 py-s-5">
      <!-- Window chrome -->
      <header class="term-chrome">
        <span class="term-dot term-dot-r"></span>
        <span class="term-dot term-dot-y"></span>
        <span class="term-dot term-dot-g"></span>
        <span class="term-path">~/hmart/today</span>
      </header>

      <!-- Command line -->
      <div class="term-cmd">
        <span class="term-prompt">halim@hmart:~$</span>
        <span class="term-cmd-text">today --tomorrow=monday</span>
        <span class="term-caret">_</span>
      </div>

      <!-- Output -->
      <div class="term-out">
        <p class="term-out-line">
          # opening today, {{ today.weekday }} {{ today.date }}
        </p>
        <p class="term-out-line term-out-meta">
          {{ today.groups.reduce((n, g) => n + g.tasks.length, 0) }} rows ·
          press letter to focus · &lt;return&gt; to mark done · &lt;d&gt; delete
        </p>
      </div>

      <!-- Grouped rows -->
      <div class="mt-s-4 flex flex-col gap-s-4">
        <section
          v-for="(g, gi) in today.groups"
          :key="g.label"
          class="term-group"
        >
          <div
            class="term-group-head"
            :class="{ 'term-group-head-acc': g.accent === 'carnation' }"
          >
            <span class="term-group-glyph">▸</span>
            <span class="term-group-label">{{ g.label }}</span>
            <span class="term-group-count">[{{ g.tasks.length }}]</span>
          </div>
          <ul class="term-rows">
            <li v-for="(t, ti) in g.tasks" :key="t.id" class="term-row">
              <span
                class="term-letter"
                :class="g.accent === 'carnation' ? 'term-letter-acc' : ''"
                >{{ letterFor(gi, ti) }}</span
              >
              <span class="term-checkbox">[ ]</span>
              <span class="term-title">{{ t.title }}</span>
              <span class="term-trail">
                <span class="term-proj"
                  >@{{ t.project.replace(/\s+/g, "-") }}</span
                >
                <span v-if="t.deadline" class="term-when"
                  >⏵{{ t.deadline }}</span
                >
                <span v-for="tag in t.tags" :key="tag" class="term-tag"
                  >+{{ tag }}</span
                >
              </span>
            </li>
          </ul>
        </section>
      </div>

      <!-- Footer key bar -->
      <footer class="term-keys">
        <span><kbd>j</kbd><kbd>k</kbd> nav</span>
        <span><kbd>↵</kbd> done</span>
        <span><kbd>d</kbd> del</span>
        <span><kbd>m</kbd> move</span>
        <span><kbd>n</kbd> new</span>
        <span><kbd>/</kbd> search</span>
        <span><kbd>g</kbd><kbd>t</kbd> today</span>
        <span><kbd>q</kbd> quit</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.term {
  background: #0b0e14;
  color: #d6deeb;
  min-height: 100%;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-feature-settings: "calt", "liga";
}
.term-chrome {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: #131722;
  border: 1px solid #1f2530;
  border-bottom: 0;
  border-radius: 8px 8px 0 0;
}
.term-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.term-dot-r {
  background: #ff5f56;
}
.term-dot-y {
  background: #ffbd2e;
}
.term-dot-g {
  background: #27c93f;
}
.term-path {
  margin-left: 12px;
  font-size: 0.6875rem;
  color: #6e7889;
  letter-spacing: 0.02em;
}
.term-cmd {
  background: #0e1219;
  border: 1px solid #1f2530;
  border-top: 0;
  border-radius: 0 0 8px 8px;
  padding: 10px 12px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 0.8125rem;
}
.term-prompt {
  color: #58c896;
}
.term-cmd-text {
  color: #d6deeb;
}
.term-caret {
  width: 8px;
  height: 14px;
  background: #d6deeb;
  display: inline-block;
  animation: term-blink 1s steps(2) infinite;
}
@keyframes term-blink {
  to {
    background: transparent;
  }
}
.term-out {
  margin-top: 0.75rem;
  font-size: 0.75rem;
  line-height: 1.5;
}
.term-out-line {
  color: #6e7889;
}
.term-out-meta {
  color: #4d556a;
}
.term-group {
  border: 1px solid #1f2530;
  border-radius: 6px;
  background: #0e1219;
  overflow: hidden;
}
.term-group-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid #1f2530;
  background: #131722;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6e7889;
}
.term-group-head-acc .term-group-label,
.term-group-head-acc .term-group-glyph {
  color: #ff7eb0;
}
.term-group-glyph {
  color: #6e7889;
}
.term-group-count {
  color: #4d556a;
}
.term-rows {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}
.term-row {
  display: grid;
  grid-template-columns: 24px 28px 1fr auto;
  align-items: baseline;
  gap: 8px;
  padding: 4px 10px;
  font-size: 0.8125rem;
  cursor: pointer;
}
.term-row:hover {
  background: #131722;
}
.term-letter {
  font-weight: 700;
  color: #ffd866;
  text-align: center;
  background: rgba(255, 216, 102, 0.08);
  border-radius: 3px;
  font-size: 0.75rem;
}
.term-letter-acc {
  color: #ff7eb0;
  background: rgba(255, 126, 176, 0.08);
}
.term-checkbox {
  color: #4d556a;
}
.term-title {
  color: #d6deeb;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.term-trail {
  display: inline-flex;
  gap: 10px;
  font-size: 0.6875rem;
}
.term-proj {
  color: #82aaff;
}
.term-when {
  color: #c792ea;
}
.term-tag {
  color: #58c896;
}
.term-keys {
  margin-top: 1rem;
  padding-top: 0.5rem;
  border-top: 1px dashed #1f2530;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 0.6875rem;
  color: #6e7889;
}
.term-keys kbd {
  background: #1f2530;
  color: #d6deeb;
  border: 1px solid #2a3142;
  padding: 1px 5px;
  border-radius: 3px;
  margin-right: 4px;
  font-size: 0.625rem;
}
</style>
