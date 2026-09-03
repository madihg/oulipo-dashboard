<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useVaultStore } from "../stores/vault";
import { supabase } from "../lib/supabase";
import { projectColorText } from "../composables/useProjectColor";
import { CONTEXTS, CONTEXT_NAMES } from "../utils/contexts";

/**
 * Settings - app-level configuration. First panel: the tag registry, in two
 * parts. CONTEXTS are the seven fixed modes of work (utils/contexts.ts) - they
 * live in the tags table like anything else but cannot be renamed, recoloured
 * or deleted here, because the list grouping depends on their names and the
 * design system owns their colours. TAGS are everything else: created,
 * renamed, recoloured and deleted here. Deleting a tag also detaches it from
 * every task (vault.deleteTag clears the join rows first).
 */

const vault = useVaultStore();
const { tags, error } = storeToRefs(vault);

// task count per tag - loaded once on mount; cheap (join rows only).
const counts = ref<Record<string, number>>({});
const countsLoaded = ref(false);

const newName = ref("");
const editingId = ref<string | null>(null);
const editName = ref("");

onMounted(async () => {
  await vault.loadAreasAndProjects();
  const { data } = await supabase.from("todo_tags").select("tag_id");
  const c: Record<string, number> = {};
  for (const r of (data ?? []) as { tag_id: string }[]) {
    c[r.tag_id] = (c[r.tag_id] ?? 0) + 1;
  }
  counts.value = c;
  countsLoaded.value = true;
});

const sorted = computed(() =>
  [...tags.value].sort(
    (a, b) =>
      (counts.value[b.id] ?? 0) - (counts.value[a.id] ?? 0) ||
      a.name.localeCompare(b.name),
  ),
);
// Canonical order, joined to the registry row for its id (and so its count).
const contextRows = computed(() =>
  CONTEXTS.map((c) => ({
    ...c,
    row: tags.value.find((t) => t.name === c.name) ?? null,
  })),
);
const others = computed(() =>
  sorted.value.filter((t) => !CONTEXT_NAMES.includes(t.name)),
);
function countOf(id: string | undefined): string {
  if (!countsLoaded.value) return "·";
  return String(id ? (counts.value[id] ?? 0) : 0);
}

async function add() {
  const name = newName.value.trim();
  if (!name) return;
  await vault.createTag(name);
  newName.value = "";
}

function startRename(id: string, name: string) {
  editingId.value = id;
  editName.value = name;
}

async function commitRename() {
  if (!editingId.value) return;
  const id = editingId.value;
  editingId.value = null;
  await vault.updateTag(id, { name: editName.value });
}

async function onColorInput(id: string, e: Event) {
  const value = (e.target as HTMLInputElement).value;
  await vault.updateTag(id, { color: value });
}

async function clearColor(id: string) {
  await vault.updateTag(id, { color: null });
}

async function remove(id: string, name: string) {
  const n = counts.value[id] ?? 0;
  const suffix = n ? ` and removed from ${n} task${n === 1 ? "" : "s"}` : "";
  if (!confirm(`delete tag "${name}"${suffix}?`)) return;
  await vault.deleteTag(id);
  delete counts.value[id];
}

function swatch(name: string, color: string | null): string {
  return color || projectColorText(name);
}
</script>

<template>
  <section class="list-column s-page">
    <h1 class="font-display text-xl lowercase mb-s-2">settings</h1>
    <p v-if="error" class="s-error">{{ error }}</p>

    <section class="s-section">
      <p class="s-caption">contexts</p>
      <p class="s-hint">
        the seven modes of work, in the order a day runs. group or sort any list
        by context from its toolbar. these are part of the app, so they cannot
        be renamed or deleted here.
      </p>
      <ul class="s-tag-list">
        <li v-for="c in contextRows" :key="c.name" class="s-tag-row">
          <span class="s-tag-name s-tag-name-fixed">{{ c.name }}</span>
          <span class="s-ctx-hint">{{ c.hint }}</span>
          <span class="s-count" :title="`${countOf(c.row?.id)} tasks`">
            {{ countOf(c.row?.id) }}
          </span>
        </li>
      </ul>
    </section>

    <section class="s-section">
      <p class="s-caption">tags</p>
      <p class="s-hint">
        everything else. reservoir feeds the share page; claude-delivered is the
        routine's receipt on work you approved. anything you add is yours.
        deleting a tag removes it from every task.
      </p>

      <form class="s-add" @submit.prevent="add">
        <input
          v-model="newName"
          class="input-bare s-add-input"
          placeholder="new tag name"
          aria-label="new tag name"
        />
        <button type="submit" class="s-btn" :disabled="!newName.trim()">
          add
        </button>
      </form>

      <ul class="s-tag-list">
        <li v-for="tag in others" :key="tag.id" class="s-tag-row">
          <label
            class="s-swatch"
            :style="{ background: swatch(tag.name, tag.color) }"
            :title="tag.color ? tag.color : 'auto color - click to set'"
          >
            <input
              type="color"
              class="s-swatch-input"
              :value="tag.color || '#888888'"
              :aria-label="`color for ${tag.name}`"
              @change="onColorInput(tag.id, $event)"
            />
          </label>
          <template v-if="editingId === tag.id">
            <input
              v-model="editName"
              class="input-bare s-rename-input"
              :aria-label="`rename ${tag.name}`"
              autofocus
              @keydown.enter.prevent="commitRename"
              @keydown.esc="editingId = null"
              @blur="commitRename"
            />
          </template>
          <template v-else>
            <button
              class="s-tag-name interactive"
              :title="'rename ' + tag.name"
              @click="startRename(tag.id, tag.name)"
            >
              {{ tag.name }}
            </button>
          </template>
          <span class="s-count" :title="`${countOf(tag.id)} tasks`">
            {{ countOf(tag.id) }}
          </span>
          <button
            v-if="tag.color"
            class="s-btn s-btn-quiet"
            :title="`clear color for ${tag.name}`"
            @click="clearColor(tag.id)"
          >
            auto
          </button>
          <button
            class="s-btn s-btn-danger"
            :aria-label="`delete tag ${tag.name}`"
            @click="remove(tag.id, tag.name)"
          >
            delete
          </button>
        </li>
      </ul>
      <p v-if="countsLoaded && !others.length" class="s-hint">no tags yet.</p>
    </section>
  </section>
</template>

<style scoped>
.s-page {
  max-width: 560px;
}
.s-error {
  color: var(--acc-versus-text);
  font-size: 0.75rem;
  margin-bottom: 8px;
}
.s-section {
  margin-top: 20px;
}
.s-section + .s-section {
  margin-top: 28px;
}
.s-caption {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-500);
  margin-bottom: 4px;
}
.s-hint {
  font-size: 0.75rem;
  color: var(--sl-500);
  margin-bottom: 12px;
  max-width: 48ch;
}
.s-add {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.s-add-input {
  flex: 1 1 auto;
  font-size: 0.8125rem;
}
.s-btn {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 3px 8px;
  border: 1px solid var(--sl-300);
  border-radius: 3px;
  background: transparent;
  color: var(--sl-700);
  cursor: pointer;
  transition:
    color 120ms ease,
    border-color 120ms ease,
    background 120ms ease;
}
.s-btn:hover:not(:disabled) {
  border-color: var(--sl-500);
}
.s-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.s-btn-quiet {
  border-color: transparent;
  color: var(--sl-400);
}
/* Quiet until the row is attended to, but never hidden: a control that only
   exists on hover does not exist on a phone. */
.s-btn-danger {
  opacity: 0.45;
  color: var(--acc-versus-text);
}
.s-tag-row:hover .s-btn-danger,
.s-tag-row:focus-within .s-btn-danger {
  opacity: 1;
}
@media (pointer: coarse) {
  .s-btn-danger {
    opacity: 1;
  }
}
.s-btn-danger:hover {
  border-color: var(--acc-versus-text);
  background: rgba(229, 57, 28, 0.06);
}
.s-tag-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.s-tag-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
  border-bottom: 1px solid var(--d-row-border);
  min-height: 30px;
}
.s-swatch {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}
/* Scoped under the row so it beats .s-tag-name's flex: 1 1 auto, which is
   declared later; otherwise the name grows and the hint floats mid-row. */
.s-tag-row .s-tag-name-fixed {
  cursor: default;
  flex: 0 1 auto;
  min-width: 7ch;
}
.s-ctx-hint {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.75rem;
  color: var(--sl-500);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.s-swatch-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.s-tag-name {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.75rem;
  color: var(--sl-900);
  background: transparent;
  border: 0;
  padding: 0;
  cursor: text;
  text-align: left;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.s-rename-input {
  flex: 1 1 auto;
  font-size: 0.75rem;
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
}
.s-count {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.6875rem;
  color: var(--sl-400);
  min-width: 3ch;
  text-align: right;
}
</style>
