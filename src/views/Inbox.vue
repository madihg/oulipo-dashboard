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
import type { CaptureRow } from "../types/database";

const vault = useVaultStore();
const toast = useToastStore();
const { inboxTodos, areas, projects } = storeToRefs(vault);

const captures = ref<CaptureRow[]>([]);
const routing = ref<Set<string>>(new Set());
const showAdd = ref(false);

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
  await supabase.from("captures").delete().eq("id", c.id);
  toast.show("dropped");
  void loadCaptures();
}

function projectsForArea(areaId: string) {
  return projects.value
    .filter((p) => p.area_id === areaId)
    .sort((a, b) => a.position - b.position);
}

const showProjectPickerFor = ref<string | null>(null);

const totalPending = computed(
  () => captures.value.length + inboxTodos.value.length,
);
</script>

<template>
  <section class="list-column">
    <DenseToolbar
      title="inbox"
      :meta="`capture · classify · route · ${totalPending} pending`"
      @new="showAdd = !showAdd"
    />

    <AddTaskInput
      v-if="showAdd"
      class="mb-s-4"
      placeholder="capture anything — sort it later"
      state="inbox"
    />

    <div v-if="totalPending === 0" class="d-empty">
      inbox zero. nothing to triage.
    </div>

    <div v-else class="d-inbox-stack">
      <!-- Each state surface as its own column header -->
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
            <p class="d-cap-text">{{ c.raw_text }}</p>
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

      <DenseGroup
        v-if="inboxTodos.length"
        label="inbox todos"
        :count="inboxTodos.length"
        accent="neutral"
        @add="showAdd = true"
      >
        <DenseRow
          v-for="t in inboxTodos"
          :key="t.id"
          :todo="t"
          :show-project="true"
        />
      </DenseGroup>
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
.d-inbox-stack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.d-cap-row {
  padding: 8px 10px;
  border-bottom: 1px solid var(--d-row-border);
}
.d-cap-text {
  font-size: 0.8125rem;
  color: var(--sl-900);
}
.d-cap-reason {
  margin-top: 4px;
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.6875rem;
  color: var(--sl-500);
  font-style: italic;
}
.d-cap-actions {
  margin-top: 6px;
  display: flex;
  gap: 6px;
}
.d-cap-btn {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-600);
  background: transparent;
  border: 1px solid var(--sl-200);
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
}
.d-cap-btn:hover {
  background: var(--sl-100);
}
.d-cap-btn-drop {
  color: var(--sl-400);
}
.d-cap-picker {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--sl-200);
}
.d-cap-area-label {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
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
