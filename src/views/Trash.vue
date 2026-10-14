<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { TRASH_PAGE, useTrashStore } from "../stores/trash";
import { useVaultStore } from "../stores/vault";
import { useToastStore } from "../stores/toast";
import { openTaskHereAction } from "../composables/useOpenTask";
import type { TrashEntry, TrashKind } from "../types/database";
import {
  captionOf,
  childrenSummary,
  clip,
  groupByDay,
  isSelfBack,
  kindLabel,
  pluralize,
  restoreMessage,
} from "../utils/trash";

/**
 * The trash. Every delete in hmart copies the row here first (a trigger on
 * each table), with whatever it cascaded to, so a deleted task comes back with
 * its checklist and tags, a deleted project with its tasks. Newest first,
 * under day headers; search reaches into the cascaded children too. Nothing
 * here destroys anything, so the page has no red and no confirm: restore is
 * the only verb.
 */
const trash = useTrashStore();
const vault = useVaultStore();
const toast = useToastStore();
const { kinds, kindsLoaded, total } = storeToRefs(trash);

const query = ref("");
/** The query the list on screen answers (trimmed, after the debounce). */
const q = ref("");
const kind = ref<string | null>(null);
const rows = ref<TrashEntry[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const hasMore = ref(false);
const busy = ref<Set<string>>(new Set());
const now = ref(new Date());
const searchEl = ref<HTMLInputElement | null>(null);

const days = computed(() => groupByDay(rows.value, now.value));
const totalLabel = computed(() =>
  kindsLoaded.value ? String(total.value) : "unknown",
);
/** The filter chips: every kind with entries, plus the picked one even once
 *  its last entry is restored, so the pressed chip never vanishes under you. */
const chips = computed<TrashKind[]>(() => {
  const list = [...kinds.value];
  if (kind.value && !list.some((k) => k.source_table === kind.value)) {
    list.push({ source_table: kind.value, n: 0 });
  }
  return list;
});
const kindPlural = computed(() =>
  kind.value ? pluralize(kindLabel(kind.value)) : "",
);

// Every load takes a ticket; a response that comes back after a newer load
// started is dropped, so a slow early keystroke never paints over the answer
// to the last one (the palette's guard).
let seq = 0;
/**
 * Load the list as one window from the top. "load more" widens the window by
 * a page instead of asking for the next offset: entries restored or deleted
 * elsewhere shift every offset, and paging by offset skipped or repeated rows.
 * A reload keeps the window the reader has paged out to. A failed load keeps
 * the rows on screen; only an empty list turns into the error state.
 */
async function load(opts: { more?: boolean; reset?: boolean } = {}) {
  const ticket = ++seq;
  loading.value = true;
  const shown = opts.reset ? 0 : rows.value.length;
  const limit = opts.more
    ? shown + TRASH_PAGE
    : Math.max(TRASH_PAGE, shown);
  const { rows: page, error } = await trash.search(
    q.value,
    kind.value,
    0,
    limit,
  );
  if (ticket !== seq) return;
  loading.value = false;
  if (error) {
    loadError.value = error;
    if (opts.reset) {
      rows.value = [];
      hasMore.value = false;
    }
    return;
  }
  loadError.value = null;
  now.value = new Date();
  rows.value = page;
  hasMore.value = page.length === limit;
}

function reload() {
  void trash.loadKinds();
  void load();
}

let debounce: ReturnType<typeof setTimeout> | undefined;
watch(query, (v) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    const next = v.trim();
    if (next === q.value) return;
    q.value = next;
    void load({ reset: true });
  }, 150);
});

function clearSearch() {
  clearTimeout(debounce);
  query.value = "";
  if (q.value) {
    q.value = "";
    void load({ reset: true });
  }
}
function onEscape(e: KeyboardEvent) {
  if (query.value) {
    e.preventDefault();
    clearSearch();
  } else {
    searchEl.value?.blur();
  }
}

function setKind(next: string | null) {
  if (kind.value === next) return;
  kind.value = next;
  void load({ reset: true });
}

function hasBatch(e: TrashEntry) {
  return e.batch_count > 1;
}
function childrenLine(e: TrashEntry) {
  return childrenSummary(e.children, e.child_count);
}
function hitsLine(e: TrashEntry) {
  return e.hits?.length ? `matched in: ${e.hits.join(", ")}` : "";
}

async function restore(e: TrashEntry, batch = false) {
  if (busy.value.has(e.id)) return;
  busy.value.add(e.id);
  try {
    const { result, error } = await trash.restore(e.id, batch);
    if (error || !result) {
      toast.show(`could not restore "${clip(e.title)}". try again`);
      return;
    }
    // Success is the entry's own row coming back, not "something did".
    const selfBack = isSelfBack(e, result);
    // Off the list: every visible entry of this deletion whose row is live
    // again (the entry itself, and for a batch the rest of it). An older
    // entry for the same row, from another deletion, stays: the server
    // still lists it.
    const live = new Set(
      result.restored.map((r) => `${r.table}:${String(r.id)}`),
    );
    const before = rows.value.length;
    rows.value = rows.value.filter(
      (r) =>
        !(r.tx_id === e.tx_id && live.has(`${r.source_table}:${r.row_id}`)),
    );
    const gone = before - rows.value.length;
    const alsoBack = Math.max(0, gone - (selfBack ? 1 : 0));
    const action =
      selfBack && e.source_table === "todos"
        ? openTaskHereAction(e.row_id)
        : undefined;
    toast.show(restoreMessage(e, result, selfBack, alsoBack), action);
    void trash.loadKinds();
    // A batch with skips: the server knows which ones stayed.
    if (batch && result.skipped.length) void load();
  } finally {
    busy.value.delete(e.id);
  }
}

// Other tabs, routines and this app delete things while the page is open;
// every todo write bumps rev. Coalesced like the state lists.
let revTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => vault.rev,
  () => {
    clearTimeout(revTimer);
    revTimer = setTimeout(reload, 300);
  },
);

onMounted(reload);
onBeforeUnmount(() => {
  clearTimeout(debounce);
  clearTimeout(revTimer);
});
</script>

<template>
  <section class="list-column t-page">
    <div class="t-head">
      <h1 class="t-title">trash</h1>
      <span class="t-meta"
        >{{ totalLabel }} · deleted things land here and stay until you restore
        them</span
      >
    </div>

    <div class="t-controls">
      <div role="search" class="t-search-wrap">
        <input
          ref="searchEl"
          v-model="query"
          type="text"
          inputmode="search"
          enterkeyhint="search"
          class="input-bare t-search"
          placeholder="search the trash"
          aria-label="search the trash"
          autocomplete="off"
          spellcheck="false"
          @keydown.esc="onEscape"
        />
      </div>
      <div
        v-if="chips.length"
        class="t-kinds"
        role="group"
        aria-label="filter by kind"
      >
        <button
          type="button"
          class="chip"
          :aria-pressed="kind === null"
          @click="setKind(null)"
        >
          all {{ totalLabel }}
        </button>
        <button
          v-for="k in chips"
          :key="k.source_table"
          type="button"
          class="chip"
          :aria-pressed="kind === k.source_table"
          @click="setKind(k.source_table)"
        >
          {{ pluralize(kindLabel(k.source_table)) }} {{ k.n }}
        </button>
      </div>
    </div>

    <div v-if="loading && !rows.length" class="d-empty">loading the trash…</div>
    <div v-else-if="loadError && !rows.length" class="d-empty">
      <p>could not read the trash.</p>
      <button type="button" class="chip" @click="reload">try again</button>
    </div>
    <div v-else-if="!rows.length && q" class="d-empty">
      <p>
        nothing deleted matches "{{ q }}"<span v-if="kind">
          among {{ kindPlural }}</span
        >.
      </p>
      <div class="t-empty-actions">
        <button type="button" class="chip" @click="clearSearch">
          clear search
        </button>
        <button
          v-if="kind"
          type="button"
          class="chip"
          @click="setKind(null)"
        >
          show all
        </button>
      </div>
    </div>
    <div v-else-if="!rows.length && kind" class="d-empty">
      <p>no deleted {{ kindPlural }} left.</p>
      <button type="button" class="chip" @click="setKind(null)">
        show all
      </button>
    </div>
    <div v-else-if="!rows.length" class="d-empty">
      <p>nothing in the trash.</p>
      <router-link to="/today" class="chip">go to today</router-link>
    </div>

    <div v-else class="t-list" :aria-busy="loading">
      <section v-for="day in days" :key="day.key" class="t-day">
        <h2 class="cap t-day-label">{{ day.label }}</h2>
        <ul class="t-rows">
          <li v-for="e in day.entries" :key="e.id" class="t-row">
            <div class="t-body">
              <p class="t-name">{{ e.title }}</p>
              <p class="cap t-cap">{{ captionOf(e, now) }}</p>
              <p v-if="e.detail" class="t-detail">{{ e.detail }}</p>
              <p v-if="childrenLine(e)" class="t-extra t-children">
                {{ childrenLine(e) }}
              </p>
              <p v-if="hitsLine(e)" class="t-extra t-hits">
                {{ hitsLine(e) }}
              </p>
            </div>
            <div class="t-actions">
              <button
                type="button"
                class="chip t-restore"
                :disabled="busy.has(e.id)"
                :aria-label="
                  busy.has(e.id) ? `restoring ${e.title}` : `restore ${e.title}`
                "
                @click="restore(e)"
              >
                {{ busy.has(e.id) ? "restoring…" : "restore" }}
              </button>
              <button
                v-if="hasBatch(e)"
                type="button"
                class="chip chip-quiet t-restore-all"
                :disabled="busy.has(e.id)"
                :aria-label="`restore all ${e.batch_count} deleted with ${e.title}`"
                :title="`restore all ${e.batch_count} deleted with ${e.title}`"
                @click="restore(e, true)"
              >
                restore all {{ e.batch_count }}
              </button>
            </div>
          </li>
        </ul>
      </section>
      <div v-if="loadError || hasMore" class="t-more">
        <!-- A failed refresh or "load more" keeps the list; it says so here,
             quietly, beside the way to try again. -->
        <template v-if="loadError">
          <p class="t-load-error" role="status">
            could not refresh the trash.
          </p>
          <button type="button" class="chip chip-quiet" @click="reload">
            try again
          </button>
        </template>
        <button
          v-else
          type="button"
          class="chip"
          :disabled="loading"
          @click="load({ more: true })"
        >
          {{ loading ? "loading…" : "load more" }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.t-page {
  max-width: 760px;
}
.t-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--hair);
}
.t-title {
  font-size: var(--fs-sub);
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ink);
}
.t-meta {
  min-width: 0;
  font-size: var(--fs-small);
  color: var(--ink-50);
}
.t-controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2) 0 var(--space-3);
}
.t-search {
  font-size: var(--fs-row);
}
.t-kinds {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}
.t-day + .t-day {
  margin-top: var(--space-4);
}
.t-day-label {
  padding: var(--space-3) 0 var(--space-1);
  border-bottom: 1px solid var(--hair);
}
.t-rows {
  list-style: none;
  margin: 0;
  padding: 0;
}
.t-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-1);
  border-bottom: 1px solid var(--hair);
  transition: background var(--dur-fast) var(--ease-out);
}
@media (hover: hover) {
  .t-row:hover {
    background: var(--ground-2);
  }
}
.t-body {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.t-name {
  font-size: var(--fs-row);
  line-height: 1.35;
  color: var(--ink);
  overflow-wrap: anywhere;
}
.t-cap {
  overflow-wrap: anywhere;
}
.t-detail {
  font-size: var(--fs-small);
  line-height: 1.4;
  color: var(--ink-50);
  white-space: pre-line;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.t-extra {
  font-size: var(--fs-small);
  color: var(--ink-50);
  overflow-wrap: anywhere;
}
.t-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-1);
  flex-shrink: 0;
}
.t-more {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4) 0;
}
.t-load-error {
  font-size: var(--fs-small);
  color: var(--ink-50);
}
.t-empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}
/* Phone: the row is the full width and the actions take their own line
   under it, so a long title is never squeezed beside two chips. The kinds
   become one line that scrolls sideways inside itself, never the page. */
@media (max-width: 600px) {
  .t-row {
    flex-wrap: wrap;
    padding: var(--space-3) 0;
  }
  .t-actions {
    flex-basis: 100%;
    justify-content: flex-start;
  }
  /* The padding gives a chip's focus ring room inside the scroller, which
     clips it otherwise; the matching negative margin keeps the chips where
     they were. */
  .t-kinds {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    padding: var(--space-2) var(--space-1);
    margin: calc(-1 * var(--space-2)) calc(-1 * var(--space-1));
  }
  .t-kinds::-webkit-scrollbar {
    display: none;
  }
}
</style>
