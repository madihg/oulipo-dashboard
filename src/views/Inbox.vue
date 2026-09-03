<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useVaultStore } from "../stores/vault";
import { useToastStore } from "../stores/toast";
import { supabase } from "../lib/supabase";
import DenseToolbar from "../components/dense/DenseToolbar.vue";
import DenseGroup from "../components/dense/DenseGroup.vue";
import DenseRow from "../components/dense/DenseRow.vue";
import DenseStatusBar from "../components/dense/DenseStatusBar.vue";
import AddTaskInput from "../components/AddTaskInput.vue";
import { useListDragReorder } from "../composables/useListDragReorder";
import {
  applyControls,
  groupTodos,
  uniqueTagsFrom,
  useListControlsStore,
} from "../stores/listControls";
import type { CaptureRow } from "../types/database";
import ClaudeInboxSection from "../components/ClaudeInboxSection.vue";
import { pendingClaudeMetaOf } from "../types/claude";

const vault = useVaultStore();
const toast = useToastStore();
const { inboxTodos, areas, projects } = storeToRefs(vault);

const captures = ref<CaptureRow[]>([]);
const routing = ref<Set<string>>(new Set());
const showAdd = ref(false);

// Inbox todos: filter / sort / group via the shared controls (default a flat,
// manually-orderable queue so drag-to-reorder works out of the box).
const routeKey = "inbox";
const listControls = useListControlsStore();
if (!listControls.byRoute[routeKey]) {
  listControls.byRoute[routeKey] = {
    filter: { tags: [], priority: [], state: [] },
    sort: "manual",
    group: "none",
  };
}
const ctrl = computed(() => listControls.get(routeKey));
const availableTags = computed(() => uniqueTagsFrom(inboxTodos.value));
const projectsById = computed(() =>
  Object.fromEntries(
    projects.value.map((p) => [p.id, { name: p.name, slug: p.slug }]),
  ),
);
const areasById = computed(() =>
  Object.fromEntries(
    areas.value.map((a) => [a.id, { name: a.name, slug: a.slug }]),
  ),
);
// Rows the daily Claude routine proposed render in their own "from claude"
// section; "kept" AND "approved" ones rejoin the main lists (approve files
// the row immediately - Halim, 2026-08-18) and "dismissed"/"merged"
// tombstones (state cancelled, kept for the routine's dedupe) never render.
const claudeRows = computed(() =>
  inboxTodos.value.filter((t) => pendingClaudeMetaOf(t) !== null),
);
const plainInbox = computed(() =>
  inboxTodos.value.filter((t) => !claudeRows.value.includes(t)),
);
const visibleInbox = computed(() =>
  applyControls(plainInbox.value, ctrl.value),
);
const inboxGroups = computed(() =>
  groupTodos(
    visibleInbox.value,
    ctrl.value.group,
    projectsById.value,
    areasById.value,
  ),
);
const { setBodyRef } = useListDragReorder(inboxGroups, ref(routeKey));

async function loadCaptures() {
  await supabase.auth.getSession();
  const { data } = await supabase
    .from("captures")
    .select("*")
    .in("state", ["pending", "routing", "needs_review", "failed"])
    .order("created_at", { ascending: false })
    .limit(100);
  captures.value = (data as CaptureRow[]) ?? [];
}

async function loadAll() {
  await vault.loadAreasAndProjects();
  await vault.loadInbox();
  await loadCaptures();
}

let authSub: { unsubscribe: () => void } | null = null;
let captureChan: ReturnType<typeof supabase.channel> | null = null;

onMounted(() => {
  vault.currentProjectId = null;
  vault.currentAreaId = null;
  void loadAll();
  authSub = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") void loadAll();
  }).data.subscription;
  captureChan = supabase
    .channel("inbox-captures")
    .on(
      "postgres_changes",
      { event: "*", schema: "hmart", table: "captures" },
      () => void loadCaptures(),
    )
    .subscribe();
});
onBeforeUnmount(() => {
  authSub?.unsubscribe();
  if (captureChan) void supabase.removeChannel(captureChan);
});

const pendingByState = computed(() => {
  const groups: Record<string, CaptureRow[]> = {
    needs_review: [],
    routing: [],
    pending: [],
    failed: [],
  };
  for (const c of captures.value) {
    (groups[c.state] ??= []).push(c);
  }
  return groups;
});

async function rerouteCapture(c: CaptureRow) {
  routing.value.add(c.id);
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/route_capture`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ capture_id: c.id }),
      },
    );
  } finally {
    routing.value.delete(c.id);
    void loadCaptures();
  }
}

async function manualRoute(c: CaptureRow, projectId: string) {
  const project = projects.value.find((p) => p.id === projectId);
  if (!project) return;
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user?.id;
  if (!userId) return;
  const { data: todo } = await supabase
    .from("todos")
    .insert({
      user_id: userId,
      area_id: project.area_id,
      project_id: project.id,
      title: c.raw_text,
      notes: `> from inbox: "${c.raw_text}"`,
      state: "anytime",
    } as never)
    .select()
    .single();
  if (todo) {
    await supabase
      .from("captures")
      .update({
        state: "routed",
        routed_to_todo_id: todo.id,
        reasoning: "manually triaged",
      } as never)
      .eq("id", c.id);
    toast.show(`routed to ${project.name}`);
    void loadCaptures();
  }
}

async function dropCapture(c: CaptureRow) {
  // Stash the whole row first: this is a hard delete of what is often the only
  // copy of a pasted note, behind a 9px control sitting next to "route".
  const snapshot = { ...c };
  await supabase.from("captures").delete().eq("id", c.id);
  void loadCaptures();
  toast.show("dropped", {
    label: "undo",
    run: async () => {
      await supabase.from("captures").insert(snapshot as never);
      void loadCaptures();
    },
  });
}

function projectsForArea(areaId: string) {
  return projects.value
    .filter((p) => p.area_id === areaId)
    .sort((a, b) => a.position - b.position);
}

const showProjectPickerFor = ref<string | null>(null);
// Which capture is expanded to its full text (they can run to thousands of
// characters; the row shows one line until asked).
const expanded = ref<string | null>(null);

const totalPending = computed(
  () => captures.value.length + inboxTodos.value.length,
);

const DOT_BY_KEY: Record<string, string> = {
  P0: "var(--acc-carnation)",
  P1: "var(--acc-hard)",
  P2: "var(--acc-reverse)",
  ongoing: "var(--acc-ongoing)",
};
function dotFor(key: string): string {
  return DOT_BY_KEY[key] ?? "rgba(0,0,0,0.3)";
}
function headLabel(key: string, label: string): string {
  return key === "all" ? "inbox todos" : label;
}
</script>

<template>
  <section class="list-column">
    <DenseToolbar
      title="inbox"
      :meta="`capture · classify · route · ${totalPending} pending`"
      :route-key="routeKey"
      :available-tags="availableTags"
      hide-project-group
      @new="showAdd = !showAdd"
    />

    <p class="d-inbox-explain">
      the unfiled bucket - give a task an area, a project, or a "when" and it
      files itself out.
    </p>

    <AddTaskInput
      v-if="showAdd"
      class="mb-s-4"
      placeholder="capture anything - sort it later"
      state="inbox"
    />

    <div v-if="totalPending === 0" class="d-empty">
      inbox zero. everything is filed into an area, project, or date.
    </div>

    <div v-else class="d-inbox-stack">
      <!-- Captures awaiting AI triage (separate surface, kept on top) -->
      <template
        v-for="state in [
          'needs_review',
          'failed',
          'routing',
          'pending',
        ] as const"
        :key="state"
      >
        <DenseGroup
          v-if="pendingByState[state]?.length"
          :label="state.replace('_', ' ')"
          :count="pendingByState[state].length"
          :accent="
            state === 'needs_review'
              ? 'reinforcement'
              : state === 'failed'
                ? 'carnation'
                : state === 'routing'
                  ? 'hard'
                  : 'neutral'
          "
        >
          <div v-for="c in pendingByState[state]" :key="c.id" class="d-cap-row">
            <!-- Captures can be book-length (a pasted argument thread, a whole
                 note). One line by default, click to read the whole thing. -->
            <button
              class="d-cap-text"
              :title="c.raw_text.length > 120 ? 'click to expand' : undefined"
              @click="expanded = expanded === c.id ? null : c.id"
            >
              {{ c.raw_text }}
            </button>
            <p v-if="c.reasoning" class="d-cap-reason">
              {{ c.reasoning }}
              <span v-if="c.confidence != null">
                · conf {{ (c.confidence * 100).toFixed(0) }}%</span
              >
            </p>
            <div class="d-cap-actions">
              <button
                v-if="
                  state === 'needs_review' ||
                  state === 'failed' ||
                  state === 'pending'
                "
                class="d-cap-btn"
                :disabled="routing.has(c.id)"
                @click="rerouteCapture(c)"
              >
                {{ routing.has(c.id) ? "…" : "retry" }}
              </button>
              <button
                class="d-cap-btn"
                @click="
                  showProjectPickerFor =
                    showProjectPickerFor === c.id ? null : c.id
                "
              >
                route
              </button>
              <button class="d-cap-btn d-cap-btn-drop" @click="dropCapture(c)">
                drop
              </button>
            </div>
            <p v-if="expanded === c.id" class="d-cap-full">{{ c.raw_text }}</p>
            <!-- The inline reasoning line is hidden on phones, so the expander
                 is the only mobile surface for the routing rationale. -->
            <p
              v-if="expanded === c.id && c.reasoning"
              class="d-cap-full d-cap-full-reason"
            >
              {{ c.reasoning
              }}<span v-if="c.confidence != null">
                · conf {{ (c.confidence * 100).toFixed(0) }}%</span
              >
            </p>
            <div v-if="showProjectPickerFor === c.id" class="d-cap-picker">
              <div v-for="a in areas" :key="a.id" class="mb-s-2">
                <p class="d-cap-area-label">{{ a.name }}</p>
                <div class="flex flex-wrap gap-s-2 mt-s-1">
                  <button
                    v-for="p in projectsForArea(a.id)"
                    :key="p.id"
                    class="d-cap-proj-pill"
                    @click="
                      manualRoute(c, p.id);
                      showProjectPickerFor = null;
                    "
                  >
                    {{ p.name }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </DenseGroup>
      </template>

      <!-- Unfiled inbox todos: filter / sort / group + drag-to-reorder -->
      <div v-if="plainInbox.length" class="d-list">
        <section v-for="g in inboxGroups" :key="g.key" class="d-list-section">
          <header class="d-list-head">
            <span class="d-list-dot" :style="{ background: dotFor(g.key) }" />
            <span class="d-list-label">{{ headLabel(g.key, g.label) }}</span>
            <span class="d-list-count">{{ g.items.length }}</span>
          </header>
          <div
            class="d-list-body"
            :data-prio="g.key"
            :ref="(el) => setBodyRef(g.key, el)"
          >
            <div v-for="t in g.items" :key="t.id" :data-id="t.id">
              <DenseRow :todo="t" :show-project="true" />
            </div>
            <p v-if="!g.items.length" class="d-list-drop-hint">drop here</p>
          </div>
        </section>
      </div>

      <!-- What the daily routine found: suggestions, decisions, offers.
           Below Halim's own todos by design (2026-08-18); hides itself when
           empty. Gmail drafts no longer render anywhere in the app - they
           live in Gmail and the debrief. -->
      <ClaudeInboxSection :todos="claudeRows" />
    </div>

    <DenseStatusBar
      :rows="totalPending"
      :groups="
        Object.values(pendingByState).filter((g) => g.length).length +
        (inboxTodos.length ? 1 : 0)
      "
    />
  </section>
</template>

<style scoped>
.d-empty {
  font-size: 0.875rem;
  color: var(--sl-500);
  padding: 1rem 0;
}
.d-inbox-explain {
  font-size: 0.6875rem;
  line-height: 1.4;
  color: var(--sl-400);
  margin-bottom: 0.5rem;
  padding-bottom: 0.375rem;
  border-bottom: 1px solid var(--sl-200);
}
.d-inbox-stack {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.d-list {
  display: flex;
  flex-direction: column;
}
.d-list-section + .d-list-section {
  margin-top: 0.5rem;
}
.d-list-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid var(--sl-200);
}
.d-list-section:first-child .d-list-head {
  border-top: 0;
}
.d-list-body :deep(.d-row:last-child) {
  border-bottom: 0;
}
.d-list-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}
.d-list-label {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-900);
}
.d-list-count {
  font-size: 0.625rem;
  color: var(--sl-500);
  background: var(--sl-100);
  padding: 1px 6px;
  border-radius: 2px;
}
.d-list-drop-hint {
  padding: 10px 4px;
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-300);
}
/* Captures read as one line each, same rhythm as the "from claude" rows:
   text, dim reasoning, quiet actions at the right. The picker still opens
   underneath (flex-basis 100% breaks it onto its own line). */
.d-cap-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 2px 10px;
  min-height: 24px;
  border-bottom: 1px solid var(--d-row-border);
}
.d-cap-text {
  font-size: 0.75rem;
  line-height: 1.35;
  color: var(--sl-900);
  flex: 0 1 auto;
  max-width: 52%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
}
.d-cap-text:hover {
  text-decoration: underline;
}
.d-cap-full {
  flex-basis: 100%;
  margin: 4px 0 6px;
  max-height: 40vh;
  overflow-y: auto;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--sl-700);
  white-space: pre-wrap;
  border-left: 2px solid var(--hair);
  padding-left: 10px;
}
.d-cap-full-reason {
  margin-top: 0;
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  color: var(--sl-400);
}
.d-cap-reason {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  line-height: 1.35;
  color: var(--sl-400);
}
.d-cap-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  opacity: 0.4;
  transition: opacity 0.1s ease;
}
.d-cap-row:hover .d-cap-actions,
.d-cap-actions:focus-within {
  opacity: 1;
}
.d-cap-btn {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.5625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-600);
  background: transparent;
  border: 1px solid var(--sl-200);
  padding: 0 6px;
  line-height: 16px;
  border-radius: 2px;
  cursor: pointer;
  white-space: nowrap;
}
.d-cap-btn:hover {
  background: var(--sl-100);
}
.d-cap-btn-drop {
  color: var(--sl-400);
}
.d-cap-picker {
  flex-basis: 100%;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--sl-200);
}
/* Touch decides two things regardless of width: actions are revealed (no hover
   exists) and buttons keep a finger-sized floor - "drop" hard-deletes with no
   undo, so an 18px target on an iPad is how captures get lost. LAYOUT still
   lives in the width query below, where it can be seen in a dev browser. */
@media (pointer: coarse) {
  .d-cap-actions {
    opacity: 1;
  }
  .d-cap-btn {
    min-height: 32px;
    padding: 2px 10px;
  }
}
/* Phone: one compact line per capture - text · actions. The dim reasoning
   line steps aside (the full text is a tap away via the expander). */
@media (max-width: 600px) {
  .d-cap-row {
    padding: 6px 10px;
  }
  .d-cap-text {
    flex: 1 1 0;
    min-width: 0;
    max-width: none;
  }
  .d-cap-reason {
    display: none;
  }
  .d-cap-btn {
    min-height: 32px;
    padding: 2px 10px;
    font-size: 0.625rem;
  }
}
.d-cap-area-label {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-400);
}
.d-cap-proj-pill {
  font-size: 0.6875rem;
  color: var(--sl-700);
  background: var(--sl-100);
  border: 1px solid var(--sl-200);
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
  text-transform: lowercase;
}
.d-cap-proj-pill:hover {
  background: var(--sl-200);
}
</style>
