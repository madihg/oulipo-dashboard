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
import {
  claudeMetaOf,
  resolveSuggestedArea,
  resolveSuggestedWhen,
  type ClaudeMeta,
} from "../types/claude";
import type { ClaudeTaskRow, TodoRow } from "../types/database";

/**
 * "from claude" - the Inbox section for what the daily routine found:
 * suggested tasks, decisions to make, and offers Claude can execute once
 * approved. Gmail reply drafts deliberately do NOT render here (removed
 * 2026-08-18): they already surface in Gmail itself and in the debrief,
 * and reconciliation closes them without manual marking.
 *
 * Approving an offer inserts a queued hmart.claude_tasks row; the next
 * routine run executes it and writes the result back. Run status is shown
 * live via a realtime channel.
 */
const props = defineProps<{ todos: TodoRow[] }>();
const vault = useVaultStore();
const toast = useToastStore();
const todoModal = useTodoModalStore();

const runsByTodo = ref<Record<string, ClaudeTaskRow>>({});
const instructions = reactive<Record<string, string>>({});
const approving = ref<Set<string>>(new Set());

// Highest priority first (P0 < P1 < P2 < ongoing < none), newest inside a
// tier - the routine stamps todos.priority on every suggestion.
const PRIORITY_RANK: Record<string, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  ongoing: 3,
};
const rows = computed(() =>
  props.todos
    .flatMap((t) => {
      const meta = claudeMetaOf(t);
      if (!meta) return [];
      const area = resolveSuggestedArea(meta, vault.areas);
      const when = resolveSuggestedWhen(meta);
      return [{ todo: t, meta, area, when }];
    })
    .sort((a, b) => {
      const ra = PRIORITY_RANK[a.todo.priority ?? ""] ?? 4;
      const rb = PRIORITY_RANK[b.todo.priority ?? ""] ?? 4;
      if (ra !== rb) return ra - rb;
      return (b.meta.proposed_at ?? "").localeCompare(a.meta.proposed_at ?? "");
    }),
);
const count = computed(() => rows.value.length);

const KIND_LABEL: Record<ClaudeMeta["kind"], string> = {
  task: "task",
  decision: "decision",
  offer: "offer",
};
const RUN_LABEL: Record<string, string> = {
  queued: "queued",
  running: "running…",
  completed: "done",
  failed: "failed",
};

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

/**
 * Phone only: a row collapses to its tag + label, and a tap opens it to show
 * the area, the direction field and approve/dismiss. On a wider screen the
 * whole row already fits on one line, so nothing collapses and the title keeps
 * its usual job of opening the full note.
 */
const PHONE_QUERY = "(max-width: 600px)";
const openRow = ref<string | null>(null);
function isPhone(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia(PHONE_QUERY).matches
  );
}
function toggleRow(id: string) {
  if (!isPhone()) return;
  openRow.value = openRow.value === id ? null : id;
}
function onTitleClick(t: TodoRow, e: MouseEvent) {
  // On a phone the title is the thing you tap to open the row, so let the
  // click bubble to the row handler instead of opening the modal.
  if (isPhone()) return;
  e.stopPropagation();
  todoModal.open(t);
}

let chan: ReturnType<typeof supabase.channel> | null = null;
onMounted(() => {
  void loadRuns();
  chan = supabase
    .channel("claude-inbox")
    .on(
      "postgres_changes",
      { event: "*", schema: "hmart", table: "claude_tasks" },
      () => void loadRuns(),
    )
    .subscribe();
});
onBeforeUnmount(() => {
  if (chan) void supabase.removeChannel(chan);
});

async function keep(t: TodoRow, meta: ClaudeMeta) {
  // Suggestions arrive unfiled by design (an area_id or start_date would pull
  // them out of the inbox / into Today before Halim ever saw them). Keeping
  // one applies the routine's suggested area AND suggested do-date for real,
  // in one write, so the row lands filed and scheduled - not back in the
  // unsorted pile.
  const area = resolveSuggestedArea(meta, vault.areas);
  const when = resolveSuggestedWhen(meta);
  // Merge, never overwrite, the metadata jsonb - other namespaces
  // (e.g. reservoir) must survive.
  await vault.updateTodo(t.id, {
    ...(area ? { area_id: area.id } : {}),
    ...(when ? when.patch : {}),
    metadata: { ...(t.metadata ?? {}), claude: { ...meta, status: "kept" } },
  } as never);
  const where = [area?.name, when?.label].filter(Boolean).join(", ");
  toast.show(
    where ? `kept - filed: ${where}` : "kept - it's in your inbox now",
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
  // Snapshot first: updateTodo merges the patch into this very row object.
  const prior = { state: t.state, metadata: t.metadata };
  await vault.updateTodo(t.id, {
    state: "cancelled",
    metadata: {
      ...(t.metadata ?? {}),
      claude: { ...meta, status: "dismissed" },
    },
  } as never);
  toast.show("dismissed", {
    label: "undo",
    run: async () => {
      // The row was reconciled out of every list, so updateTodo alone puts
      // back the database row and not the screen; re-add it the way
      // bulkDelete's undo does. A revoked queued run stays revoked - the
      // offer simply reads as approvable again.
      const ok = await vault.updateTodo(t.id, prior);
      if (!ok) return;
      if (!vault.inboxTodos.some((x) => x.id === t.id))
        vault.inboxTodos.unshift({ ...t, ...prior });
    },
  });
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
    // Approving also FILES the row like keep() does (Halim, 2026-08-18):
    // the suggested area + do-date apply immediately and the row leaves the
    // from-claude section for the main lists. The queued claude_tasks run
    // still executes on the next pass - only the row stops waiting on it.
    const area = resolveSuggestedArea(meta, vault.areas);
    const when = resolveSuggestedWhen(meta);
    await vault.updateTodo(t.id, {
      ...(area ? { area_id: area.id } : {}),
      ...(when ? when.patch : {}),
      metadata: {
        ...(t.metadata ?? {}),
        claude: { ...meta, status: "approved" },
      },
    } as never);
    const where = [area?.name, when?.label].filter(Boolean).join(", ");
    toast.show(
      where
        ? `approved - filed: ${where}; claude runs it on the next pass`
        : "approved - moved to your tasks; claude runs it on the next pass",
    );
  } finally {
    approving.value.delete(t.id);
    void loadRuns();
  }
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
    <div
      v-for="r in rows"
      :key="r.todo.id"
      class="cl-row"
      :class="{ 'cl-row-open': openRow === r.todo.id }"
      @click="toggleRow(r.todo.id)"
    >
      <!-- Kind and priority are captions with the shared dot: the dot carries
           the hue, the word carries the meaning. -->
      <span class="cap cap-ink cl-kind">
        <span
          class="dot"
          :class="`cl-dot-${r.meta.kind}`"
          aria-hidden="true"
        ></span>
        {{ KIND_LABEL[r.meta.kind] }}
      </span>
      <span
        v-if="r.todo.priority && r.todo.priority !== 'ongoing'"
        class="cap cap-ink cl-pri"
        :aria-label="`priority ${r.todo.priority}`"
      >
        <span
          class="dot"
          :class="`cl-dot-${r.todo.priority.toLowerCase()}`"
          aria-hidden="true"
        ></span>
        {{ r.todo.priority.toLowerCase() }}
      </span>
      <!-- The routing decision reads left, with the tags: the area's own
           name, emoji and all (2026-08-18). -->
      <span
        v-if="r.area"
        class="cap cap-ink cl-area"
        :title="`keep files this into ${r.area.name}`"
      >
        {{ r.area.name }}
      </span>
      <span v-else class="cap cl-area cl-area-none" title="no area suggested">
        unfiled
      </span>
      <button
        type="button"
        class="cl-title"
        :title="r.meta.reason"
        @click="onTitleClick(r.todo, $event)"
      >
        {{ r.todo.title }}
      </button>
      <span class="cl-why">{{
        r.meta.kind === "offer" ? r.meta.offer || r.meta.reason : r.meta.reason
      }}</span>
      <span
        v-if="r.when"
        class="cap cl-when"
        :title="`keep schedules this: ${r.when.label}`"
      >
        {{ r.when.label }}
      </span>
      <span v-if="runsByTodo[r.todo.id]" class="cap cl-run">
        <span
          class="dot"
          :class="`cl-dot-${runsByTodo[r.todo.id]!.status}`"
          aria-hidden="true"
        ></span>
        {{ RUN_LABEL[runsByTodo[r.todo.id]!.status] }}
      </span>
      <span class="cl-actions" @click.stop>
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
            type="button"
            class="chip chip-primary cl-btn"
            :disabled="approving.has(r.todo.id)"
            @click="approve(r.todo, r.meta)"
          >
            {{ approving.has(r.todo.id) ? "approving…" : "approve" }}
          </button>
        </template>
        <button
          v-if="r.meta.kind !== 'offer'"
          type="button"
          class="chip cl-btn"
          @click="keep(r.todo, r.meta)"
        >
          keep
        </button>
        <button
          type="button"
          class="chip chip-quiet cl-btn"
          @click="dismiss(r.todo, r.meta)"
        >
          dismiss
        </button>
      </span>
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
.cl-row:last-child {
  border-bottom: 0;
}
/* Kind, priority and run status: the shared caption (.cap) with the shared
   dot (.dot), which is the only place their colour lives. */
.cl-kind,
.cl-pri,
.cl-run {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.cl-dot-task {
  --dot: var(--acc-reverse);
}
.cl-dot-decision {
  --dot: var(--acc-hard);
}
.cl-dot-offer {
  --dot: var(--acc-reinforcement);
}
.cl-dot-p0 {
  --dot: var(--acc-carnation);
}
.cl-dot-p1 {
  --dot: var(--acc-hard);
}
.cl-dot-p2 {
  --dot: var(--acc-reverse);
}
.cl-dot-queued {
  --dot: var(--metal);
}
.cl-dot-running {
  --dot: var(--acc-hard);
}
.cl-dot-completed {
  --dot: var(--acc-reinforcement);
}
.cl-dot-failed {
  --dot: var(--acc-versus);
}
.cl-title {
  font-size: var(--fs-small);
  line-height: 1.35;
  color: var(--ink);
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
/* The "why" - dim, inline, and the first thing to give up room. */
.cl-why {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: var(--fs-caption);
  line-height: 1.35;
  color: var(--ink-40);
}
.cl-why:not(:empty)::before {
  content: "· ";
}
/* Where keep() will file this row: an outlined caption in ink, so the
   routing decision reads at a glance. */
.cl-area {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--hair);
  border-radius: 2px;
  padding: 1px 6px;
  flex-shrink: 0;
}
.cl-when {
  white-space: nowrap;
  flex-shrink: 0;
}
/* Nothing routable - say so plainly rather than leaving a gap in the column. */
.cl-area-none {
  border-style: dashed;
  padding: 0 5px;
}
/* Actions sit at the row's right edge, quiet until the row is hovered so 26
   rows read as a list rather than a wall of buttons. Never hidden: they stay
   in flow, keyboard-reachable, and fully opaque on touch (see coarse query).
   The buttons are the shared chip family: approve is the ink chip, keep the
   outlined one, dismiss the quiet one. */
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
  transition: opacity var(--dur-fast) var(--ease-out);
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
  font-size: var(--fs-label);
  color: var(--ink-85);
  background: transparent;
  border-radius: 2px;
  transition:
    width var(--dur-fast) var(--ease-out),
    opacity var(--dur-fast) var(--ease-out);
}
.cl-row:hover .cl-instr,
.cl-instr:focus {
  width: 120px;
  padding: 1px 6px;
  border-color: var(--hair);
  opacity: 1;
}
.cl-instr::placeholder {
  color: var(--ink-40);
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
}
/* Touch: there is no hover to reveal with, so the controls stay visible.
   Sizing and layout deliberately live in the width query below instead of
   here - a `pointer: coarse` layout can never be seen in a dev browser
   (desktop reports `fine`), which is how the five-line phone row shipped
   unnoticed. Anything visual belongs in a query that can be checked. */
@media (pointer: coarse) {
  .cl-actions {
    opacity: 1;
  }
  .cl-instr {
    width: 120px;
    padding: 1px 6px;
    border-color: var(--hair);
    opacity: 1;
  }
}

/* Phone: a row is one line - the tag and the label, nothing else. Everything
   that acts on the row (area, direction field, approve / dismiss) is behind a
   tap, because a list you are triaging is a list you mostly scroll past. Letting
   the controls wrap in place put each part on its own line - badge, title, area,
   a full-width direction field, then 44px buttons - so one offer ran ~300px and
   three of them filled the screen. Tapping opens exactly one extra line. */
@media (max-width: 600px) {
  .cl-row {
    flex-wrap: wrap;
    align-items: center;
    padding: 8px 10px;
    column-gap: 6px;
    row-gap: 5px;
    cursor: pointer;
  }
  /* the only line: kind badge · priority · label */
  .cl-kind {
    order: 1;
  }
  .cl-pri {
    order: 2;
  }
  .cl-row .cl-title {
    order: 3;
    flex: 1 1 0;
    min-width: 0;
    max-width: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cl-why {
    display: none;
  }
  /* collapsed: no area chip, no when chip, no controls */
  .cl-area,
  .cl-when,
  .cl-run,
  .cl-actions {
    display: none;
  }

  /* opened by tap: the full label, then one control strip */
  .cl-row-open .cl-title {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
  }
  /* zero-height full-width item forces the break onto a second line */
  .cl-row-open::after {
    content: "";
    order: 4;
    flex: 0 0 100%;
    height: 0;
  }
  .cl-row-open .cl-area {
    display: inline-flex;
    order: 5;
  }
  .cl-row-open .cl-when {
    display: inline;
    order: 5;
  }
  .cl-row-open .cl-run {
    display: inline-flex;
    order: 6;
  }
  .cl-row-open .cl-actions {
    display: flex;
    order: 7;
    /* basis 0, not auto: with `auto` the strip's content width (field + two
       buttons) counts toward the line and pushes the area chip onto a third
       line before anything gets a chance to shrink. */
    flex: 1 1 0;
    min-width: 0;
    margin-left: auto;
    justify-content: flex-end;
    flex-wrap: nowrap;
    gap: 6px;
    opacity: 1;
  }
  /* the direction field takes whatever the buttons leave */
  .cl-row .cl-instr {
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
    min-height: 32px;
    padding: 2px 8px;
    border-color: var(--hair);
    opacity: 1;
  }
  .cl-btn {
    min-height: 32px;
    padding: 2px 11px;
    font-size: var(--fs-caption);
    flex-shrink: 0;
  }
}
</style>
