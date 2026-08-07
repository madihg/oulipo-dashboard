<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { applyFormat, type FormatKind } from "../utils/textFormat";
import { caretRect } from "../utils/caret";

/**
 * Formatting bar that appears only while text is selected inside a textarea -
 * the bubble-menu pattern (Medium / Notion / Bear). Notes are plain markdown
 * text, so each button toggles the markdown markers around the selection.
 *
 * Attaches to a textarea by ref rather than owning it, so the same bar serves
 * the task notes and the week-goals field without either becoming a rich-text
 * editor.
 */

const props = defineProps<{
  /** The textarea to format. */
  target: HTMLTextAreaElement | null;
  /** Current value (v-model source), so we can emit the formatted result. */
  modelValue: string;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
  /** Fired after a format is applied, so the host can autosize / autosave. */
  formatted: [];
}>();

const visible = ref(false);
const pos = ref({ top: 0, left: 0 });
const barEl = ref<HTMLElement | null>(null);
// Suppress the bar while a pointer drag is still selecting - it would jump
// around under the cursor.
const dragging = ref(false);

const BUTTONS: Array<{
  kind: FormatKind;
  label: string;
  title: string;
  cls?: string;
}> = [
  { kind: "bold", label: "B", title: "bold  ⌘B", cls: "fb-b" },
  { kind: "italic", label: "I", title: "italic  ⌘I", cls: "fb-i" },
  { kind: "strike", label: "S", title: "strikethrough", cls: "fb-s" },
  { kind: "code", label: "‹›", title: "code" },
  { kind: "link", label: "link", title: "link  ⌘K" },
  { kind: "h2", label: "H", title: "heading" },
  { kind: "bullet", label: "•", title: "bullet list" },
  { kind: "quote", label: "❝", title: "quote" },
];

function hide() {
  visible.value = false;
}

function place() {
  const el = props.target;
  if (!el) return hide();
  // A textarea keeps selectionStart/End after it loses focus, so without this
  // guard any later refresh - a click anywhere, a scroll - re-shows the bar
  // over a field nobody is editing. Two mounted bars would then both claim to
  // be live, and pressing one would yank focus into a textarea the user had
  // already left. onSelectionChange had this check; place() is reached from
  // three other paths that did not.
  if (document.activeElement !== el) return hide();
  const { selectionStart: s, selectionEnd: e } = el;
  if (s === null || e === null || s === e) return hide();

  // Anchor to the START of the selection; that's where the eye is.
  const rect = caretRect(el, s);
  if (!rect) return hide();

  // The anchor scrolled out of its own field: there is nothing to point at, so
  // don't leave the bar floating over unrelated content.
  const box = el.getBoundingClientRect();
  if (rect.top + rect.height < box.top - 4 || rect.top > box.bottom + 4) {
    return hide();
  }

  // Measured, not guessed: the bar is always mounted (hidden via visibility)
  // precisely so these are real numbers. The old 240px fallback was always
  // what got used, and the coarse-pointer bar is ~300px, so on a phone it hung
  // off the right edge every single time.
  const barW = barEl.value?.offsetWidth || 240;
  const barH = barEl.value?.offsetHeight || 30;
  const GAP = 6;
  const left = Math.max(
    8,
    Math.min(rect.left - 8, window.innerWidth - barW - 8),
  );
  // Above the line by default; below it if there's no room up there.
  let top = rect.top - barH - GAP;
  if (top < 8) top = rect.top + rect.height + GAP;
  top = Math.max(8, Math.min(top, window.innerHeight - barH - 8));

  pos.value = { top, left };
  visible.value = true;
}

/**
 * Run after the current task, once selectionStart has settled and Vue has
 * patched the DOM. Deliberately NOT requestAnimationFrame: rAF is suspended
 * whenever the document is hidden (background tab, embedded preview), which
 * would leave the bar stuck invisible.
 */
function defer(fn: () => void) {
  setTimeout(fn, 0);
}

function refresh() {
  if (dragging.value) return;
  defer(place);
}

async function apply(kind: FormatKind) {
  const el = props.target;
  if (!el) return;
  const next = applyFormat(
    { text: props.modelValue, start: el.selectionStart, end: el.selectionEnd },
    kind,
  );
  emit("update:modelValue", next.text);
  // nextTick, NOT setTimeout: it is a microtask chained onto Vue's own flush,
  // so the selection is restored in the same frame the new text lands. A
  // macrotask leaves one paintable gap in which the highlight is gone and the
  // caret sits collapsed at the end of the note - the exact cursor jump this
  // editor work set out to kill.
  await nextTick();
  el.focus({ preventScroll: true });
  el.setSelectionRange(next.start, next.end);
  // Only now may the host measure. Emitted before the patch, it sized the
  // textarea to the OLD text and left the last line clipped under
  // overflow:hidden with no scrollbar to reach it.
  emit("formatted");
  refresh();
}

function onSelectionChange() {
  const el = props.target;
  if (!el) return;
  if (document.activeElement !== el) return hide();
  refresh();
}
/**
 * Losing focus fires no selectionchange (the selection is still there, it is
 * just no longer live), so without this the bar hangs over the field until
 * some unrelated event happens to re-place it. Capture, because blur does not
 * bubble.
 */
function onBlur(e: FocusEvent) {
  if (e.target === props.target) hide();
}
function onPointerDown(e: PointerEvent) {
  // Clear first: a latch left set by a cancelled gesture would otherwise
  // disable the bar for the rest of the session.
  dragging.value = false;
  // A click on the bar itself must not clear the selection.
  if (barEl.value?.contains(e.target as Node)) return;
  if (e.target === props.target) dragging.value = true;
}
/** pointerup AND pointercancel - a touch-scroll that starts on the textarea
 *  ends in a cancel, and only ever clearing on up left `dragging` stuck. */
function onPointerEnd() {
  dragging.value = false;
  refresh();
}

const IS_APPLE =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
const SHORTCUTS: Record<string, FormatKind> = {
  b: "bold",
  i: "italic",
  k: "link",
};

function onKeydown(e: KeyboardEvent) {
  const el = props.target;
  if (!el || document.activeElement !== el) return;
  // On Apple platforms Ctrl is the system's text-navigation modifier (Ctrl+B
  // back a character, Ctrl+K kill to end of line) and must stay untouched;
  // formatting is Cmd there and Ctrl everywhere else. Any extra modifier means
  // the chord belongs to someone else.
  const mod = IS_APPLE ? e.metaKey : e.ctrlKey;
  if (!mod || e.altKey || e.shiftKey) return;
  const kind = SHORTCUTS[e.key.toLowerCase()];
  if (!kind) return;
  // Nothing selected: a stray Cmd+B would drop a bare "****" into the note.
  if (el.selectionStart === el.selectionEnd) return;
  e.preventDefault();
  // The command palette listens for Cmd+K on window too. Without this it opens
  // on top of the link we just inserted, and then our focus restore rips focus
  // straight back out of it.
  e.stopPropagation();
  void apply(kind);
}

onMounted(() => {
  document.addEventListener("selectionchange", onSelectionChange);
  window.addEventListener("blur", onBlur, true);
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointerup", onPointerEnd, true);
  window.addEventListener("pointercancel", onPointerEnd, true);
  // Capture, so the shortcut is claimed before the command palette's own
  // window listener can see it.
  window.addEventListener("keydown", onKeydown, true);
  // Follow the text rather than vanishing: caretRect is viewport-based, so a
  // re-place is all that's needed. Hiding on scroll made the bar feel brittle
  // the moment the keyboard nudged the page on a phone.
  window.addEventListener("scroll", refresh, true);
  window.addEventListener("resize", refresh);
});
onBeforeUnmount(() => {
  document.removeEventListener("selectionchange", onSelectionChange);
  window.removeEventListener("blur", onBlur, true);
  window.removeEventListener("pointerdown", onPointerDown, true);
  window.removeEventListener("pointerup", onPointerEnd, true);
  window.removeEventListener("pointercancel", onPointerEnd, true);
  window.removeEventListener("keydown", onKeydown, true);
  window.removeEventListener("scroll", refresh, true);
  window.removeEventListener("resize", refresh);
});

// A target swap (editor re-opened on another todo) must not leave a stale bar.
watch(() => props.target, hide);

/**
 * The bar stays MOUNTED and is hidden with visibility, never v-if.
 * With v-if, barEl was null at the moment place() needed to measure it, so
 * every first placement fell back to a guessed 240x30 and the real ~300px
 * touch bar hung off the right edge of a phone. visibility:hidden keeps it in
 * layout, so offsetWidth is always the truth.
 */
const style = computed(() => ({
  top: `${pos.value.top}px`,
  left: `${pos.value.left}px`,
  visibility: visible.value ? ("visible" as const) : ("hidden" as const),
  pointerEvents: visible.value ? ("auto" as const) : ("none" as const),
}));
</script>

<template>
  <Teleport to="body">
    <!-- pointerdown.prevent, once, for mouse AND touch. Cancelling pointerdown
         suppresses the compatibility mousedown (so the textarea keeps focus
         and its selection) but is specified NOT to suppress `click`, which is
         what the buttons are bound to. The previous touchstart.prevent did
         suppress the synthesized click, leaving every button inert on every
         touch device while desktop kept working. -->
    <div
      ref="barEl"
      class="fb"
      :style="style"
      role="toolbar"
      aria-label="format selection"
      :aria-hidden="!visible"
      @pointerdown.prevent
    >
      <button
        v-for="b in BUTTONS"
        :key="b.kind"
        type="button"
        class="fb-btn"
        :class="b.cls"
        :title="b.title"
        :aria-label="b.title"
        tabindex="-1"
        @click="apply(b.kind)"
      >
        {{ b.label }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
/* Floating, so it reads as chrome over the text rather than part of the form.
   Ink ground + hairline, no radius beyond the house 2px. */
.fb {
  position: fixed;
  z-index: 70;
  display: flex;
  align-items: stretch;
  gap: 1px;
  padding: 2px;
  /* Floor under the clamp: on a narrow phone the bar can never be wider than
     the viewport, whatever the button metrics come out to. */
  max-width: calc(100vw - 16px);
  background: var(--ink);
  border-radius: 3px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.22);
}
.fb-btn {
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: 0.6875rem;
  text-transform: lowercase;
  color: #ffffff;
  background: transparent;
  border: 0;
  border-radius: 2px;
  cursor: pointer;
  transition: background 120ms ease;
}
.fb-btn:hover {
  background: rgba(255, 255, 255, 0.16);
}
.fb-btn:active {
  background: rgba(255, 255, 255, 0.28);
}
.fb-b {
  font-weight: 700;
}
.fb-i {
  font-style: italic;
}
.fb-s {
  text-decoration: line-through;
}
/* Touch: finger-sized without making the bar bulky on desktop. */
@media (pointer: coarse) {
  .fb-btn {
    min-width: 36px;
    height: 36px;
    font-size: 0.75rem;
  }
}
</style>
