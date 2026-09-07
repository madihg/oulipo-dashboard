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
import { useTodoModalStore } from "../stores/todoModal";
import { supabase } from "../lib/supabase";
import { TODO_SELECT, withTags, type JoinedTodoRow } from "../lib/todoTags";
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
const todoModal = useTodoModalStore();
const { areas, projects } = storeToRefs(vault);

const open = ref(false);
const query = ref("");
const remoteTodos = ref<TodoRow[]>([]);
// True between a keystroke and its search returning, so the empty state can
// say "searching" instead of flashing "no matches" on every query.
const searching = ref(false);
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
    searching.value = false;
    return;
  }
  searching.value = true;
  const seq = ++searchSeq;
  debounceTimer = window.setTimeout(async () => {
    await supabase.auth.getSession();
    // ilike on title; could later widen to notes / drafts / memory_entries
    const safe = q.replace(/[%_]/g, "\\$&");
    // Open work first. With no order clause the rows came back in storage
    // order, so a finished task from months ago could sit above the live one
    // you were looking for. Done rows are still reachable, below the open
    // ones, because the logbook is searched here too.
    const { data } = await supabase
      .from("todos")
      .select(TODO_SELECT)
      .ilike("title", `%${safe}%`)
      .order("completed_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false })
      .limit(20);
    if (seq !== searchSeq) return; // stale
    remoteTodos.value = withTags((data ?? []) as JoinedTodoRow[]);
    searching.value = false;
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
    // The rest of the primary nav, the tag registry and the system map live
    // only in the sidebar, which is display:none on a phone. The search tab
    // is the phone's one universal entry point, so every destination must be
    // reachable from here.
    {
      kind: "command",
      id: "cmd-anytime",
      label: "go to anytime",
      sublabel: "g a",
      run: () => router.push("/anytime"),
    },
    {
      kind: "command",
      id: "cmd-upcoming",
      label: "go to upcoming",
      sublabel: "g u",
      run: () => router.push("/upcoming"),
    },
    {
      kind: "command",
      id: "cmd-someday",
      label: "go to someday",
      sublabel: "g s",
      run: () => router.push("/someday"),
    },
    {
      kind: "command",
      id: "cmd-logbook",
      label: "go to logbook",
      sublabel: "g l",
      run: () => router.push("/logbook"),
    },
    {
      kind: "command",
      id: "cmd-settings",
      label: "tags",
      sublabel: "settings",
      run: () => router.push("/settings"),
    },
    {
      kind: "command",
      id: "cmd-system",
      label: "system map",
      sublabel: "settings",
      run: () => router.push("/system"),
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
  // Todos from remote search: open before done, then the tighter match first
  // (a hit at the start of a title beats one buried in the middle).
  const CLOSED = new Set(["completed", "cancelled", "logbook"]);
  const ranked = [...remoteTodos.value].sort((a, b) => {
    const ca = CLOSED.has(a.state) ? 1 : 0;
    const cb = CLOSED.has(b.state) ? 1 : 0;
    if (ca !== cb) return ca - cb;
    const ia = a.title.toLowerCase().indexOf(q);
    const ib = b.title.toLowerCase().indexOf(q);
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
  });
  for (const t of ranked) {
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
    // Open the task itself in its editor (works regardless of where it lives).
    todoModal.open(r.todo);
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
      <!-- The dimmed white room: the page stays visible, quieted, rather than
           going dark under an ink scrim. -->
      <div class="pal-scrim" aria-hidden="true" @click="close"></div>
      <div class="pal">
        <input
          ref="inputEl"
          v-model="query"
          type="text"
          class="pal-input"
          placeholder="search or type a command"
          autocomplete="off"
          spellcheck="false"
        />
        <ul class="pal-list" role="listbox">
          <li
            v-for="(r, i) in results"
            :key="r.kind + ':' + r.id"
            class="pal-row"
            :class="{ 'pal-row-on': i === selectedIndex }"
            role="option"
            :aria-selected="i === selectedIndex"
            @mouseenter="selectedIndex = i"
            @click="activate(r)"
          >
            <span class="pal-label">{{ r.label }}</span>
            <span class="pal-sub">{{ r.sublabel }}</span>
          </li>
          <li v-if="results.length === 0" class="pal-empty">
            {{ searching ? "searching" : "no matches" }}
          </li>
        </ul>
        <div class="pal-foot">
          <span>↑↓ navigate · ↩ open · esc close</span>
          <span>/ or ⌘k</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Machine mode (brand system, components.machine_mode): a centred palette on a
   dimmed white room, mono input with a cobalt caret, rows in ink mono. */
.pal-scrim {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.82);
}
@media (max-width: 600px) {
  .pal-scrim {
    background: rgba(255, 255, 255, 0.92);
  }
}
.pal {
  position: relative;
  width: 100%;
  max-width: 36rem;
  background: var(--paper);
  border: 1px solid var(--ink);
  border-radius: 2px;
}
.pal-input {
  width: 100%;
  padding: 14px 20px;
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: var(--fs-body);
  color: var(--ink);
  caret-color: var(--cobalt);
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--hair);
  outline: none;
}
.pal-input::placeholder {
  color: var(--ink-40);
}
@media (max-width: 767px) {
  .pal-input {
    /* iOS zooms any field under 16px on focus. */
    font-size: var(--fs-input);
  }
}
.pal-list {
  max-height: 24rem;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 4px 0;
}
.pal-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 20px;
  cursor: pointer;
  border-left: 2px solid transparent;
}
.pal-row-on {
  border-left-color: var(--cobalt);
  background: var(--cobalt-tint);
}
.pal-label {
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: var(--fs-row);
  color: var(--ink-85);
  text-transform: lowercase;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pal-sub {
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: var(--fs-caption);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-50);
  flex-shrink: 0;
}
.pal-empty {
  padding: 14px 20px;
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: var(--fs-small);
  color: var(--ink-50);
}
.pal-foot {
  display: flex;
  justify-content: space-between;
  padding: 8px 20px;
  border-top: 1px solid var(--hair);
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: var(--fs-caption);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-50);
}
</style>
