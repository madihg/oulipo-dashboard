<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import type { TodoRow } from "../types/database";
import { useVaultStore } from "../stores/vault";
import ChecklistEditor from "./ChecklistEditor.vue";
import TagPicker from "./TagPicker.vue";
import RepeatPicker from "./RepeatPicker.vue";

const props = defineProps<{ todo: TodoRow; autofocusTitle?: boolean }>();
const emit = defineEmits<{ close: [] }>();

const notesEl = ref<HTMLTextAreaElement | null>(null);
const titleEl = ref<HTMLInputElement | null>(null);
// Notes: collapsible block (toggle) + a linkified read view whose URLs are
// clickable; click the read view to edit (textarea) and blur to save.
const notesCollapsed = ref(false);
const notesEditing = ref(false);
function autogrow() {
  const el = notesEl.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
onMounted(() =>
  nextTick(() => {
    autogrow();
    if (props.autofocusTitle && titleEl.value) {
      titleEl.value.focus();
      titleEl.value.select();
    }
  }),
);

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
// Match full http(s)/www URLs AND bare domains with a known TLD (the notes here
// often store links as "pen.org/..."). A TLD allowlist avoids linkifying
// things like "e.g." or "file.txt".
const URL_RE =
  /((?:https?:\/\/|www\.)[^\s<]+|(?:[a-z0-9-]+\.)+(?:com|org|net|edu|gov|io|co|ai|app|dev|info|me|us|uk|ca|eu|xyz|pub|press|art|studio|news|fund|foundation)(?:\/[^\s<]*)?)/gi;
const notesHtml = computed(() =>
  escapeHtml(notes.value)
    .replace(URL_RE, (m) => {
      const href = /^https?:\/\//i.test(m) ? m : `https://${m}`;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="ed-link">${m}</a>`;
    })
    .replace(/\n/g, "<br>"),
);
function startEditNotes() {
  notesEditing.value = true;
  void nextTick(() => {
    notesEl.value?.focus();
    autogrow();
  });
}
function onPreviewClick(e: MouseEvent) {
  // Let link clicks open; only enter edit mode for clicks on the text itself.
  if ((e.target as HTMLElement).closest("a")) return;
  startEditNotes();
}
async function onNotesBlur() {
  await commitNotes();
  notesEditing.value = false;
}

const VAULT_NAME = "second-brain";
const obsidianHref = computed(() => {
  const explicit = (props.todo as { obsidian_uri?: string }).obsidian_uri;
  if (explicit) return explicit;
  const meta = (props.todo.metadata ?? {}) as { vault_path?: string };
  if (!meta.vault_path) return null;
  const path = encodeURIComponent(meta.vault_path);
  return `obsidian://open?vault=${encodeURIComponent(VAULT_NAME)}&file=${path}`;
});

const vault = useVaultStore();
const { areas, projects } = storeToRefs(vault);

const title = ref(props.todo.title);
const notes = ref(props.todo.notes ?? "");
const startDate = ref(props.todo.start_date ?? "");
const deadline = ref(props.todo.deadline ?? "");
const priority = ref<"P0" | "P1" | "P2" | "">(props.todo.priority ?? "");
const evening = ref(!!props.todo.evening);
const projectId = ref<string | null>(props.todo.project_id ?? null);
const areaId = ref<string | null>(props.todo.area_id ?? null);

watch(
  () => props.todo.id,
  () => {
    title.value = props.todo.title;
    notes.value = props.todo.notes ?? "";
    startDate.value = props.todo.start_date ?? "";
    deadline.value = props.todo.deadline ?? "";
    priority.value = props.todo.priority ?? "";
    evening.value = !!props.todo.evening;
    projectId.value = props.todo.project_id ?? null;
    areaId.value = props.todo.area_id ?? null;
    void nextTick(autogrow);
  },
);

const projectsInArea = computed(() => {
  if (!areaId.value) {
    return projects.value.slice().sort((a, b) => a.name.localeCompare(b.name));
  }
  return projects.value
    .filter((p) => p.area_id === areaId.value)
    .sort((a, b) => a.position - b.position);
});

async function commitArea() {
  // Changing area clears project if the project doesn't belong to the new area
  if (projectId.value) {
    const p = projects.value.find((x) => x.id === projectId.value);
    if (!p || p.area_id !== areaId.value) {
      projectId.value = null;
    }
  }
  const patch: Record<string, unknown> = {
    area_id: areaId.value,
    project_id: projectId.value,
  };
  // Assigning an area files the task out of the inbox so it doesn't linger in
  // both inbox and the area (capture creates tasks in the inbox by default).
  if (areaId.value && props.todo.state === "inbox") {
    patch.state = "anytime";
  }
  await vault.updateTodo(props.todo.id, patch as never);
}

async function commitProject() {
  // Changing project auto-syncs area
  const p = projects.value.find((x) => x.id === projectId.value);
  if (p) areaId.value = p.area_id;
  await vault.updateTodo(props.todo.id, {
    area_id: areaId.value,
    project_id: projectId.value,
  } as never);
}

async function saveField(field: string, value: unknown) {
  await vault.updateTodo(props.todo.id, { [field]: value || null } as never);
}

async function commitTitle() {
  if (title.value.trim() && title.value !== props.todo.title) {
    await saveField("title", title.value.trim());
  }
}
async function commitNotes() {
  if (notes.value !== (props.todo.notes ?? "")) {
    await saveField("notes", notes.value);
  }
}
async function commitDate(field: "start_date" | "deadline", v: string) {
  await saveField(field, v || null);
}
async function commitPriority(p: "P0" | "P1" | "P2" | "") {
  priority.value = p;
  await saveField("priority", p || null);
}
async function commitEvening() {
  await saveField("evening", evening.value);
}
</script>

<template>
  <div class="border-l-2 border-text-primary pl-s-4 py-s-3 my-s-2" @click.stop>
    <input
      ref="titleEl"
      v-model="title"
      type="text"
      class="input-bare font-semibold"
      @blur="commitTitle"
      @keydown.enter="commitTitle"
    />

    <!-- Priority pinned to the top of the editor for fast triage -->
    <div class="mt-s-3 flex items-center gap-s-2">
      <span
        class="font-mono text-meta uppercase tracking-tracked text-text-tertiary"
        >priority</span
      >
      <button
        v-for="p in ['P0', 'P1', 'P2', ''] as const"
        :key="p || 'none'"
        :class="[
          'pill interactive',
          priority === p ? 'bg-text-primary text-bg' : 'text-text-tertiary',
        ]"
        @click="commitPriority(p)"
      >
        {{ p || "none" }}
      </button>
    </div>

    <!-- Notes: collapsible block; read view renders URLs as clickable links -->
    <div class="mt-s-3">
      <button
        type="button"
        class="ed-notes-toggle interactive"
        :aria-expanded="!notesCollapsed"
        @click="notesCollapsed = !notesCollapsed"
      >
        <span
          class="ed-chev"
          :class="{ 'ed-chev-open': !notesCollapsed }"
          aria-hidden="true"
          >›</span
        >
        notes
      </button>
      <template v-if="!notesCollapsed">
        <textarea
          v-if="notesEditing || !notes"
          ref="notesEl"
          v-model="notes"
          placeholder="notes — markdown ok"
          rows="3"
          class="input-bare mt-s-2 resize-y overflow-hidden min-h-[96px] md:min-h-[18rem]"
          @input="autogrow"
          @blur="onNotesBlur"
        />
        <div
          v-else
          class="ed-notes-preview mt-s-2"
          @click="onPreviewClick"
          v-html="notesHtml"
        ></div>
      </template>
    </div>

    <div class="mt-s-3 flex flex-wrap gap-s-4 items-center">
      <label
        class="flex items-center gap-s-2 font-mono text-meta uppercase tracking-tracked text-text-tertiary"
      >
        area
        <select
          v-model="areaId"
          class="bg-transparent border-b border-border-light text-base text-text-primary lowercase"
          @change="commitArea"
        >
          <option :value="null">none</option>
          <option v-for="a in areas" :key="a.id" :value="a.id">
            {{ a.name }}
          </option>
        </select>
      </label>
      <label
        class="flex items-center gap-s-2 font-mono text-meta uppercase tracking-tracked text-text-tertiary"
      >
        project
        <select
          v-model="projectId"
          class="bg-transparent border-b border-border-light text-base text-text-primary lowercase"
          @change="commitProject"
        >
          <option :value="null">none</option>
          <option v-for="p in projectsInArea" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select>
      </label>
      <label
        class="flex items-center gap-s-2 font-mono text-meta uppercase tracking-tracked text-text-tertiary"
      >
        start
        <input
          v-model="startDate"
          type="date"
          class="bg-transparent border-b border-border-light text-base"
          @change="commitDate('start_date', startDate)"
        />
      </label>
      <label
        class="flex items-center gap-s-2 font-mono text-meta uppercase tracking-tracked text-text-tertiary"
      >
        deadline
        <input
          v-model="deadline"
          type="date"
          class="bg-transparent border-b border-border-light text-base"
          @change="commitDate('deadline', deadline)"
        />
      </label>
      <label
        class="flex items-center gap-s-2 font-mono text-meta uppercase tracking-tracked text-text-tertiary"
      >
        <input
          v-model="evening"
          type="checkbox"
          class="check"
          @change="commitEvening"
        />
        this evening
      </label>
    </div>

    <ChecklistEditor :todo-id="todo.id" />
    <TagPicker :todo-id="todo.id" />
    <RepeatPicker :todo-id="todo.id" />

    <!-- US-019 Obsidian longform link: open the vault note in Obsidian for
         make/write/learn-area todos. obsidian_uri stored on todos.obsidian_uri
         or inferred from metadata.vault_path. -->
    <div
      v-if="obsidianHref"
      class="mt-s-4 font-mono uppercase tracking-tracked text-meta"
    >
      <a
        :href="obsidianHref"
        class="interactive text-text-secondary"
        target="_blank"
        rel="noopener noreferrer"
      >
        → open in obsidian
      </a>
    </div>

    <div class="mt-s-3 flex justify-end">
      <button
        class="font-mono text-meta uppercase tracking-tracked text-text-tertiary interactive"
        @click="emit('close')"
      >
        close
      </button>
    </div>
  </div>
</template>

<style scoped>
.ed-notes-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-500);
  background: transparent;
  border: 0;
  cursor: pointer;
}
.ed-notes-toggle:hover {
  color: var(--sl-900);
}
.ed-chev {
  display: inline-block;
  transition: transform 120ms ease;
}
.ed-chev-open {
  transform: rotate(90deg);
}
.ed-notes-preview {
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--sl-800);
  white-space: pre-wrap;
  word-break: break-word;
  cursor: text;
  min-height: 1.5rem;
}
.ed-notes-preview :deep(.ed-link) {
  color: var(--acc-carnation-text);
  text-decoration: underline;
  word-break: break-all;
}
</style>
