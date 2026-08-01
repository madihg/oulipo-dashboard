<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { useVaultStore } from "../stores/vault";
import { useToastStore } from "../stores/toast";
import { useTodoModalStore } from "../stores/todoModal";
import { supabase } from "../lib/supabase";
import DenseGroup from "./dense/DenseGroup.vue";
import { projectColor } from "../composables/useProjectColor";
import {
  claudeMetaOf,
  resolveSuggestedArea,
  type ClaudeMeta,
} from "../types/claude";
import type {
  ClaudeTaskRow,
  InboxReplyDraftRow,
  TodoRow,
} from "../types/database";

/**
 * "from claude" - the Inbox section for what the daily routine found:
 * suggested tasks, decisions to make, and offers Claude can execute once
 * approved. Also lists Gmail reply drafts awaiting review (read from
 * inbox_reply_drafts; drafts are never tasks and never send themselves).
 *
 * Approving an offer inserts a queued hmart.claude_tasks row; the next
 * routine run executes it and writes the result back. Run status is shown
 * live via a realtime channel.
 */
const props = defineProps<{ todos: TodoRow[] }>();
const vault = useVaultStore();
const toast = useToastStore();
const todoModal = useTodoModalStore();

const drafts = ref<InboxReplyDraftRow[]>([]);
const runsByTodo = ref<Record<string, ClaudeTaskRow>>({});
const instructions = reactive<Record<string, string>>({});
const approving = ref<Set<string>>(new Set());

const rows = computed(() =>
  props.todos.flatMap((t) => {
    const meta = claudeMetaOf(t);
    if (!meta) return [];
    const area = resolveSuggestedArea(meta, vault.areas);
    return [{ todo: t, meta, area }];
  }),
);
const count = computed(() => rows.value.length + drafts.value.length);

const KIND_LABEL: Record<ClaudeMeta["kind"], string> = {
  task: "suggested",
  decision: "decision",
  offer: "offer",
};
const RUN_LABEL: Record<string, string> = {
  queued: "queued",
  running: "running…",
  completed: "done",
  failed: "failed",
};

async function loadDrafts() {
  const { data } = await supabase
    .from("inbox_reply_drafts")
    .select("*")
    .in("status", ["pending", "drafted_in_gmail"])
    .order("generated_at", { ascending: false });
  drafts.value = (data as InboxReplyDraftRow[]) ?? [];
}

async function loadRuns() {
  const ids = props.todos.map((t) => t.id);
  if (!ids.length) {
    runsByTodo.value = {};
    return;
  }
  const { data } = await supabase
    .from("claude_tasks")
    .select("*")
    .in("todo_id", ids)
    .order("created_at", { ascending: false });
  const map: Record<string, ClaudeTaskRow> = {};
  for (const r of (data as ClaudeTaskRow[]) ?? []) {
    if (r.todo_id && !map[r.todo_id]) map[r.todo_id] = r;
  }
  runsByTodo.value = map;
}

watch(
  () => props.todos.map((t) => t.id).join(","),
  () => void loadRuns(),
);

let chan: ReturnType<typeof supabase.channel> | null = null;
onMounted(() => {
  void loadDrafts();
  void loadRuns();
  chan = supabase
    .channel("claude-inbox")
    .on(
      "postgres_changes",
      { event: "*", schema: "hmart", table: "claude_tasks" },
      () => void loadRuns(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "hmart", table: "inbox_reply_drafts" },
      () => void loadDrafts(),
    )
    .subscribe();
});
onBeforeUnmount(() => {
  if (chan) void supabase.removeChannel(chan);
});

async function keep(t: TodoRow, meta: ClaudeMeta) {
  // Suggestions arrive unfiled by design (an area_id would keep them out of
  // the inbox entirely). Keeping one applies the routine's suggested area for
  // real, so it files itself instead of landing back in the unsorted pile.
  const area = resolveSuggestedArea(meta, vault.areas);
  // Merge, never overwrite, the metadata jsonb - other namespaces
  // (e.g. reservoir) must survive.
  await vault.updateTodo(t.id, {
    ...(area ? { area_id: area.id } : {}),
    metadata: { ...(t.metadata ?? {}), claude: { ...meta, status: "kept" } },
  } as never);
  toast.show(
    area ? `kept - filed into ${area.name}` : "kept - it's in your inbox now",
  );
}

async function dismiss(t: TodoRow, meta: ClaudeMeta) {
  // Revoke any not-yet-started run first, with a server-side status guard so
  // a row the routine already flipped to 'running' is left alone.
  await supabase
    .from("claude_tasks")
    .delete()
    .eq("todo_id", t.id)
    .eq("status", "queued");
  // Tombstone, don't hard-delete: the routine dedupes on source_id, and a
  // dismissed suggestion must stay visible to that query or it comes back
  // every run. state 'cancelled' removes it from every list.
  await vault.updateTodo(t.id, {
    state: "cancelled",
    metadata: {
      ...(t.metadata ?? {}),
      claude: { ...meta, status: "dismissed" },
    },
  } as never);
  toast.show("dismissed - it won't come back");
}

// An offer with a queued or running claude_tasks row must not queue again.
function hasActiveRun(id: string): boolean {
  const s = runsByTodo.value[id]?.status;
  return s === "queued" || s === "running";
}

async function approve(t: TodoRow, meta: ClaudeMeta) {
  if (hasActiveRun(t.id) || approving.value.has(t.id)) return;
  approving.value.add(t.id);
  try {
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess.session?.user?.id;
    if (!userId) return;
    const extra = (instructions[t.id] ?? "").trim();
    const prompt = [
      `task: ${t.title}`,
      meta.offer ? `offer: ${meta.offer}` : "",
      t.notes ? `notes:\n${t.notes}` : "",
      extra ? `halim's instructions: ${extra}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const { error: err } = await supabase.from("claude_tasks").insert({
      user_id: userId,
      todo_id: t.id,
      mode: "auto",
      status: "queued",
      prompt_text: prompt,
    } as never);
    if (err) {
      toast.show("approve failed - try again");
      return;
    }
    await vault.updateTodo(t.id, {
      metadata: {
        ...(t.metadata ?? {}),
        claude: { ...meta, status: "approved" },
      },
    } as never);
    toast.show("approved - claude picks it up on the next pass");
  } finally {
    approving.value.delete(t.id);
    void loadRuns();
  }
}

async function setDraftStatus(
  d: InboxReplyDraftRow,
  status: "dismissed" | "sent",
) {
  await supabase
    .from("inbox_reply_drafts")
    .update({ status } as never)
    .eq("id", d.id);
  toast.show(status === "sent" ? "marked sent" : "dismissed");
  void loadDrafts();
}

async function copyDraft(d: InboxReplyDraftRow) {
  await navigator.clipboard.writeText(d.drafted_body);
  toast.show("draft copied");
}
</script>

<template>
  <DenseGroup
    v-if="count"
    label="from claude"
    :count="count"
    accent="reverse"
    hide-add
  >
    <!-- Suggested tasks / decisions / offers - one line each. The "why" rides
         inline after the title; the full note is a click away in the modal. -->
    <div v-for="r in rows" :key="r.todo.id" class="cl-row">
      <span class="cl-kind" :class="`cl-kind-${r.meta.kind}`">{{
        KIND_LABEL[r.meta.kind]
      }}</span>
      <button
        class="cl-title"
        :title="r.meta.reason"
        @click="todoModal.open(r.todo)"
      >
        {{ r.todo.title }}
      </button>
      <span class="cl-why">{{
        r.meta.kind === "offer" ? r.meta.offer || r.meta.reason : r.meta.reason
      }}</span>
      <span
        v-if="r.area"
        class="cl-area"
        :title="`keep files this into ${r.area.name}`"
      >
        <span
          class="cl-area-dot"
          :style="{ background: projectColor(r.area.slug) }"
          aria-hidden="true"
        ></span>
        {{ r.area.slug }}
      </span>
      <span v-else class="cl-area cl-area-none" title="no area suggested">
        unfiled
      </span>
      <span
        v-if="runsByTodo[r.todo.id]"
        class="cl-run"
        :class="`cl-run-${runsByTodo[r.todo.id]!.status}`"
      >
        {{ RUN_LABEL[runsByTodo[r.todo.id]!.status] }}
      </span>
      <span class="cl-actions">
        <template
          v-if="
            r.meta.kind === 'offer' &&
            r.meta.status !== 'approved' &&
            !hasActiveRun(r.todo.id)
          "
        >
          <input
            v-model="instructions[r.todo.id]"
            class="cl-instr"
            type="text"
            placeholder="direction"
            @keydown.enter="approve(r.todo, r.meta)"
          />
          <button
            class="cl-btn cl-btn-approve"
            :disabled="approving.has(r.todo.id)"
            @click="approve(r.todo, r.meta)"
          >
            {{ approving.has(r.todo.id) ? "…" : "approve" }}
          </button>
        </template>
        <button
          v-if="r.meta.kind !== 'offer'"
          class="cl-btn"
          @click="keep(r.todo, r.meta)"
        >
          keep
        </button>
        <button class="cl-btn cl-btn-drop" @click="dismiss(r.todo, r.meta)">
          dismiss
        </button>
      </span>
    </div>

    <!-- Gmail reply drafts awaiting review - not tasks, never auto-sent -->
    <div v-if="drafts.length" class="cl-drafts">
      <p class="cl-drafts-head">
        drafts in gmail - review and send from there. they never send
        themselves.
      </p>
      <div v-for="d in drafts" :key="d.id" class="cl-draft">
        <div class="cl-row cl-row-draft">
          <span class="cl-kind cl-kind-draft">draft</span>
          <span class="cl-draft-who">{{
            d.sender_name || d.sender_email
          }}</span>
          <span class="cl-title cl-title-static">{{
            d.subject || "(no subject)"
          }}</span>
          <span class="cl-why">{{ d.snippet }}</span>
          <span class="cl-actions">
            <a
              v-if="d.gmail_draft_url"
              class="cl-btn cl-btn-link"
              :href="d.gmail_draft_url"
              target="_blank"
              rel="noopener noreferrer"
              >gmail</a
            >
            <button
              v-if="d.status === 'pending'"
              class="cl-btn"
              @click="copyDraft(d)"
            >
              copy
            </button>
            <button class="cl-btn" @click="setDraftStatus(d, 'sent')">
              sent
            </button>
            <button
              class="cl-btn cl-btn-drop"
              @click="setDraftStatus(d, 'dismissed')"
            >
              dismiss
            </button>
          </span>
        </div>
        <!-- status 'pending' means the gmail draft never got created - show
             the body here so it can be copied and sent manually. -->
        <template v-if="d.status === 'pending'">
          <p class="cl-drafts-head">
            draft didn't reach gmail - copy and send it yourself.
          </p>
          <p class="cl-draft-body">{{ d.drafted_body }}</p>
        </template>
      </div>
    </div>
  </DenseGroup>
</template>

<style scoped>
.cl-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  min-height: 24px;
  border-bottom: 1px solid var(--d-row-border);
}
.cl-row:last-child,
.cl-draft:last-child {
  border-bottom: 0;
}
.cl-draft {
  border-bottom: 1px solid var(--d-row-border);
}
.cl-draft .cl-row {
  border-bottom: 0;
}
.cl-kind {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.5625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 1px 5px;
  border-radius: 2px;
  flex-shrink: 0;
}
.cl-kind-task {
  color: var(--acc-reverse-text);
  background: rgba(110, 75, 208, 0.12);
}
.cl-kind-decision {
  color: var(--acc-hard-text);
  background: rgba(232, 155, 27, 0.14);
}
.cl-kind-offer {
  color: var(--acc-reinforcement-text);
  background: rgba(30, 142, 90, 0.12);
}
.cl-kind-draft {
  color: var(--sl-500);
  background: var(--sl-100);
}
.cl-title {
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.35;
  color: var(--sl-900);
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-align: left;
  flex: 0 1 auto;
  max-width: 46%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cl-title:hover {
  text-decoration: underline;
}
.cl-title-static {
  cursor: default;
}
.cl-title-static:hover {
  text-decoration: none;
}
/* The "why" - dim, inline, and the first thing to give up room. */
.cl-why {
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
.cl-why:not(:empty)::before {
  content: "· ";
}
/* Where keep() will file this row. Same idiom the sidebar uses for a project:
   the area's own colour as a dot, mono uppercase label. Solid ink, not washed
   grey - this is the routing decision, it should read at a glance. */
.cl-area {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.5625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-70);
  background: var(--ink-08);
  border-radius: 2px;
  padding: 1px 6px;
  flex-shrink: 0;
}
.cl-area-dot {
  width: 6px;
  height: 6px;
  border-radius: 2px;
  flex-shrink: 0;
}
/* Nothing routable - say so plainly rather than leaving a gap in the column. */
.cl-area-none {
  color: var(--ink-40);
  background: transparent;
  border: 1px dashed var(--ink-15);
  padding: 0 5px;
}
.cl-run {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  flex-shrink: 0;
}
.cl-run-queued {
  color: var(--sl-500);
}
.cl-run-running {
  color: var(--acc-hard-text);
}
.cl-run-completed {
  color: var(--acc-reinforcement-text);
}
.cl-run-failed {
  color: var(--acc-versus-text);
}
/* Actions sit at the row's right edge, quiet until the row is hovered so 26
   rows read as a list rather than a wall of buttons. Never hidden: they stay
   in flow, keyboard-reachable, and fully opaque on touch (see coarse query). */
.cl-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex-shrink: 0;
  /* Fixed lane so the area chips line up down the list instead of stepping
     in and out with each row's button widths. */
  min-width: 128px;
  opacity: 0.4;
  transition: opacity 0.1s ease;
}
.cl-row:hover .cl-actions,
.cl-actions:focus-within {
  opacity: 1;
}
/* The optional direction field only earns its width when you're actually
   reaching for the row. Always present on touch (see coarse query). */
.cl-instr {
  width: 0;
  padding: 1px 0;
  border: 1px solid transparent;
  opacity: 0;
  font-size: 0.6875rem;
  color: var(--sl-800);
  background: transparent;
  border-radius: 2px;
  transition:
    width 0.1s ease,
    opacity 0.1s ease;
}
.cl-row:hover .cl-instr,
.cl-instr:focus {
  width: 120px;
  padding: 1px 6px;
  border-color: var(--sl-200);
  opacity: 1;
}
.cl-instr::placeholder {
  color: var(--sl-400);
}
.cl-btn {
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
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}
.cl-btn:hover {
  background: var(--sl-100);
}
.cl-btn-approve {
  color: #ffffff;
  background: var(--acc-carnation);
  border-color: var(--acc-carnation);
}
.cl-btn-approve:hover {
  background: var(--acc-carnation);
  opacity: 0.9;
}
.cl-btn-approve:disabled {
  opacity: 0.5;
  cursor: default;
}
.cl-btn-drop {
  color: var(--sl-400);
}
.cl-btn-link {
  display: inline-flex;
  align-items: center;
}
.cl-drafts {
  /* The preceding suggestion row's bottom hairline is the divider. */
}
.cl-draft-body {
  margin: 0 10px 6px;
  font-size: 0.75rem;
  color: var(--sl-700);
  white-space: pre-wrap;
  border-left: 2px solid var(--sl-200);
  padding-left: 10px;
}
.cl-drafts-head {
  padding: 4px 10px 3px;
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.5625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-400);
  border-top: 1px solid var(--d-row-border);
}
.cl-draft-who {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--sl-800);
  flex-shrink: 0;
  max-width: 22%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Narrow windows: the "why" is the first thing to go, so titles keep their
   room instead of all truncating to "new learn thread…". */
@media (max-width: 760px) {
  .cl-why {
    display: none;
  }
  .cl-title {
    flex: 1 1 auto;
    max-width: none;
  }
  .cl-actions {
    min-width: 0;
  }
  .cl-draft-who {
    max-width: 40%;
  }
}
/* Touch: no hover to reveal with, and rows have to be tappable - so the
   single line relaxes into a wrapped block with full-size controls. */
@media (pointer: coarse) {
  .cl-row {
    flex-wrap: wrap;
    padding: 6px 10px;
    gap: 6px;
  }
  .cl-title {
    max-width: 100%;
  }
  .cl-why {
    flex-basis: 100%;
  }
  .cl-actions {
    opacity: 1;
    flex-wrap: wrap;
  }
  .cl-btn {
    min-height: var(--touch-target);
    padding: 2px 14px;
    font-size: 0.625rem;
  }
  .cl-instr {
    min-height: var(--touch-target);
    width: 100%;
    padding: 1px 6px;
    border-color: var(--sl-200);
    opacity: 1;
  }
}
</style>
