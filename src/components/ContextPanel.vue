<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { supabase } from "../lib/supabase";
import { useToastStore } from "../stores/toast";
import type { MemoryEntryRow } from "../types/database";

/**
 * Per-scope context editor: local instructions (kind 'project_rule') and the
 * running context note / wiki (kind 'wiki'), stored as hmart.memory_entries
 * rows with scope 'area:<slug>' or 'project:<slug>'. Every AI routine
 * (area_picker, route_capture, enrich_todo via buildContextBundle, and the
 * daily-desk scheduled task) resolves these layered global -> area -> project.
 *
 * The panel edits the CANONICAL row per kind (most recently updated); older
 * rows for the same kind+scope still feed the bundles and are counted here.
 */
const props = defineProps<{
  scope: string; // 'area:<slug>' | 'project:<slug>'
  label: string; // human name for placeholder copy
}>();

const toast = useToastStore();

const open = ref(localStorage.getItem(`ctx-open:${props.scope}`) === "1");
function toggleOpen() {
  open.value = !open.value;
  localStorage.setItem(`ctx-open:${props.scope}`, open.value ? "1" : "0");
}

interface Slot {
  kind: "project_rule" | "wiki";
  row: MemoryEntryRow | null;
  draft: string;
  extra: number; // additional non-canonical rows for this kind+scope
  saving: boolean;
}
const rules = ref<Slot>({
  kind: "project_rule",
  row: null,
  draft: "",
  extra: 0,
  saving: false,
});
const wiki = ref<Slot>({
  kind: "wiki",
  row: null,
  draft: "",
  extra: 0,
  saving: false,
});

async function load() {
  const { data } = await supabase
    .from("memory_entries")
    .select("*")
    .eq("scope", props.scope)
    .in("kind", ["project_rule", "wiki"])
    .order("last_updated_at", { ascending: false });
  const rows = (data as MemoryEntryRow[]) ?? [];
  for (const slot of [rules, wiki]) {
    const mine = rows.filter((r) => r.kind === slot.value.kind);
    slot.value.row = mine[0] ?? null;
    slot.value.draft = mine[0]?.body ?? "";
    slot.value.extra = Math.max(0, mine.length - 1);
  }
}
onMounted(() => void load());
watch(
  () => props.scope,
  () => void load(),
);

const DEFAULT_TITLE: Record<Slot["kind"], string> = {
  project_rule: "Rules",
  wiki: "Wiki",
};

// Takes the plain Slot: template refs auto-unwrap, so save(rules) in the
// template hands us the object, not the Ref.
async function save(slot: Slot) {
  const body = slot.draft.trim();
  const existing = slot.row;
  if (existing && body === existing.body) return;
  if (!existing && !body) return;
  slot.saving = true;
  try {
    const now = new Date().toISOString();
    if (existing) {
      const { error } = await supabase
        .from("memory_entries")
        .update({ body, last_updated_at: now } as never)
        .eq("id", existing.id);
      if (error) throw error;
      existing.body = body;
      existing.last_updated_at = now;
    } else {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user?.id;
      if (!userId) return;
      const { data, error } = await supabase
        .from("memory_entries")
        .insert({
          user_id: userId,
          kind: slot.kind,
          scope: props.scope,
          title: `${DEFAULT_TITLE[slot.kind]}: ${props.scope}`,
          body,
          last_updated_at: now,
        } as never)
        .select()
        .single();
      if (error) throw error;
      slot.row = data as MemoryEntryRow;
    }
    toast.show("context saved");
  } catch (e) {
    console.error("[context] save failed:", e);
    toast.show("save failed - try again");
  } finally {
    slot.saving = false;
  }
}

const hasAny = computed(
  () => !!rules.value.row?.body || !!wiki.value.row?.body,
);

function updatedLabel(row: MemoryEntryRow | null): string | null {
  if (!row) return null;
  const d = new Date(row.last_updated_at);
  return d
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toLowerCase();
}
</script>

<template>
  <section class="ctx">
    <button
      class="ctx-head"
      type="button"
      :aria-expanded="open"
      @click="toggleOpen"
    >
      <span class="ctx-caption">context</span>
      <span v-if="rules.row?.body" class="ctx-dot" title="rules set"></span>
      <span
        v-if="wiki.row?.body"
        class="ctx-dot ctx-dot-wiki"
        title="wiki set"
      ></span>
      <span v-if="!hasAny" class="ctx-empty-hint"
        >rules + wiki for this
        {{ scope.startsWith("area:") ? "area" : "project" }}</span
      >
      <span class="ctx-chev" :class="{ 'ctx-chev-open': open }">›</span>
    </button>

    <div v-if="open" class="ctx-body">
      <div class="ctx-slot">
        <div class="ctx-slot-head">
          <span class="ctx-slot-label">rules</span>
          <span class="ctx-slot-meta">
            local instructions - every routine that touches {{ label }} reads
            these<span v-if="updatedLabel(rules.row)">
              · updated {{ updatedLabel(rules.row) }}</span
            ><span v-if="rules.extra"> · +{{ rules.extra }} older entries</span>
          </span>
        </div>
        <textarea
          v-model="rules.draft"
          class="ctx-input"
          rows="4"
          :placeholder="`how to work inside ${label.toLowerCase()} - constraints, style, do/don't`"
          @blur="save(rules)"
          @keydown.meta.enter="save(rules)"
        ></textarea>
      </div>

      <div class="ctx-slot">
        <div class="ctx-slot-head">
          <span class="ctx-slot-label">wiki</span>
          <span class="ctx-slot-meta">
            running context - what's true right now, pulled into AI passes<span
              v-if="updatedLabel(wiki.row)"
            >
              · updated {{ updatedLabel(wiki.row) }}</span
            ><span v-if="wiki.extra"> · +{{ wiki.extra }} older entries</span>
          </span>
        </div>
        <textarea
          v-model="wiki.draft"
          class="ctx-input"
          rows="6"
          :placeholder="`the living note for ${label.toLowerCase()} - state, people, decisions, links`"
          @blur="save(wiki)"
          @keydown.meta.enter="save(wiki)"
        ></textarea>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ctx {
  border: 1px solid var(--sl-200);
  border-radius: 0;
  margin-bottom: 0.75rem;
  background: #ffffff;
}
.ctx-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
}
.ctx-caption {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--sl-500);
}
.ctx-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--acc-carnation);
}
.ctx-dot-wiki {
  background: var(--acc-reinforcement);
}
.ctx-empty-hint {
  font-size: 0.6875rem;
  color: var(--sl-400);
  text-transform: lowercase;
}
.ctx-chev {
  margin-left: auto;
  color: var(--sl-400);
  transition: transform 120ms ease;
}
.ctx-chev-open {
  transform: rotate(90deg);
}
.ctx-body {
  border-top: 1px solid var(--sl-200);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ctx-slot-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}
.ctx-slot-label {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-900);
}
.ctx-slot-meta {
  font-size: 0.6875rem;
  color: var(--sl-400);
  text-transform: lowercase;
}
.ctx-input {
  width: 100%;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--sl-900);
  background: transparent;
  border: 1px solid var(--sl-200);
  border-radius: 2px;
  padding: 8px 10px;
  resize: vertical;
}
.ctx-input:focus {
  outline: none;
  border-color: var(--acc-carnation);
}
.ctx-input::placeholder {
  color: var(--sl-400);
}
</style>
