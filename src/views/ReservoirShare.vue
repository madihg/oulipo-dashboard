<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { supabase } from "../lib/supabase";
import { useReservoirStore } from "../stores/reservoir";
import DenseStatusBar from "../components/dense/DenseStatusBar.vue";
import ViewToggle from "../components/ViewToggle.vue";
import { viewShareItems, type ShareSort } from "../utils/shareView";
import type { ShareItemRow, ShareStatus } from "../types/database";

/**
 * Reservoir > Share - the full background POOL of things to share (works,
 * events, essays not yet shipped). A reference/backlog view over share_items:
 * slot, status, priority, kind, link. Light inline editing is allowed here
 * (user-initiated); the auto-feed into the Share area never edits these rows.
 */

const reservoir = useReservoirStore();

const rows = ref<ShareItemRow[]>([]);
const loading = ref(true);

const STATUSES: ShareStatus[] = [
  "backlog",
  "suggested",
  "locked",
  "drafted",
  "shipped",
  "slot_skipped",
  "dropped",
];
const PRIORITIES = ["P0", "P1", "P2", ""] as const;

// Sort (slot | priority) + status filter (hide already-shared / dropped by
// default), both persisted. Client-side over the loaded pool.
const sortBy = ref<ShareSort>(
  (localStorage.getItem("reservoir-share-sort") as ShareSort) || "slot",
);
function setSort(v: string) {
  sortBy.value = v as ShareSort;
  localStorage.setItem("reservoir-share-sort", v);
}

function loadHidden(): Set<ShareStatus> {
  try {
    const raw = localStorage.getItem("reservoir-share-hidden");
    if (raw) return new Set(JSON.parse(raw) as ShareStatus[]);
  } catch {
    /* ignore */
  }
  return new Set<ShareStatus>(["shipped", "dropped", "slot_skipped"]);
}
const hidden = ref<Set<ShareStatus>>(loadHidden());
function toggleStatus(s: ShareStatus) {
  const next = new Set(hidden.value);
  if (next.has(s)) next.delete(s);
  else next.add(s);
  hidden.value = next;
  localStorage.setItem("reservoir-share-hidden", JSON.stringify([...next]));
}

const visibleRows = computed(() =>
  viewShareItems(rows.value, { sort: sortBy.value, hidden: hidden.value }),
);

async function load() {
  loading.value = true;
  await supabase.auth.getSession();
  const { data } = await supabase
    .from("share_items")
    .select("*")
    .order("target_slot_at", { ascending: true, nullsFirst: false })
    .order("priority", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  rows.value = (data as ShareItemRow[]) ?? [];
  loading.value = false;
}

onMounted(async () => {
  await load();
  // Keep the Share area topped up to 4 whenever this view is opened.
  void reservoir.ensureShareFeed();
});

async function patchItem(row: ShareItemRow, fields: Partial<ShareItemRow>) {
  Object.assign(row, fields);
  await supabase
    .from("share_items")
    .update(fields as never)
    .eq("id", row.id);
}

function onStatus(row: ShareItemRow, e: Event) {
  void patchItem(row, {
    status: (e.target as HTMLSelectElement).value as ShareStatus,
  });
}
function onPriority(row: ShareItemRow, e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  void patchItem(row, { priority: (v || null) as ShareItemRow["priority"] });
}
function onSlot(row: ShareItemRow, e: Event) {
  const v = (e.target as HTMLInputElement).value;
  void patchItem(row, { target_slot_at: v || null });
}

const counts = computed(() => {
  const c: Record<string, number> = {};
  for (const r of rows.value) c[r.status] = (c[r.status] ?? 0) + 1;
  return c;
});

function linkOf(r: ShareItemRow): string | null {
  return r.external_url ?? r.drive_folder_url ?? null;
}
</script>

<template>
  <section class="list-column">
    <div class="r-header">
      <p class="r-kicker">reservoir</p>
      <h2 class="r-title">share</h2>
      <p class="r-sub">
        everything not shared yet - works, events, essays. 4 feed automatically
        into the share area (about four shares a week). editing here is safe -
        the feed never changes these rows.
      </p>
    </div>

    <div v-if="!loading && rows.length" class="r-controls">
      <div class="r-control-group">
        <span class="r-control-label">sort</span>
        <ViewToggle
          :options="[
            { value: 'slot', label: 'slot' },
            { value: 'priority', label: 'priority' },
          ]"
          :model-value="sortBy"
          @update:model-value="setSort"
        />
      </div>
      <div class="r-control-group r-status-filter">
        <span class="r-control-label">show</span>
        <button
          v-for="s in STATUSES"
          :key="s"
          type="button"
          class="r-status-chip"
          :class="{ 'r-status-chip-off': hidden.has(s) }"
          :aria-pressed="!hidden.has(s)"
          :title="hidden.has(s) ? `show ${s}` : `hide ${s}`"
          @click="toggleStatus(s)"
        >
          {{ s.replace("_", " ") }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="d-empty">loading pool…</div>
    <div v-else-if="!rows.length" class="d-empty">
      no share items in the pool.
    </div>
    <div v-else-if="!visibleRows.length" class="d-empty">
      nothing matches the filter.
    </div>

    <div v-else class="r-list">
      <div class="r-row r-row-head">
        <span>title</span>
        <span class="r-c">kind</span>
        <span class="r-c">slot</span>
        <span class="r-c">status</span>
        <span class="r-c">pri</span>
        <span class="r-c">link</span>
      </div>
      <div v-for="r in visibleRows" :key="r.id" class="r-row">
        <div class="r-name">
          <p class="r-name-main">{{ r.title }}</p>
          <p v-if="r.hook" class="r-name-org">{{ r.hook }}</p>
        </div>
        <span class="r-c r-kind">{{ r.kind.replace("_", " ") }}</span>
        <span class="r-c">
          <input
            type="date"
            class="r-input"
            :value="r.target_slot_at ?? ''"
            @change="onSlot(r, $event)"
          />
        </span>
        <span class="r-c">
          <select
            class="r-select"
            :value="r.status"
            @change="onStatus(r, $event)"
          >
            <option v-for="s in STATUSES" :key="s" :value="s">
              {{ s.replace("_", " ") }}
            </option>
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
            v-if="linkOf(r)"
            :href="linkOf(r)!"
            target="_blank"
            rel="noopener noreferrer"
            class="r-link interactive"
            >open ↗</a
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
        'feeds share area',
      ]"
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
.r-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--sl-200);
}
.r-control-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.r-control-label {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-400);
}
.r-status-chip {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  text-transform: lowercase;
  letter-spacing: 0.02em;
  color: rgba(0, 0, 0, 0.85);
  background: transparent;
  border: 1px solid var(--sl-300);
  border-radius: 2px;
  padding: 2px 7px;
  cursor: pointer;
  transition:
    background 120ms ease,
    color 120ms ease,
    border-color 120ms ease,
    opacity 120ms ease;
}
.r-status-chip:hover {
  background: var(--sl-100);
}
.r-status-chip-off {
  color: var(--sl-400);
  border-color: var(--sl-200);
  text-decoration: line-through;
  opacity: 0.7;
}
.r-list {
  display: flex;
  flex-direction: column;
}
.r-row {
  display: grid;
  grid-template-columns: 1fr 100px 150px 130px 60px 64px;
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
  border-radius: 2px;
  padding: 2px 4px;
  max-width: 100%;
  cursor: pointer;
}
.r-select {
  text-transform: lowercase;
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
/* Mobile: drop the rigid grid; stack each item as a card. */
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
