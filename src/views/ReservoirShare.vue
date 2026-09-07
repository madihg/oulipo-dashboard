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

// Phone only (CSS-gated): a row collapses to name + status; tapping it opens
// the detail cells (date / priority / link). Desktop grid is unaffected.
const openRow = ref<string | null>(null);
function toggleRow(id: string) {
  openRow.value = openRow.value === id ? null : id;
}
function toggleStatus(s: ShareStatus) {
  const next = new Set(hidden.value);
  if (next.has(s)) next.delete(s);
  else next.add(s);
  hidden.value = next;
  localStorage.setItem("reservoir-share-hidden", JSON.stringify([...next]));
}

function clearFilter() {
  hidden.value = new Set<ShareStatus>();
  localStorage.setItem("reservoir-share-hidden", "[]");
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
      <p class="cap">reservoir</p>
      <h2 class="r-title">share</h2>
      <p class="r-sub">
        everything not shared yet - works, events, essays. 4 feed automatically
        into the share area (about four shares a week). editing here is safe -
        the feed never changes these rows.
      </p>
    </div>

    <div v-if="!loading && rows.length" class="r-controls">
      <div class="r-control-group">
        <span class="cap">sort</span>
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
          {{ s.replace("_", " ") }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="d-empty">loading pool…</div>
    <div v-else-if="!rows.length" class="d-empty">
      <p>no share items in the pool.</p>
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
        <span class="cap">title</span>
        <span class="r-c cap" @click.stop>kind</span>
        <span class="r-c cap" @click.stop>slot</span>
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
          <p class="r-name-main">{{ r.title }}</p>
          <p v-if="r.hook" class="r-name-org">{{ r.hook }}</p>
        </div>
        <span class="r-c cap" @click.stop>{{ r.kind.replace("_", " ") }}</span>
        <span class="r-c" @click.stop>
          <input
            type="date"
            class="r-input"
            :value="r.target_slot_at ?? ''"
            @change="onSlot(r, $event)"
          />
        </span>
        <span class="r-c r-c-status" @click.stop>
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
            v-if="linkOf(r)"
            :href="linkOf(r)!"
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
        'feeds share area',
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
  grid-template-columns: 1fr 100px 150px 130px 60px 64px;
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
  border-radius: 2px;
  padding: 2px 4px;
  max-width: 100%;
  cursor: pointer;
}
.r-select {
  text-transform: lowercase;
}
.r-link {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.r-link:hover {
  color: var(--ink);
}
/* One hosted line, one next action, flush with the list's left edge. */
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
