<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { storeToRefs } from "pinia";
import type { TodoRow } from "../types/database";
import { useVaultStore } from "../stores/vault";
import ChecklistEditor from "./ChecklistEditor.vue";
import RepeatPicker from "./RepeatPicker.vue";
import WhenPicker from "./WhenPicker.vue";
import SelectionFormatBar from "./SelectionFormatBar.vue";
import ArtifactChips from "./ArtifactChips.vue";
import ContextPicker from "./ContextPicker.vue";
import { artifactsOf } from "../types/artifacts";
import { caretIndexFromPoint } from "../utils/caret";
import { autosize } from "../utils/autosize";
import { stage } from "../lib/pendingWrites";
import type { WhenPatch } from "../utils/when";

const props = defineProps<{ todo: TodoRow; autofocusTitle?: boolean }>();
const emit = defineEmits<{ close: [] }>();

const notesEl = ref<HTMLTextAreaElement | null>(null);
const previewEl = ref<HTMLElement | null>(null);
const titleEl = ref<HTMLInputElement | null>(null);
// Notes: a chevron next to "notes" collapses/expands the whole section
// (notesCollapsed). When open, a long read view is clamped to ~5 lines and
// "show more" expands it (notesExpanded). Click the read view to edit.
const notesCollapsed = ref(false);
const notesExpanded = ref(false);
const notesEditing = ref(false);
const artifacts = computed(() => artifactsOf(props.todo));
const notesIsLong = computed(
  () => notes.value.split("\n").length > 5 || notes.value.length > 280,
);
/**
 * Size the textarea to its content.
 *
 * The naive version ("height=auto, then height=scrollHeight") collapses the
 * box for one layout pass, which on a long note yanks the page scroll up and
 * back on every keystroke - the jump Halim was seeing. Measuring against a
 * temporarily-zeroed height while PINNING the scroll container, and writing
 * the result only when it actually changed, keeps it still.
 */
function autogrow() {
  const el = notesEl.value;
  if (el) autosize(el);
}
// Any keystroke means the user is editing - latch notesEditing so the textarea
// can never unmount mid-typing (the bug: first letter makes notes non-empty,
// and without this the read-view condition would swap the textarea out and drop
// focus). Bulletproof even if the focus event didn't register.
function onNotesInput() {
  notesEditing.value = true;
  autogrow();
  scheduleNotesSave();
}

// --- notes persistence -----------------------------------------------------
// Notes used to be written on blur and nowhere else, which loses text in every
// situation a phone does not deliver a blur: swiping home, locking the screen,
// the row re-rendering out from under the editor. Now: debounced autosave while
// typing, plus a flush on unmount and on the page being hidden.
const NOTES_DEBOUNCE_MS = 800;
let notesTimer: ReturnType<typeof setTimeout> | null = null;
// Writes are SERIALIZED through one chain rather than guarded by a single-flight
// flag. A flag meant a flush arriving mid-request returned without sending or
// staging anything, so text typed during that request was dropped on a page
// hide. Chaining keeps every value, in order, with no lost update.
let notesChain: Promise<void> = Promise.resolve();
// Compare against what the server CONFIRMED, never against props.todo.notes -
// updateTodo mutates that optimistically, so after a failed write the old
// equality guard went permanently false and nothing was ever retried.
const lastSavedNotes = ref(props.todo.notes ?? "");
// Every value this editor has SENT. A realtime echo of one of our own writes
// can never be newer than what the textarea holds, so it must never be adopted
// back - and on a phone it arrives in exactly the wrong gap (see the
// props.todo.notes watcher). Bounded; identical text across todos is harmless.
const sentNotes: string[] = [];
function rememberSent(text: string) {
  sentNotes.push(text);
  if (sentNotes.length > 20) sentNotes.shift();
}

function clearNotesTimer() {
  if (notesTimer) {
    clearTimeout(notesTimer);
    notesTimer = null;
  }
}
function scheduleNotesSave() {
  clearNotesTimer();
  notesTimer = setTimeout(() => void flushNotes(), NOTES_DEBOUNCE_MS);
}

/**
 * Persist the current notes text.
 *
 * `targetId` is captured by the CALLER, synchronously. It must never be read
 * lazily inside the async body: the props.todo.id watcher runs AFTER Vue has
 * swapped props.todo, so a lazy read would send the outgoing todo's text to the
 * incoming todo's id and overwrite a different task's notes.
 */
function flushNotes(
  targetId: string = props.todo.id,
  text: string = notes.value,
): Promise<void> {
  clearNotesTimer();
  // Stage NOW, synchronously, before joining the chain. The send below waits
  // behind any save still in flight, and so did the stage() inside updateTodo
  // - so on a slow link, text typed after save A was not in the write-ahead
  // log when iOS froze the page on pagehide, and eviction lost it. settle()
  // only clears a staged field whose value the server accepted, so this newer
  // text survives the older request settling.
  if (!(targetId === props.todo.id && text === lastSavedNotes.value)) {
    stage(targetId, { notes: text });
  }
  notesChain = notesChain.then(async () => {
    // Only the still-open todo has a meaningful "already saved" baseline.
    if (targetId === props.todo.id && text === lastSavedNotes.value) return;
    if (targetId === props.todo.id) rememberSent(text);
    const ok = await vault.updateTodo(targetId, { notes: text } as never);
    // Never advance the baseline for a todo this editor has since moved off.
    if (ok && targetId === props.todo.id) lastSavedNotes.value = text;
    // No self-rescheduling on failure: the write-ahead log owns retries
    // (vault.replayPending on load / reconnect / tab focus). Retrying here
    // looped every 800ms and toasted on each pass.
  });
  return notesChain;
}

function onPageHidden() {
  if (document.visibilityState === "hidden") void flushNotes();
}
// Named, so it can actually be removed - an inline arrow would leak one
// listener per editor mount, and the editor mounts on every row expand.
function onPageHide() {
  void flushNotes();
}

// The height we set is in pixels, but the text inside re-wraps whenever the
// field's WIDTH changes - a window resize, a phone rotating, the sidebar
// collapsing. Nothing re-measured on any of those, so the box kept a stale
// height and `overflow: hidden` swallowed the spill with no scrollbar to
// reach it. Width-gated so growing the height can't retrigger the observer.
let notesRO: ResizeObserver | null = null;
let lastNotesWidth = 0;
watch(notesEl, (el) => {
  notesRO?.disconnect();
  lastNotesWidth = 0;
  if (el && notesRO) notesRO.observe(el);
});

onMounted(() => {
  window.addEventListener("visibilitychange", onPageHidden);
  window.addEventListener("pagehide", onPageHide);
  if (typeof ResizeObserver !== "undefined") {
    notesRO = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w === lastNotesWidth) return;
      lastNotesWidth = w;
      autogrow();
    });
    if (notesEl.value) notesRO.observe(notesEl.value);
  }
  // A webfont swapping in after first paint changes every glyph's metrics, so
  // the height measured against the fallback face is wrong the moment it lands.
  void document.fonts?.ready.then(autogrow);
  void nextTick(() => {
    autogrow();
    if (props.autofocusTitle && titleEl.value) {
      titleEl.value.focus();
      titleEl.value.select();
    }
  });
});
onBeforeUnmount(() => {
  window.removeEventListener("visibilitychange", onPageHidden);
  window.removeEventListener("pagehide", onPageHide);
  notesRO?.disconnect();
  notesRO = null;
  // The editor is torn down by a row collapse / modal close / re-render; never
  // let that drop text the user typed. flushNotes stages the patch to the
  // write-ahead log synchronously, so it survives even if the request does not.
  void flushNotes();
  clearNotesTimer();
});

// currentNotes lets CaptureBar judge whether a draft is really empty without
// depending on the optimistic mirror having reached its row copy.
defineExpose({ flush: flushNotes, currentNotes: () => notes.value });

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
/**
 * Enter edit mode with the caret where the user actually clicked.
 *
 * Focusing a textarea parks the caret at the end (or wherever it last was),
 * so clicking into the middle of a note and typing appended to the bottom.
 * `caretIndexFromPoint` maps the click on the rendered read view to a
 * character offset in the raw text - the `<br>`-for-`\n` substitution is 1:1
 * and linkified anchors keep their visible text, so the index transfers
 * exactly. preventScroll stops the browser re-centring the field under the
 * keyboard.
 */
function startEditNotes(caretIndex?: number | null) {
  // A clamped read view would grow when it becomes a full textarea; expanding
  // first means the box is already its final height when we swap.
  if (notesIsLong.value) notesExpanded.value = true;
  notesEditing.value = true;
  void nextTick(() => {
    const el = notesEl.value;
    if (!el) return;
    autogrow();
    el.focus({ preventScroll: true });
    if (caretIndex != null) {
      const i = Math.max(0, Math.min(caretIndex, el.value.length));
      el.setSelectionRange(i, i);
    }
  });
}
// A phone's selection gesture is long-press. On the read view that selected
// the rendered div itself and never reached the textarea, so caret mapping
// and the format bar were unreachable by the gesture a phone user actually
// makes. The preview is now inert to selection (CSS) and enters edit on a tap:
// pointerup with no meaningful movement since pointerdown.
let previewDown: { x: number; y: number } | null = null;
// Set when a tap already opened the editor, so the click the browser
// synthesises right after it does not open it twice. A click with NO pointer
// sequence behind it (keyboard, assistive tech, a scripted click) still
// opens the editor through onPreviewClickEvent.
let previewTapHandled = false;
function onPreviewPointerDown(e: PointerEvent) {
  previewDown = { x: e.clientX, y: e.clientY };
}
function onPreviewPointerUp(e: PointerEvent) {
  const d = previewDown;
  previewDown = null;
  if (!d) return;
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return;
  previewTapHandled = true;
  onPreviewClick(e);
}
function onPreviewClickEvent(e: MouseEvent) {
  if (previewTapHandled) {
    previewTapHandled = false;
    return;
  }
  onPreviewClick(e);
}
function onPreviewClick(e: MouseEvent) {
  // Let link clicks open; only enter edit mode for clicks on the text itself.
  if ((e.target as HTMLElement).closest("a")) return;
  const root = previewEl.value;
  const index = root ? caretIndexFromPoint(root, e.clientX, e.clientY) : null;
  startEditNotes(index);
}
/** After the format bar rewrites the text: resize and queue the save. */
function onNotesFormatted() {
  autogrow();
  scheduleNotesSave();
}
function onNotesBlur() {
  // Clear the latch SYNCHRONOUSLY. It used to be cleared in the continuation of
  // the awaited write, so on a slow phone link you could blur, tap straight back
  // into the notes, and have the resolving save pull the focused textarea out of
  // the DOM under your finger - and browsers fire no blur for a removed element,
  // so everything typed after the re-focus was silently lost.
  // Only clear it if the field really lost focus (a re-focus wins).
  if (document.activeElement !== notesEl.value) notesEditing.value = false;
  void flushNotes();
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
const priority = ref<"P0" | "P1" | "P2" | "ongoing" | "">(
  props.todo.priority ?? "",
);
const evening = ref(!!props.todo.evening);
const projectId = ref<string | null>(props.todo.project_id ?? null);
const areaId = ref<string | null>(props.todo.area_id ?? null);

watch(
  () => props.todo.id,
  (_newId, oldId) => {
    // The component instance is being reused for a DIFFERENT todo (the modal
    // renders <TodoEditor :todo> with no :key). Flush the outgoing todo's text
    // against the OUTGOING id - by now props.todo is already the incoming one,
    // so passing it implicitly would write A's notes onto B.
    if (oldId) void flushNotes(oldId, notes.value);
    sentNotes.length = 0;
    title.value = props.todo.title;
    notes.value = props.todo.notes ?? "";
    lastSavedNotes.value = props.todo.notes ?? "";
    startDate.value = props.todo.start_date ?? "";
    deadline.value = props.todo.deadline ?? "";
    priority.value = props.todo.priority ?? "";
    evening.value = !!props.todo.evening;
    projectId.value = props.todo.project_id ?? null;
    areaId.value = props.todo.area_id ?? null;
    void nextTick(autogrow);
  },
);

// AI auto-enrichment (or another session) can append to notes while this editor
// is open; reflect it live, but never clobber the user while they're typing.
watch(
  () => props.todo.notes,
  (v) => {
    const incoming = v ?? "";
    // Never while typing.
    if (notesEditing.value) return;
    // Never an echo of something this editor itself sent: it can only be as
    // old as, or older than, what the textarea already holds. This was the
    // "notes disappear on my phone" bug. The keyboard dismissing blurs the
    // field (notesEditing -> false) while the flush is still in flight; the
    // realtime echo of the PREVIOUS save then lands in that gap carrying older
    // text, applyTodoChange Object.assigns it into props.todo.notes, this
    // watcher copied it into the editor, and everything typed since that
    // earlier save vanished from the screen.
    if (sentNotes.includes(incoming)) return;
    // Never while there is unsaved local text either: an outside edit would
    // silently overwrite it. It reconciles on the next load instead.
    if (notes.value !== lastSavedNotes.value) return;
    notes.value = incoming;
    // Track it as already-saved too, otherwise the autosave would echo an
    // AI-authored note straight back to the server.
    lastSavedNotes.value = incoming;
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
async function commitDate(field: "start_date" | "deadline", v: string) {
  await saveField(field, v || null);
}
async function commitPriority(p: "P0" | "P1" | "P2" | "ongoing" | "") {
  priority.value = p;
  await saveField("priority", p || null);
}
/** The picker emits the task's full next tag list; the store replaces the set. */
async function commitTags(next: string[]) {
  await vault.setTodoTags(props.todo.id, next);
}
async function commitWhen(p: WhenPatch) {
  // Keep local refs in sync so the chip/label updates immediately.
  startDate.value = p.start_date ?? "";
  evening.value = p.evening;
  // One bundled write; reconcileListsMembership runs inside updateTodo so the
  // task floats into / out of Today on the spot.
  await vault.updateTodo(props.todo.id, p as never);
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

    <!-- The task's deliverable (google doc / sheet), one click away -
         attachment chips above the notes. -->
    <ArtifactChips
      v-if="artifacts.length"
      :artifacts="artifacts"
      class="mt-s-3"
    />

    <!-- Notes: a chevron next to "notes" collapses/expands the whole section.
         When open, a long read view is clamped to ~5 lines with show more/less.
         Read view renders URLs as clickable links; click the text to edit. -->
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
      <!-- The read view and the textarea are deliberately the same box: same
           type, same width, same padding, same height. Switching between them
           must move nothing on screen except the caret. -->
      <div v-if="!notesCollapsed" class="ed-notes-slot mt-s-2">
        <textarea
          v-if="notesEditing || !notes"
          ref="notesEl"
          v-model="notes"
          placeholder="notes - markdown ok"
          rows="1"
          class="ed-notes-input"
          @focus="notesEditing = true"
          @input="onNotesInput"
          @blur="onNotesBlur"
        />
        <template v-else>
          <div
            ref="previewEl"
            class="ed-notes-preview"
            :class="{ 'ed-notes-clamp': !notesExpanded }"
            @pointerdown="onPreviewPointerDown"
            @pointerup="onPreviewPointerUp"
            @click="onPreviewClickEvent"
            v-html="notesHtml"
          ></div>
          <button
            v-if="notesIsLong"
            type="button"
            class="ed-notes-more interactive"
            @click.stop="notesExpanded = !notesExpanded"
          >
            {{ notesExpanded ? "show less" : "show more" }}
          </button>
        </template>
      </div>
      <SelectionFormatBar
        v-model="notes"
        :target="notesEl"
        @formatted="onNotesFormatted"
      />
    </div>

    <ChecklistEditor :todo-id="todo.id" />

    <!-- Everything that is ABOUT the task, on one line under the content -
         the Things arrangement. Title, notes and checklist are what you write;
         when, priority, area, project and deadline describe it. Giving each of
         those its own labelled row above the notes pushed the writing surface
         down the card and answered "why is priority up there" with nothing.
         Wraps into two rows on a phone. -->
    <div class="ed-meta">
      <div class="ed-meta-item">
        <span class="ed-meta-label">when</span>
        <WhenPicker
          :state="todo.state"
          :start-date="startDate || null"
          :evening="evening"
          @change="commitWhen"
        />
      </div>
      <div class="ed-meta-item" role="group" aria-label="priority">
        <span class="ed-meta-label">priority</span>
        <div class="ed-prio">
          <button
            v-for="p in ['P0', 'P1', 'P2', 'ongoing', ''] as const"
            :key="p || 'none'"
            type="button"
            :title="p === 'ongoing' ? 'ongoing' : undefined"
            :aria-pressed="priority === p"
            :data-p="p"
            :class="['ed-prio-btn', priority === p && 'ed-prio-on']"
            @click="commitPriority(p)"
          >
            {{ p === "ongoing" ? "~" : p || "none" }}
          </button>
        </div>
      </div>
      <div class="ed-meta-item">
        <span class="ed-meta-label">context</span>
        <ContextPicker :tags="todo.tags ?? []" @change="commitTags" />
      </div>
      <label class="ed-meta-item">
        <span class="ed-meta-label">area</span>
        <select v-model="areaId" class="ed-meta-select" @change="commitArea">
          <option :value="null">none</option>
          <option v-for="a in areas" :key="a.id" :value="a.id">
            {{ a.name }}
          </option>
        </select>
      </label>
      <label class="ed-meta-item">
        <span class="ed-meta-label">project</span>
        <select
          v-model="projectId"
          class="ed-meta-select"
          @change="commitProject"
        >
          <option :value="null">none</option>
          <option v-for="p in projectsInArea" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select>
      </label>
      <label class="ed-meta-item">
        <span class="ed-meta-label">deadline</span>
        <input
          v-model="deadline"
          type="date"
          class="ed-meta-date"
          @change="commitDate('deadline', deadline)"
        />
      </label>
      <RepeatPicker :todo-id="todo.id" compact />
    </div>

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
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
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
/* Read view and edit view share one type treatment so switching between them
   is seamless (was: 14px underlined form field vs 15px prose - jarring). */
/* READ AND EDIT MUST BE THE SAME BOX.
   Every property that affects glyph position or wrapping is declared once, for
   both. If these two ever diverge, clicking into the note visibly reflows the
   text - which is exactly what "the size changes" meant. */
.ed-notes-preview,
.ed-notes-input {
  font-family: var(--font-body);
  font-size: 0.9375rem;
  line-height: 1.6;
  letter-spacing: normal;
  color: var(--sl-800);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  padding: 0;
  margin: 0;
  border: 0;
  width: 100%;
  min-height: 1.6em;
  text-align: left;
}
/* main.css force-sets `textarea { font-size: 16px !important }` under 767px to
   stop iOS zooming on focus. The read view MUST match that or the note resizes
   the instant you tap it. */
@media (max-width: 767px) {
  .ed-notes-preview,
  .ed-notes-input {
    font-size: 16px;
  }
}
.ed-notes-input {
  display: block;
  background: transparent;
  outline: none;
  /* Height is driven by autogrow(); no inner scrollbar, no manual resize
     handle fighting it. */
  resize: none;
  overflow: hidden;
}
.ed-notes-input::placeholder {
  color: var(--color-text-hint);
}
.ed-notes-preview {
  /* Inert to the platform selection gesture: a long-press selects the TEXTAREA
     you tap into, never this rendered copy. */
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  cursor: text;
}
/* Reserves the box so the read-view -> textarea swap can't shift what's
   below it mid-transition. */
.ed-notes-slot {
  position: relative;
}
/* Collapsed by default: clamp the read view to ~5 lines. */
.ed-notes-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 5;
  line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ed-notes-more {
  margin-top: 4px;
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-500);
  background: transparent;
  border: 0;
  cursor: pointer;
}
.ed-notes-more:hover {
  color: var(--sl-900);
}
.ed-notes-preview :deep(.ed-link) {
  color: var(--acc-carnation-text);
  text-decoration: underline;
  word-break: break-all;
}
/* ---- metadata strip ---- */
.ed-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--hair);
}
.ed-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 28px;
}
.ed-meta-label {
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-500);
}
.ed-meta-select,
.ed-meta-date {
  font: inherit;
  font-size: 0.8125rem;
  color: var(--sl-800);
  text-transform: lowercase;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--hair);
  border-radius: 0;
  padding: 2px 0;
}
/* The native date field is 160px wide at rest for a placeholder nobody reads;
   9.5em fits a real date and keeps the strip on one line on a laptop. */
.ed-meta-date {
  width: 9.5em;
}
.ed-meta-select:focus-visible,
.ed-meta-date:focus-visible {
  border-bottom-color: var(--acc-carnation);
}
.ed-prio {
  display: inline-flex;
  gap: 2px;
}
.ed-prio-btn {
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 7px;
  border: 1px solid var(--hair);
  border-radius: 2px;
  background: transparent;
  color: var(--sl-500);
  cursor: pointer;
  transition:
    color 120ms ease,
    border-color 120ms ease,
    background 120ms ease;
}
.ed-prio-btn:hover {
  color: var(--sl-900);
  border-color: var(--sl-300);
}
/* The active level wears the SAME colour it wears in the list. A gold P1 pill
   in a row and a black P1 button in the editor taught two codes for one
   field, and threw away the urgency scale the row spent its colour on. */
.ed-prio-on {
  font-weight: 600;
  border-color: transparent;
}
.ed-prio-on[data-p="P0"] {
  background: var(--acc-carnation);
  color: #ffffff;
}
.ed-prio-on[data-p="P1"] {
  background: rgba(232, 155, 27, 0.16);
  color: var(--acc-hard-text);
}
.ed-prio-on[data-p="P2"] {
  background: rgba(110, 75, 208, 0.14);
  color: var(--acc-reverse-text);
}
.ed-prio-on[data-p="ongoing"] {
  background: rgba(15, 118, 110, 0.13);
  color: var(--acc-ongoing-text);
}
/* "none" is the absence of a level, so it stays neutral-but-clearly-set. */
.ed-prio-on[data-p=""] {
  background: var(--ink-08);
  color: var(--ink-85);
}
@media (max-width: 767px) {
  .ed-meta {
    gap: 8px 14px;
  }
  /* iOS zooms any field under 16px on focus. */
  .ed-meta-select,
  .ed-meta-date {
    font-size: 16px;
  }
  .ed-prio-btn {
    min-height: 32px;
    padding: 4px 9px;
  }
  .ed-meta-item,
  .ed-meta :deep(.rp-compact) {
    min-height: 36px;
  }
  /* The notes chevron and show more are 10-11px text with no target bump. */
  .ed-notes-toggle,
  .ed-notes-more {
    min-height: 32px;
    padding: 6px 4px;
    margin-block: -4px;
  }
}
</style>
