<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { supabase } from "../lib/supabase";
import { todayISO } from "../utils/when";
import { parseDebrief } from "../utils/debrief";
import ArtifactChips from "./ArtifactChips.vue";
import type { DailyDebriefRow } from "../types/database";

/**
 * The debrief: the day's context in one expandable block on Today - what
 * happened, what's on the calendar, what claude did, what needs Halim's eyes.
 * Written by the daily-desk routine each run (hmart.daily_debriefs, one row
 * per day; Mondays fold in weekly-desk's review). Collapsed by default;
 * realtime so a landing run refreshes it while the app is open.
 *
 * Lines may carry `[Title](https://...)` links; those render as the same
 * attachment chips a todo uses, so the doc you need for a call is one click
 * away from the schedule.
 */
const row = ref<DailyDebriefRow | null>(null);
const open = ref(localStorage.getItem("debrief-open") === "1");
function toggleOpen() {
  open.value = !open.value;
  localStorage.setItem("debrief-open", open.value ? "1" : "0");
}

async function load() {
  const { data } = await supabase
    .from("daily_debriefs")
    .select("*")
    .eq("day", todayISO())
    .maybeSingle();
  row.value = (data as DailyDebriefRow | null) ?? null;
}

let chan: ReturnType<typeof supabase.channel> | null = null;
onMounted(() => {
  void load();
  chan = supabase
    .channel("daily-debrief")
    .on(
      "postgres_changes",
      { event: "*", schema: "hmart", table: "daily_debriefs" },
      () => void load(),
    )
    .subscribe();
});
onBeforeUnmount(() => {
  if (chan) void supabase.removeChannel(chan);
});

const updatedLabel = computed(() => {
  if (!row.value) return null;
  return new Date(row.value.generated_at)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase();
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const URL_RE =
  /((?:https?:\/\/|www\.)[^\s<]+|(?:[a-z0-9-]+\.)+(?:com|org|net|edu|gov|io|co|ai|app|dev|info|me|us|uk|ca|eu|xyz|pub|press|art|studio|news|fund|foundation)(?:\/[^\s<]*)?)/gi;

/**
 * Escape, then apply the two inline marks the routine actually writes:
 * **bold** and bare URLs. Chip links were already lifted out by parseDebrief.
 * Order matters - escape first so the tags we add are the only markup, and
 * bold before linkify since URL_RE stops at "<" and cannot eat a tag.
 */
function linkify(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(URL_RE, (m) => {
      const href = /^https?:\/\//i.test(m) ? m : `https://${m}`;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="db-link">${m}</a>`;
    });
}

const blocks = computed(() => (row.value ? parseDebrief(row.value.body) : []));
</script>

<template>
  <section v-if="row" class="db">
    <button
      type="button"
      class="db-toggle interactive"
      :aria-expanded="open"
      @click="toggleOpen"
    >
      <span class="db-chev" :class="{ 'db-chev-open': open }">›</span>
      debrief
      <span v-if="updatedLabel" class="db-meta"
        >updated {{ updatedLabel }}</span
      >
    </button>
    <div v-if="open" class="db-body">
      <template v-for="(b, i) in blocks" :key="i">
        <!-- eslint-disable vue/no-v-html - escaped in linkify() above -->
        <p v-if="b.t === 'head'" class="db-head" v-html="linkify(b.text)"></p>
        <div v-else-if="b.t === 'gap'" class="db-gap"></div>
        <ul v-else-if="b.t === 'list'" class="db-list">
          <li v-for="(it, j) in b.items" :key="j">
            <span v-if="it.text" v-html="linkify(it.text)"></span>
            <ArtifactChips
              v-if="it.artifacts.length"
              class="db-chips"
              :artifacts="it.artifacts"
            />
          </li>
        </ul>
        <template v-else>
          <p v-if="b.text" class="db-line" v-html="linkify(b.text)"></p>
          <ArtifactChips
            v-if="b.artifacts.length"
            class="db-chips"
            :artifacts="b.artifacts"
          />
        </template>
        <!-- eslint-enable vue/no-v-html -->
      </template>
    </div>
  </section>
</template>

<style scoped>
.db {
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--sl-200);
}
.db-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--sl-600);
  background: transparent;
  border: 0;
  cursor: pointer;
  padding: 2px 0;
}
.db-toggle:hover {
  color: var(--sl-900);
}
.db-chev {
  display: inline-block;
  transition: transform 120ms ease;
}
.db-chev-open {
  transform: rotate(90deg);
}
.db-meta {
  font-size: 0.5625rem;
  letter-spacing: 0.06em;
  color: var(--sl-400);
  text-transform: lowercase;
}
.db-body {
  margin-top: 0.5rem;
  background: var(--ground-2);
  border: 1px solid var(--hair);
  border-radius: 2px;
  padding: 12px 14px;
  max-width: 72ch;
}
.db-body :deep(.db-head) {
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-500);
  margin: 10px 0 4px;
}
.db-body :deep(.db-head:first-child) {
  margin-top: 0;
}
.db-body :deep(.db-line) {
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--sl-800);
}
.db-body :deep(.db-list) {
  margin: 2px 0 2px 1.1em;
  padding: 0;
}
.db-body :deep(.db-list li) {
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--sl-800);
  margin: 1px 0;
}
.db-body :deep(.db-gap) {
  height: 6px;
}
.db-body :deep(strong) {
  font-weight: 600;
  color: var(--sl-900);
}
.db-body :deep(.db-chips) {
  margin: 4px 0 6px;
}
.db-body :deep(.db-link) {
  color: var(--acc-carnation-text);
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
