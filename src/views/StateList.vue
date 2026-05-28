<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useVaultStore } from "../stores/vault";
import { supabase } from "../lib/supabase";
import DenseToolbar from "../components/dense/DenseToolbar.vue";
import DenseGroup from "../components/dense/DenseGroup.vue";
import DenseRow from "../components/dense/DenseRow.vue";
import DenseStatusBar from "../components/dense/DenseStatusBar.vue";
import AddTaskInput from "../components/AddTaskInput.vue";
import type { TodoRow } from "../types/database";

const route = useRoute();
const vault = useVaultStore();

const mode = computed(
  () => (route.meta.stateMode as string) ?? (route.name as string),
);

// captureState narrows mode for AddTaskInput. Kept in script (not the template)
// so the union type's `|` isn't misparsed as a deprecated Vue filter.
const captureState = computed(
  () => mode.value as "anytime" | "someday" | "today" | "inbox",
);

const items = ref<TodoRow[]>([]);
const showAdd = ref(false);

async function load() {
  await vault.loadAreasAndProjects();
  if (mode.value === "anytime") {
    items.value = await vault.loadByState({ state: "anytime" });
  } else if (mode.value === "upcoming") {
    const today = new Date().toISOString().slice(0, 10);
    items.value = await vault.loadByState({ startDateAfter: today });
  } else if (mode.value === "someday") {
    items.value = await vault.loadByState({ state: "someday" });
  } else if (mode.value === "logbook") {
    items.value = await vault.loadByState({
      completedOnly: true,
      limit: 200,
    });
  }
}

watch(mode, () => void load());

let authSub: { unsubscribe: () => void } | null = null;
onMounted(() => {
  void load();
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") void load();
  });
  authSub = data.subscription;
});
onBeforeUnmount(() => authSub?.unsubscribe());

interface Bucket {
  label: string;
  count: number;
  rows: TodoRow[];
}

const grouped = computed<Bucket[]>(() => {
  if (mode.value === "logbook") {
    const map = new Map<string, TodoRow[]>();
    for (const t of items.value) {
      const key = t.completed_at
        ? new Date(t.completed_at).toISOString().slice(0, 10)
        : "—";
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([k, rows]) => ({ label: labelOf(k), count: rows.length, rows }));
  }
  if (mode.value === "upcoming") {
    const map = new Map<string, TodoRow[]>();
    for (const t of items.value) {
      const key = t.start_date ?? "—";
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, rows]) => ({ label: labelOf(k), count: rows.length, rows }));
  }
  // anytime / someday: group by area
  const map = new Map<string, TodoRow[]>();
  for (const t of items.value) {
    const area = vault.areas.find((a) => a.id === t.area_id);
    const key = area?.name ?? "—";
    const list = map.get(key) ?? [];
    list.push(t);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, rows]) => ({ label: k, count: rows.length, rows }));
});

function labelOf(g: string): string {
  if (mode.value === "logbook" && /^\d{4}-\d{2}-\d{2}$/.test(g)) {
    return new Date(g).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
  if (mode.value === "upcoming" && /^\d{4}-\d{2}-\d{2}$/.test(g)) {
    return new Date(g).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
  return g;
}
</script>

<template>
  <section class="list-column">
    <DenseToolbar
      :title="mode"
      :meta="`${items.length} ${mode === 'logbook' ? 'done' : 'open'}`"
      @new="showAdd = !showAdd"
    />

    <AddTaskInput
      v-if="mode !== 'logbook' && showAdd"
      class="mb-s-4"
      :placeholder="`new task — ${mode}`"
      :state="captureState"
    />

    <div v-if="items.length === 0" class="d-empty">nothing here.</div>

    <div v-else class="d-state-grid">
      <DenseGroup
        v-for="g in grouped"
        :key="g.label"
        :label="g.label"
        :count="g.count"
        accent="neutral"
      >
        <DenseRow
          v-for="t in g.rows"
          :key="t.id"
          :todo="t"
          :show-project="true"
        />
      </DenseGroup>
    </div>

    <DenseStatusBar :rows="items.length" :groups="grouped.length" />
  </section>
</template>

<style scoped>
.d-empty {
  font-size: 0.875rem;
  color: var(--sl-500);
  padding: 1rem 0;
}
.d-state-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 0.75rem;
}
</style>
