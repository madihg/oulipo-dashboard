<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { supabase } from "../lib/supabase";
import DenseToolbar from "../components/dense/DenseToolbar.vue";
import DenseGroup from "../components/dense/DenseGroup.vue";
import DenseStatusBar from "../components/dense/DenseStatusBar.vue";
import type { MemoryEntryRow } from "../types/database";

const entries = ref<MemoryEntryRow[]>([]);
const filter = ref<"all" | MemoryEntryRow["kind"]>("all");
const search = ref("");
const expandedId = ref<string | null>(null);

async function load() {
  await supabase.auth.getSession();
  const { data } = await supabase
    .from("memory_entries")
    .select("*")
    .order("kind")
    .order("title");
  entries.value = (data as MemoryEntryRow[]) ?? [];
}

onMounted(load);

const kinds: Array<"all" | MemoryEntryRow["kind"]> = [
  "all",
  "user_rule",
  "project_rule",
  "feedback",
  "reference",
  "style_guide",
];

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return entries.value.filter((e) => {
    if (filter.value !== "all" && e.kind !== filter.value) return false;
    if (!q) return true;
    return (
      e.title.toLowerCase().includes(q) ||
      e.body.toLowerCase().includes(q) ||
      (e.scope ?? "").toLowerCase().includes(q)
    );
  });
});

const grouped = computed(() => {
  const map = new Map<string, MemoryEntryRow[]>();
  for (const e of filtered.value) {
    const list = map.get(e.kind) ?? [];
    list.push(e);
    map.set(e.kind, list);
  }
  return Array.from(map.entries());
});

function accentForKind(
  kind: MemoryEntryRow["kind"],
): "carnation" | "hard" | "reverse" | "reinforcement" | "neutral" {
  switch (kind) {
    case "user_rule":
      return "carnation";
    case "style_guide":
      return "reverse";
    case "project_rule":
      return "hard";
    case "feedback":
      return "reinforcement";
    default:
      return "neutral";
  }
}
</script>

<template>
  <section class="list-column">
    <DenseToolbar
      title="memory"
      :meta="`rules · style · references claude sees on every pick · ${entries.length} entries`"
    />

    <div class="d-mem-controls">
      <input
        v-model="search"
        type="search"
        placeholder="search title / body / scope"
        class="d-mem-search"
      />
      <select v-model="filter" class="d-mem-select">
        <option v-for="k in kinds" :key="k" :value="k">{{ k }}</option>
      </select>
    </div>

    <div v-if="filtered.length === 0" class="d-empty">no entries match.</div>

    <div v-else class="d-mem-stack">
      <DenseGroup
        v-for="[kind, list] in grouped"
        :key="kind"
        :label="kind.replace('_', ' ')"
        :count="list.length"
        :accent="accentForKind(kind as MemoryEntryRow['kind'])"
      >
        <div
          v-for="e in list"
          :key="e.id"
          class="d-mem-row"
          @click="expandedId = expandedId === e.id ? null : e.id"
        >
          <div class="d-mem-head">
            <p class="d-mem-title">{{ e.title }}</p>
            <span v-if="e.scope" class="d-mem-scope">{{ e.scope }}</span>
          </div>
          <pre v-if="expandedId === e.id" class="d-mem-body">{{ e.body }}</pre>
        </div>
      </DenseGroup>
    </div>

    <DenseStatusBar :rows="filtered.length" :groups="grouped.length" />
  </section>
</template>

<style scoped>
.d-empty {
  font-size: 0.875rem;
  color: var(--sl-500);
  padding: 1rem 0;
}
.d-mem-controls {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}
.d-mem-search {
  flex: 1;
  min-width: 200px;
  background: transparent;
  border: 1px solid var(--sl-200);
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 0.8125rem;
  color: var(--sl-900);
  outline: none;
  transition: border-color 150ms ease;
}
.d-mem-search:focus {
  border-color: var(--sl-500);
}
.d-mem-select {
  background: transparent;
  border: 1px solid var(--sl-200);
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 0.8125rem;
  color: var(--sl-900);
  text-transform: lowercase;
}
.d-mem-stack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.d-mem-row {
  padding: 8px 10px;
  border-bottom: 1px solid var(--d-row-border);
  cursor: pointer;
  transition: background 120ms ease;
}
.d-mem-row:hover {
  background: var(--d-row-bg-hover);
}
.d-mem-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}
.d-mem-title {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--sl-900);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.d-mem-scope {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-400);
}
.d-mem-body {
  margin-top: 8px;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 0.75rem;
  color: var(--sl-700);
  line-height: 1.5;
}
</style>
