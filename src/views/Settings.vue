<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useVaultStore } from "../stores/vault";
import { supabase } from "../lib/supabase";
import { projectColorText } from "../composables/useProjectColor";

/**
 * Settings - app-level configuration. First (and so far only) panel: the tag
 * registry. Tags are the flat vocabulary chips on task rows ("suggested",
 * "offer", "claude-delivered", plus anything hand-made); this panel is where
 * they get created, renamed, recolored, and deleted. Deleting a tag also
 * detaches it from every task (vault.deleteTag clears the join rows).
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
  <div class="s-page">
    <h1 class="font-display text-xl lowercase mb-s-2">settings</h1>
    <p v-if="error" class="s-error">{{ error }}</p>

    <section class="s-section">
      <p class="s-caption">tags</p>
      <p class="s-hint">
        chips on task rows. the claude routine stamps suggested / task / offer /
        decision / claude-delivered; anything you add here is yours to use.
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
        <li v-for="tag in sorted" :key="tag.id" class="s-tag-row">
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
          <span class="s-count" :title="`${counts[tag.id] ?? 0} tasks`">
            {{ countsLoaded ? (counts[tag.id] ?? 0) : "·" }}
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
      <p v-if="countsLoaded && !sorted.length" class="s-hint">no tags yet.</p>
    </section>
  </div>
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
  margin-top: 16px;
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
.s-btn-danger {
  opacity: 0;
  color: var(--acc-versus-text);
}
.s-tag-row:hover .s-btn-danger,
.s-tag-row:focus-within .s-btn-danger {
  opacity: 1;
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
