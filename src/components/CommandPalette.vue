<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useVaultStore } from "../stores/vault";
import { supabase } from "../lib/supabase";
import type { TodoRow } from "../types/database";

type Result =
  | { kind: "area"; id: string; label: string; sublabel: string; slug: string }
  | {
      kind: "project";
      id: string;
      label: string;
      sublabel: string;
      slug: string;
    }
  | {
      kind: "todo";
      id: string;
      label: string;
      sublabel: string;
      todo: TodoRow;
    }
  | {
      kind: "command";
      id: string;
      label: string;
      sublabel: string;
      run: () => void;
    };

const router = useRouter();
const vault = useVaultStore();
const { areas, projects } = storeToRefs(vault);

const open = ref(false);
const query = ref("");
const remoteTodos = ref<TodoRow[]>([]);
const selectedIndex = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);
let searchSeq = 0;

function onKeydown(e: KeyboardEvent) {
  // Cmd+K or Ctrl+K opens the palette
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault();
    toggle();
    return;
  }
  if (!open.value) return;
  if (e.key === "Escape") {
    e.preventDefault();
    close();
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    selectedIndex.value = Math.min(
      selectedIndex.value + 1,
      results.value.length - 1,
    );
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
  } else if (e.key === "Enter") {
    e.preventDefault();
    activate(results.value[selectedIndex.value]);
  }
}

function open_() {
  open.value = true;
  query.value = "";
  remoteTodos.value = [];
  selectedIndex.value = 0;
  void nextTick(() => inputEl.value?.focus());
}
function close() {
  open.value = false;
}
function toggle() {
  if (open.value) close();
  else open_();
}

// Debounced remote search across todos table
let debounceTimer: number | undefined;
watch(query, (q) => {
  selectedIndex.value = 0;
  window.clearTimeout(debounceTimer);
  if (!q.trim()) {
    remoteTodos.value = [];
    return;
  }
  const seq = ++searchSeq;
  debounceTimer = window.setTimeout(async () => {
    await supabase.auth.getSession();
    // ilike on title; could later widen to notes / drafts / memory_entries
    const safe = q.replace(/[%_]/g, "\\$&");
    const { data } = await supabase
      .from("todos")
      .select("*")
      .ilike("title", `%${safe}%`)
      .limit(20);
    if (seq !== searchSeq) return; // stale
    remoteTodos.value = data ?? [];
  }, 150);
});

const results = computed<Result[]>(() => {
  const q = query.value.trim().toLowerCase();
  const out: Result[] = [];

  // Commands first (always present)
  const commands: Result[] = [
    {
      kind: "command",
      id: "cmd-today",
      label: "go to today",
      sublabel: "g t",
      run: () => router.push("/today"),
    },
    {
      kind: "command",
      id: "cmd-inbox",
      label: "go to inbox",
      sublabel: "g i",
      run: () => router.push("/inbox"),
    },
  ];

  if (!q) {
    return commands;
  }

  // Areas + projects match locally
  for (const a of areas.value) {
    if (a.name.toLowerCase().includes(q)) {
      out.push({
        kind: "area",
        id: a.id,
        label: a.name,
        sublabel: "area",
        slug: a.slug,
      });
    }
  }
  for (const p of projects.value) {
    if (p.name.toLowerCase().includes(q)) {
      const area = areas.value.find((a) => a.id === p.area_id);
      out.push({
        kind: "project",
        id: p.id,
        label: p.name,
        sublabel: `project · ${area?.name ?? ""}`,
        slug: p.slug,
      });
    }
  }
  // Todos from remote search
  for (const t of remoteTodos.value) {
    const project = projects.value.find((p) => p.id === t.project_id);
    out.push({
      kind: "todo",
      id: t.id,
      label: t.title,
      sublabel: [t.priority ?? "", project?.name ?? "", t.state]
        .filter(Boolean)
        .join(" · "),
      todo: t,
    });
  }
  // Commands that match query
  for (const c of commands) {
    if (c.label.toLowerCase().includes(q)) out.push(c);
  }
  return out;
});

function activate(r: Result | undefined) {
  if (!r) return;
  if (r.kind === "area") router.push(`/area/${r.slug}`);
  else if (r.kind === "project") router.push(`/project/${r.slug}`);
  else if (r.kind === "todo") {
    if (r.todo.project_id) {
      const p = projects.value.find((p) => p.id === r.todo.project_id);
      if (p) router.push(`/project/${p.slug}`);
    } else {
      router.push("/inbox");
    }
  } else if (r.kind === "command") r.run();
  close();
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  window.clearTimeout(debounceTimer);
});

// Expose imperative open for app shell trigger
defineExpose({ open: open_ });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-start justify-center pt-s-8 px-s-4"
      role="dialog"
      aria-modal="true"
      aria-label="command palette"
      @click.self="close"
    >
      <div
        class="absolute inset-0 bg-text-primary/30"
        aria-hidden="true"
        @click="close"
      ></div>
      <div
        class="relative w-full max-w-xl bg-bg border border-border-light shadow-xl"
      >
        <input
          ref="inputEl"
          v-model="query"
          type="text"
          class="w-full px-s-5 py-s-4 bg-transparent text-base border-b border-border-light focus:outline-none"
          placeholder="search areas, projects, tasks…"
          autocomplete="off"
        />
        <ul class="max-h-96 overflow-y-auto" role="listbox">
          <li
            v-for="(r, i) in results"
            :key="r.kind + ':' + r.id"
            :class="[
              'flex items-baseline justify-between px-s-5 py-s-3 cursor-pointer',
              i === selectedIndex ? 'bg-pill-upcoming-bg' : '',
            ]"
            role="option"
            :aria-selected="i === selectedIndex"
            @mouseenter="selectedIndex = i"
            @click="activate(r)"
          >
            <span class="text-text-primary truncate">{{ r.label }}</span>
            <span
              class="font-mono uppercase tracking-tracked text-meta text-text-tertiary ml-s-4 flex-shrink-0"
            >
              {{ r.sublabel }}
            </span>
          </li>
          <li
            v-if="results.length === 0"
            class="px-s-5 py-s-4 text-text-tertiary text-caption"
          >
            no matches
          </li>
        </ul>
        <div
          class="px-s-5 py-s-2 hairline font-mono uppercase tracking-tracked text-meta text-text-tertiary flex justify-between"
        >
          <span>↑↓ navigate · ↩ open · esc close</span>
          <span>⌘k</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
