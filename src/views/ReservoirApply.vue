<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { supabase } from "../lib/supabase";
import { useReservoirStore } from "../stores/reservoir";
import DenseStatusBar from "../components/dense/DenseStatusBar.vue";
import ViewToggle from "../components/ViewToggle.vue";
import { viewApplyOpportunities, type ApplySort } from "../utils/applyView";
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

// Sort (deadline | priority) + status filter (hide skipped by default), both
// persisted. The view re-sorts/filters client-side over the loaded pool.
const sortBy = ref<ApplySort>(
  (localStorage.getItem("reservoir-apply-sort") as ApplySort) || "deadline",
);
function setSort(v: string) {
  sortBy.value = v as ApplySort;
  localStorage.setItem("reservoir-apply-sort", v);
}

function loadHidden(): Set<ApplyStatus> {
  try {
    const raw = localStorage.getItem("reservoir-apply-hidden");
    if (raw) return new Set(JSON.parse(raw) as ApplyStatus[]);
  } catch {
    /* ignore */
  }
  return new Set<ApplyStatus>(["skipped"]); // hide skipped by default
}
const hidden = ref<Set<ApplyStatus>>(loadHidden());

// Phone only (CSS-gated): a row collapses to name + status; tapping it opens
// the detail cells (date / priority / link). Desktop grid is unaffected.
const openRow = ref<string | null>(null);
function toggleRow(id: string) {
  openRow.value = openRow.value === id ? null : id;
}
function toggleStatus(s: ApplyStatus) {
  const next = new Set(hidden.value);
  if (next.has(s)) next.delete(s);
  else next.add(s);
  hidden.value = next;
  localStorage.setItem("reservoir-apply-hidden", JSON.stringify([...next]));
}

function clearFilter() {
  hidden.value = new Set<ApplyStatus>();
  localStorage.setItem("reservoir-apply-hidden", "[]");
}

const visibleRows = computed(() =>
  viewApplyOpportunities(rows.value, {
    sort: sortBy.value,
    hidden: hidden.value,
  }),
);

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
      <p class="cap">reservoir</p>
      <h2 class="r-title">apply</h2>
      <p class="r-sub">
        the full pool to apply to. 5 feed automatically into the apply area,
        soonest deadlines first. editing here is safe - the feed never changes
        these rows.
      </p>
    </div>

    <div v-if="!loading && rows.length" class="r-controls">
      <div class="r-control-group">
        <span class="cap">sort</span>
        <ViewToggle
          :options="[
            { value: 'deadline', label: 'deadline' },
            { value: 'priority', label: 'priority' },
          ]"
          :model-value="sortBy"
          @update:model-value="setSort"
        />
      </div>
      <div class="r-control-group r-status-filter">
        <span class="cap">show</span>
        <button
          v-for="s in STATUSES"
          :key="s"
          type="button"
          class="chip"
          :aria-pressed="!hidden.has(s)"
          :title="hidden.has(s) ? `show ${s}` : `hide ${s}`"
          @click="toggleStatus(s)"
        >
          {{ s }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="d-empty">loading pool…</div>
    <div v-else-if="!rows.length" class="d-empty">
      <p>no opportunities in the pool.</p>
      <router-link to="/today" class="chip">go to today</router-link>
    </div>
    <div v-else-if="!visibleRows.length" class="d-empty">
      <p>nothing matches the filter.</p>
      <button type="button" class="chip" @click="clearFilter">
        clear filter
      </button>
    </div>

    <div v-else class="r-list">
      <div class="r-row r-row-head">
        <span class="cap">name</span>
        <span class="r-c cap" @click.stop>kind</span>
        <span class="r-c cap" @click.stop>deadline</span>
        <span class="r-c cap" @click.stop>status</span>
        <span class="r-c cap" @click.stop>pri</span>
        <span class="r-c cap" @click.stop>link</span>
      </div>
      <div
        v-for="r in visibleRows"
        :key="r.id"
        class="r-row"
        :class="{ 'r-row-open': openRow === r.id }"
        @click="toggleRow(r.id)"
      >
        <div class="r-name">
          <p class="r-name-main">{{ r.name }}</p>
          <p v-if="r.organization" class="r-name-org">{{ r.organization }}</p>
        </div>
        <span class="r-c cap" @click.stop>{{ r.kind }}</span>
        <span class="r-c" @click.stop>
          <input
            type="date"
            class="r-input"
            :value="r.deadline ?? ''"
            :title="fmtDeadline(r.deadline)"
            @change="onDeadline(r, $event)"
          />
          <span v-if="r.rolling" class="cap r-rolling">rolling</span>
        </span>
        <span class="r-c r-c-status" @click.stop>
          <select
            class="r-select"
            :value="r.status"
            :class="`r-status-${r.status}`"
            @change="onStatus(r, $event)"
          >
            <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
          </select>
        </span>
        <span class="r-c" @click.stop>
          <select
            class="r-select"
            :value="r.priority ?? ''"
            @change="onPriority(r, $event)"
          >
            <option v-for="p in PRIORITIES" :key="p || 'none'" :value="p">
              {{ p || "none" }}
            </option>
          </select>
        </span>
        <span class="r-c" @click.stop>
          <a
            v-if="r.url"
            :href="r.url"
            target="_blank"
            rel="noopener noreferrer"
            class="r-link cap cap-ink interactive"
            >open</a
          >
        </span>
      </div>
    </div>

    <DenseStatusBar
      :rows="visibleRows.length"
      :groups="Object.keys(counts).length"
      :extra="[
        `${visibleRows.length} of ${rows.length} shown`,
        `sort · ${sortBy}`,
        'feeds apply area',
      ]"
    />
  </section>
</template>

<style scoped>
.r-header {
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--hair);
}
.r-title {
  font-size: var(--fs-h);
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ink);
  text-transform: lowercase;
}
.r-sub {
  margin-top: 4px;
  font-size: var(--fs-small);
  color: var(--ink-50);
  max-width: 48ch;
}
.r-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--hair);
}
.r-control-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
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
  font-size: var(--fs-row);
}
.r-row-head {
  border-bottom: 1px solid var(--metal);
}
.r-c {
  min-width: 0;
}
.r-name-main {
  color: var(--ink);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.r-name-org {
  font-size: var(--fs-label);
  color: var(--ink-50);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.r-input,
.r-select {
  font: inherit;
  font-size: var(--fs-small);
  color: var(--ink-85);
  background: transparent;
  border: 1px solid var(--hair);
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
  color: var(--ink-40);
}
.r-rolling {
  display: block;
  margin-top: 2px;
}
.r-link {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.r-link:hover {
  color: var(--ink);
}
/* One hosted line, one next action, flush with the list's left edge. */
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
/* Phone: ONE line per item - name + status. The remaining cells (kind, date,
   priority, link) open on tap, one extra strip. The 601-767px card layout
   above stays for tablets. */
@media (max-width: 600px) {
  .r-row {
    grid-template-columns: 1fr auto;
    gap: 4px 8px;
    padding: 8px 4px;
    cursor: pointer;
  }
  .r-name {
    grid-column: auto;
    min-width: 0;
  }
  .r-name-org {
    display: none;
  }
  .r-row > .r-c {
    display: none;
  }
  .r-row > .r-c-status {
    display: block;
  }
  .r-row-open {
    grid-template-columns: repeat(2, auto) 1fr;
    justify-items: start;
  }
  .r-row-open .r-name {
    grid-column: 1 / -1;
  }
  .r-row-open .r-name-main {
    white-space: normal;
  }
  .r-row-open > .r-c {
    display: block;
  }
}
</style>
