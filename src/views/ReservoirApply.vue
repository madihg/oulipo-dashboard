<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { supabase } from "../lib/supabase";
import { useReservoirStore } from "../stores/reservoir";
import DenseStatusBar from "../components/dense/DenseStatusBar.vue";
import type { ApplyOpportunityRow, ApplyStatus } from "../types/database";

/**
 * Reservoir > Apply - the full background POOL of things to apply to. A
 * reference/backlog view over apply_opportunities (53 rows): deadline, status,
 * priority, kind, url. Light inline editing is allowed here (user-initiated);
 * the auto-feed into the Apply area never edits these rows.
 */

const reservoir = useReservoirStore();

const rows = ref<ApplyOpportunityRow[]>([]);
const loading = ref(true);

const STATUSES: ApplyStatus[] = [
  "watchlist",
  "doing",
  "applied",
  "accepted",
  "rejected",
  "declined",
  "skipped",
];
const PRIORITIES = ["P0", "P1", "P2", ""] as const;

async function load() {
  loading.value = true;
  await supabase.auth.getSession();
  const { data } = await supabase
    .from("apply_opportunities")
    .select("*")
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("priority", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  rows.value = (data as ApplyOpportunityRow[]) ?? [];
  loading.value = false;
}

onMounted(async () => {
  await load();
  // Keep the Apply area topped up to 5 whenever this view is opened.
  void reservoir.ensureApplyFeed();
});

async function patchOpp(
  row: ApplyOpportunityRow,
  fields: Partial<ApplyOpportunityRow>,
) {
  Object.assign(row, fields);
  await supabase
    .from("apply_opportunities")
    .update(fields as never)
    .eq("id", row.id);
}

function onStatus(row: ApplyOpportunityRow, e: Event) {
  void patchOpp(row, {
    status: (e.target as HTMLSelectElement).value as ApplyStatus,
  });
}
function onPriority(row: ApplyOpportunityRow, e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  void patchOpp(row, {
    priority: (v || null) as ApplyOpportunityRow["priority"],
  });
}
function onDeadline(row: ApplyOpportunityRow, e: Event) {
  const v = (e.target as HTMLInputElement).value;
  void patchOpp(row, { deadline: v || null });
}

const counts = computed(() => {
  const c: Record<string, number> = {};
  for (const r of rows.value) c[r.status] = (c[r.status] ?? 0) + 1;
  return c;
});

function fmtDeadline(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
</script>

<template>
  <section class="list-column">
    <div class="r-header">
      <p class="r-kicker">reservoir</p>
      <h2 class="r-title">apply</h2>
      <p class="r-sub">
        the full pool to apply to. 5 feed automatically into the apply area,
        soonest deadlines first. editing here is safe - the feed never changes
        these rows.
      </p>
    </div>

    <div v-if="loading" class="d-empty">loading pool…</div>
    <div v-else-if="!rows.length" class="d-empty">
      no opportunities in the pool.
    </div>

    <div v-else class="r-list">
      <div class="r-row r-row-head">
        <span>name</span>
        <span class="r-c">kind</span>
        <span class="r-c">deadline</span>
        <span class="r-c">status</span>
        <span class="r-c">pri</span>
        <span class="r-c">link</span>
      </div>
      <div v-for="r in rows" :key="r.id" class="r-row">
        <div class="r-name">
          <p class="r-name-main">{{ r.name }}</p>
          <p v-if="r.organization" class="r-name-org">{{ r.organization }}</p>
        </div>
        <span class="r-c r-kind">{{ r.kind }}</span>
        <span class="r-c">
          <input
            type="date"
            class="r-input"
            :value="r.deadline ?? ''"
            :title="fmtDeadline(r.deadline)"
            @change="onDeadline(r, $event)"
          />
          <span v-if="r.rolling" class="r-rolling">rolling</span>
        </span>
        <span class="r-c">
          <select
            class="r-select"
            :value="r.status"
            :class="`r-status-${r.status}`"
            @change="onStatus(r, $event)"
          >
            <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
          </select>
        </span>
        <span class="r-c">
          <select
            class="r-select"
            :value="r.priority ?? ''"
            @change="onPriority(r, $event)"
          >
            <option v-for="p in PRIORITIES" :key="p || 'none'" :value="p">
              {{ p || "-" }}
            </option>
          </select>
        </span>
        <span class="r-c">
          <a
            v-if="r.url"
            :href="r.url"
            target="_blank"
            rel="noopener noreferrer"
            class="r-link interactive"
            >open ↗</a
          >
        </span>
      </div>
    </div>

    <DenseStatusBar
      :rows="rows.length"
      :groups="Object.keys(counts).length"
      :extra="[`watchlist · ${counts.watchlist ?? 0}`, 'feeds apply area']"
    />
  </section>
</template>

<style scoped>
.r-header {
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--sl-200);
}
.r-kicker {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-400);
}
.r-title {
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--sl-900);
  text-transform: lowercase;
}
.r-sub {
  margin-top: 4px;
  font-size: 0.75rem;
  color: var(--sl-500);
  max-width: 48ch;
}
.r-list {
  display: flex;
  flex-direction: column;
}
.r-row {
  display: grid;
  grid-template-columns: 1fr 90px 150px 120px 60px 64px;
  align-items: center;
  gap: 10px;
  padding: 7px 4px;
  border-bottom: 1px solid var(--d-row-border);
  font-size: 0.8125rem;
}
.r-row-head {
  border-bottom: 1px solid var(--sl-300);
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-400);
}
.r-c {
  min-width: 0;
}
.r-name-main {
  color: var(--sl-900);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.r-name-org {
  font-size: 0.6875rem;
  color: var(--sl-500);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.r-kind {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--sl-500);
}
.r-input,
.r-select {
  font: inherit;
  font-size: 0.75rem;
  color: var(--sl-800);
  background: transparent;
  border: 1px solid var(--sl-200);
  border-radius: 3px;
  padding: 2px 4px;
  max-width: 100%;
  cursor: pointer;
}
.r-select {
  text-transform: lowercase;
}
.r-status-accepted {
  color: var(--acc-reinforcement-text, #2e7d32);
}
.r-status-rejected,
.r-status-declined {
  color: var(--sl-400);
}
.r-rolling {
  display: block;
  margin-top: 2px;
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.5625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-400);
}
.r-link {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--acc-carnation-text);
  text-decoration: none;
}
.d-empty {
  font-size: 0.875rem;
  color: var(--sl-500);
  padding: 1rem 0;
}
/* Mobile: drop the rigid grid; stack each opportunity as a card. */
@media (max-width: 767px) {
  .r-row-head {
    display: none;
  }
  .r-row {
    grid-template-columns: 1fr 1fr;
    gap: 6px 10px;
    padding: 10px 4px;
  }
  .r-name {
    grid-column: 1 / -1;
  }
}
</style>
