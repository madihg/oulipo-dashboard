<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import type { TodoState } from "../types/database";
import {
  effectiveWhen,
  todayISO,
  whenPatch,
  type WhenPatch,
} from "../utils/when";
import {
  WEEKDAYS,
  buildCalendar,
  cellLabel,
  fromISO,
  shiftWithin,
  type CalendarCell,
} from "../utils/calendar";

/**
 * The body of the "when" picker: quick rows above and below one continuous
 * scrolling calendar, in the Things arrangement.
 *
 * The calendar is a single ribbon of weeks rather than a set of month pages -
 * rows never break at a month boundary, the 1st just carries a stacked month
 * badge. That is what makes "two weeks from now" a scroll rather than a
 * month-forward click, and it removes any need for month navigation chrome.
 *
 * Rendered inside either surface (anchored popover on a laptop, bottom sheet on
 * a phone), so it owns no positioning of its own.
 */

const props = defineProps<{
  state: TodoState;
  startDate: string | null;
  evening: boolean;
  /** Bottom-sheet surface: bigger targets, a title, a footer-mounted clear. */
  sheet?: boolean;
}>();
const emit = defineEmits<{ pick: [patch: WhenPatch]; close: [] }>();

// Rebuilt when the panel is created, which is once per open (both surfaces
// v-if their content). A module-level or otherwise cached grid would keep yesterday's
// "today" for anyone who leaves the app open overnight.
const weeks = ref(buildCalendar({ months: 12 }));
const scrollEl = ref<HTMLElement | null>(null);

const eff = computed(() =>
  effectiveWhen({
    state: props.state,
    start_date: props.startDate,
    evening: props.evening,
  }),
);

/**
 * Which quick row is lit, and which day cell is filled. Derived from the
 * INFERRED when, never from start_date directly: a legacy {anytime, today} row
 * reads as "today", so it lights the row rather than lighting both the row and
 * the cell. Exactly one of the two is ever set.
 */
const activeRow = computed<"today" | "evening" | "someday" | null>(() => {
  const k = eff.value.key;
  if (k === "evening") return "evening";
  if (k === "today") return "today";
  if (k === "someday") return "someday";
  return null;
});
const selectedIso = computed(() =>
  activeRow.value === null && eff.value.key !== null ? props.startDate : null,
);

/** Every date the grid actually offers. */
const gridIsos = computed(
  () =>
    new Set(
      weeks.value
        .flat()
        .filter((c) => !c.isPad && c.iso)
        .map((c) => c.iso),
    ),
);
/**
 * Roving focus, held as an ISO string rather than a DOM ref so it survives the
 * grid re-rendering underneath it.
 *
 * It must name a date the grid HAS. A task scheduled in the past, or further
 * out than the offered range, has no square here - parking the caret on it
 * would leave every cell at tabindex="-1" and the whole calendar unreachable
 * from the keyboard.
 */
function inGrid(iso: string | null): iso is string {
  return !!iso && gridIsos.value.has(iso);
}
const caret = ref<string>(
  inGrid(selectedIso.value) ? selectedIso.value : todayISO(),
);
const gridEl = ref<HTMLElement | null>(null);
const liveMonth = ref("");

const QUICK = [
  { key: "today" as const, label: "today" },
  { key: "evening" as const, label: "this evening" },
];

function pickKey(key: "today" | "evening" | "someday" | "clear") {
  emit("pick", whenPatch(key));
  emit("close");
}

function pickCell(cell: CalendarCell) {
  if (cell.isPad || !cell.iso) return;
  // Picking today's square must mean the same thing as pressing the "today"
  // row. {anytime, start_date: today} looks identical now and diverges
  // tomorrow: it still satisfies belongsInToday (start_date <= today), so the
  // task would sit in Today forever wearing yesterday's date as its chip.
  emit(
    "pick",
    cell.iso === todayISO()
      ? whenPatch("today")
      : whenPatch("date", { date: cell.iso }),
  );
  emit("close");
}

/** Move the roving caret, then follow it with focus without yanking the scroll. */
async function moveCaret(days: number) {
  const next = shiftWithin(weeks.value, caret.value, days);
  if (next === caret.value) return;
  caret.value = next;
  announceMonthFor(next);
  await nextTick();
  const el = gridEl.value?.querySelector<HTMLElement>(`[data-iso="${next}"]`);
  el?.focus({ preventScroll: true });
  // Optional call: not every environment implements scrollIntoView, and losing
  // the scroll-follow must never take the caret movement down with it.
  // "nearest" and never "smooth" - a smooth scroll here ignores
  // prefers-reduced-motion and fights the next arrow press.
  el?.scrollIntoView?.({ block: "nearest" });
}

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
function announceMonthFor(iso: string) {
  const d = fromISO(iso);
  const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  if (label !== liveMonth.value) liveMonth.value = label;
}

function onGridKey(e: KeyboardEvent) {
  const dow = caret.value ? fromISO(caret.value).getDay() : 0;
  const moves: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
    Home: -dow,
    End: 6 - dow,
    // Four weeks, not a calendar month: it stays column-aligned and needs no
    // end-of-month clamping (31 jan + a month must not become 3 mar).
    PageUp: e.shiftKey ? -364 : -28,
    PageDown: e.shiftKey ? 364 : 28,
  };
  if (e.key in moves) {
    e.preventDefault();
    void moveCaret(moves[e.key] ?? 0);
    return;
  }
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    const cell = weeks.value.flat().find((c) => c.iso === caret.value);
    if (cell) pickCell(cell);
  }
}

// Keep the caret on the selection when the task's schedule changes underneath,
// but never onto a date the grid does not offer.
watch(selectedIso, (v) => {
  if (inGrid(v)) caret.value = v;
});

function isSelected(cell: CalendarCell) {
  return !cell.isPad && !!cell.iso && cell.iso === selectedIso.value;
}

/**
 * Open with the selected date on screen. Without this, a task scheduled two
 * months out opens on a calendar that looks empty - the filled square is
 * dozens of rows below the fold with nothing to say so.
 *
 * Sets scrollTop directly rather than calling scrollIntoView, which would also
 * scroll every ancestor (the page, the editor modal) to chase the cell.
 */
/**
 * Rebuild if the day turned while the app sat in the background. Cheap, and it
 * keeps the star on the right square for anyone who opens the picker first
 * thing in the morning without reloading.
 */
function refreshIfDayChanged() {
  if (document.visibilityState !== "visible") return;
  const grid = weeks.value.flat().find((c) => c.isToday);
  if (grid && grid.iso !== todayISO())
    weeks.value = buildCalendar({ months: 12 });
}
onMounted(() => {
  document.addEventListener("visibilitychange", refreshIfDayChanged);

  const iso = selectedIso.value;
  const sc = scrollEl.value;
  if (!iso || !sc || !inGrid(iso)) return;
  const row = weeks.value.findIndex((w) => w.some((c) => c.iso === iso));
  if (row < 0) return;
  const rowH = sc.scrollHeight / weeks.value.length;
  sc.scrollTop = Math.max(0, row * rowH - sc.clientHeight / 2 + rowH / 2);
});
onBeforeUnmount(() =>
  document.removeEventListener("visibilitychange", refreshIfDayChanged),
);
</script>

<template>
  <!-- dragstart.prevent: the panel is a DOM descendant of the task row, which is
       draggable="true". Without this, press-and-drag inside the calendar starts
       dragging the task itself. .when-anchor's @click.stop only stops clicks. -->
  <div
    class="wp"
    :class="{ 'wp-is-sheet': sheet }"
    data-when-surface
    @dragstart.stop.prevent
  >
    <h2 v-if="sheet" class="wp-title">when</h2>

    <button
      v-for="q in QUICK"
      :key="q.key"
      type="button"
      class="wp-row"
      :class="{ 'wp-row-on': activeRow === q.key }"
      :aria-pressed="activeRow === q.key"
      @click="pickKey(q.key)"
    >
      <svg
        v-if="q.key === 'today'"
        class="wp-ico wp-ico-star"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z"
        />
      </svg>
      <svg
        v-else
        class="wp-ico wp-ico-moon"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
      </svg>
      <span class="wp-row-label">{{ q.label }}</span>
      <svg
        v-if="activeRow === q.key"
        class="wp-tick"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </button>

    <div class="wp-sep" aria-hidden="true"></div>

    <div ref="scrollEl" class="wp-scroll">
      <table
        ref="gridEl"
        class="wp-grid"
        role="grid"
        aria-label="pick a date"
        @keydown="onGridKey"
      >
        <thead>
          <tr>
            <th v-for="d in WEEKDAYS" :key="d" scope="col">{{ d }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(week, wi) in weeks" :key="wi">
            <td
              v-for="(cell, ci) in week"
              :key="ci"
              role="gridcell"
              class="wp-cell"
              :class="{
                'wp-cell-pad': cell.isPad,
                'wp-cell-on': isSelected(cell),
                'wp-cell-today': cell.isToday,
                'wp-cell-month': cell.isFirstOfMonth,
              }"
              :data-iso="cell.iso || undefined"
              :tabindex="cell.isPad ? undefined : cell.iso === caret ? 0 : -1"
              :aria-label="cellLabel(cell) || undefined"
              :aria-selected="isSelected(cell) ? 'true' : undefined"
              :aria-current="cell.isToday ? 'date' : undefined"
              @click="pickCell(cell)"
            >
              <template v-if="!cell.isPad">
                <span
                  v-if="cell.isFirstOfMonth"
                  class="wp-badge"
                  aria-hidden="true"
                >
                  <span class="wp-badge-mo">{{ cell.monthLabel }}</span>
                  <span class="wp-badge-day">{{ cell.day }}</span>
                </span>
                <svg
                  v-else-if="cell.isToday"
                  class="wp-cell-star"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z"
                  />
                </svg>
                <span v-else aria-hidden="true">{{ cell.day }}</span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="wp-sep" aria-hidden="true"></div>

    <button
      type="button"
      class="wp-row"
      :class="{ 'wp-row-on': activeRow === 'someday' }"
      :aria-pressed="activeRow === 'someday'"
      @click="pickKey('someday')"
    >
      <svg class="wp-ico wp-ico-box" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="7" width="18" height="13" rx="1.5" />
        <path d="M3 11h18M2 4.5h20v3H2z" />
      </svg>
      <span class="wp-row-label">someday</span>
      <svg
        v-if="activeRow === 'someday'"
        class="wp-tick"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </button>

    <div class="wp-foot">
      <button type="button" class="wp-clear" @click="pickKey('clear')">
        clear
      </button>
    </div>

    <!-- Arrowing across a month boundary produces no visible month header, so
         announce it for a screen reader. -->
    <div class="wp-sr" role="status" aria-live="polite" aria-atomic="true">
      {{ liveMonth }}
    </div>
  </div>
</template>

<style scoped>
.wp {
  --cal-cell-h: 36px;
  --cal-rows: 4.5;
  display: flex;
  flex-direction: column;
  /* Break out of .d-pop's 8px padding so seven columns clear the 44px touch
     target: 302px of content gives 43.1px cells, 318px gives 45.4px. */
  margin: -8px;
  width: calc(100% + 16px);
}
.wp-title {
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-40);
  padding: 12px 16px 6px;
  margin: 0;
}

/* ---- quick rows ---- */
.wp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  font-family: var(--font-body);
  font-size: 0.8125rem;
  text-transform: lowercase;
  color: var(--ink-85);
  background: transparent;
  border: 0;
  border-radius: 2px;
  cursor: pointer;
  text-align: left;
  transition:
    background 120ms ease,
    color 120ms ease;
}
.wp-row:hover {
  background: var(--ground-2);
}
.wp-row,
.wp-clear {
  /* Same treatment the day cells get: two quick taps must be two taps, and the
     default grey flash reads as a render bug over our own active state. */
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.wp-row:active,
.wp-clear:active {
  background: var(--ink-08);
}
.wp-row-on {
  color: var(--acc-carnation-text);
  background: var(--cobalt-tint);
  font-weight: 600;
}
.wp-row-label {
  flex: 1 1 auto;
  min-width: 0;
}
.wp-ico {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
.wp-ico-star {
  fill: var(--acc-hard);
}
.wp-ico-moon {
  fill: var(--ink-50);
}
.wp-ico-box {
  fill: none;
  stroke: var(--ink-50);
  stroke-width: 1.6;
  stroke-linejoin: round;
}
.wp-tick {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  fill: none;
  stroke: var(--acc-carnation);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.wp-sep {
  border-top: 1px solid var(--hair);
  margin: 4px 0;
}

/* ---- calendar ---- */
.wp-scroll {
  height: calc(var(--cal-cell-h) * var(--cal-rows));
  overflow-y: auto;
  /* Do not chain the page scroll when the calendar hits its end. */
  overscroll-behavior-y: contain;
  /* Chrome's scroll anchoring would silently paper over a jump that Safari
     shows; keep the real behaviour visible. */
  overflow-anchor: none;
}
.wp-grid {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}
.wp-grid th {
  position: sticky;
  top: 0;
  z-index: 1;
  height: 18px;
  background: var(--paper);
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: 0.5625rem;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-40);
}
.wp-cell {
  height: var(--cal-cell-h);
  text-align: center;
  vertical-align: middle;
  font-size: 0.8125rem;
  color: var(--ink-85);
  cursor: pointer;
  border-radius: 2px;
  /* The sticky header would otherwise cover a cell scrolled to by the caret. */
  scroll-margin-top: 18px;
  /* Two quick taps on neighbouring days must be two taps, not a zoom. */
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition:
    background 100ms ease,
    color 100ms ease;
}
.wp-cell:hover {
  background: var(--ground-2);
}
.wp-cell:active {
  background: var(--ink-08);
}
.wp-cell-pad {
  cursor: default;
  pointer-events: none;
}
.wp-cell-today {
  color: var(--acc-hard-text);
}
.wp-cell-star {
  width: 14px;
  height: 14px;
  fill: var(--acc-hard);
  vertical-align: middle;
}
.wp-cell-on,
.wp-cell-on:hover {
  background: var(--acc-carnation);
  color: #ffffff;
  font-weight: 600;
}
.wp-cell-on .wp-cell-star {
  fill: #ffffff;
}
.wp-cell-on .wp-badge {
  border-color: rgba(255, 255, 255, 0.5);
}
/* The 1st carries a stacked month badge INSIDE its normal cell box - offsetting
   it (as Things does) would break the seven-column alignment with the header. */
.wp-badge {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1.05;
  padding: 2px 3px;
  border: 1px solid var(--hair);
  border-radius: 2px;
}
.wp-badge-mo {
  font-family: var(--font-mono);
  font-variation-settings: "MONO" 1;
  font-size: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-50);
}
.wp-cell-on .wp-badge-mo {
  color: rgba(255, 255, 255, 0.85);
}
.wp-badge-day {
  font-size: 0.75rem;
}

/* ---- clear ---- */
.wp-foot {
  border-top: 1px solid var(--hair);
  margin-top: 4px;
}
.wp-clear {
  display: block;
  width: 100%;
  height: 32px;
  font-family: var(--font-body);
  font-size: 0.8125rem;
  text-transform: lowercase;
  color: var(--ink-50);
  background: transparent;
  border: 0;
  cursor: pointer;
  transition:
    color 120ms ease,
    background 120ms ease;
}
.wp-clear:hover {
  color: var(--ink-85);
  background: var(--ground-2);
}

.wp-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* Finger-sized targets wherever the pointer is coarse, on either surface. */
@media (pointer: coarse) {
  .wp {
    --cal-cell-h: 44px;
  }
  .wp-row,
  .wp-clear {
    height: var(--touch-target, 44px);
  }
}

/* ---- bottom sheet ---- */
/* Every part of the sheet EXCEPT the calendar must swallow a drag rather than
   chaining it to the list behind the dialog. touch-action intersects down the
   ancestor chain, so this cannot go on the sheet root - the calendar inside it
   would stop scrolling too. */
.wp-is-sheet .wp-title,
.wp-is-sheet .wp-row,
.wp-is-sheet .wp-sep,
.wp-is-sheet .wp-foot {
  touch-action: none;
}
.wp-is-sheet {
  --cal-cell-h: 44px;
  --cal-rows: 5.5;
  margin: 0;
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
}
.wp-is-sheet .wp-row,
.wp-is-sheet .wp-clear {
  height: var(--touch-target, 44px);
  padding-inline: 16px;
  font-size: 0.9375rem;
}
.wp-is-sheet .wp-scroll {
  /* Let the calendar take the slack instead of pushing "clear" off-screen.
     min-height:0 is load-bearing: a flex child will not shrink without it. */
  flex: 1 1 auto;
  min-height: 0;
  height: auto;
  max-height: calc(var(--cal-cell-h) * var(--cal-rows));
}
.wp-is-sheet .wp-foot {
  flex: 0 0 auto;
  /* The footer, not the sheet, carries the inset, so the button's background
     reaches the screen edge and only its label insets. */
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

@media (prefers-reduced-motion: reduce) {
  .wp-row,
  .wp-cell,
  .wp-clear {
    transition: none;
  }
}
</style>
