import { defineStore } from "pinia";
import { computed, ref } from "vue";

/**
 * Multi-select state for task rows. Selection is keyed by todo id (never by
 * list index - lists re-render under realtime). cmd/ctrl-click toggles,
 * shift-click extends a range in the visible DOM order of `main [data-id]`
 * wrappers (the same contract useListDragReorder and the keyboard machinery
 * rely on). The bulk action bar (BulkBar.vue) renders while anything is
 * selected.
 */
export const useSelectionStore = defineStore("selection", () => {
  const ids = ref<Set<string>>(new Set());
  const anchorId = ref<string | null>(null);
  // Touch entry point: modifier clicks don't exist on phones, so DenseToolbar
  // exposes a "select" toggle; while on, plain taps select instead of expand.
  const selectMode = ref(false);

  const count = computed(() => ids.value.size);
  const active = computed(() => ids.value.size > 0);

  function has(id: string): boolean {
    return ids.value.has(id);
  }

  function toggle(id: string) {
    const next = new Set(ids.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    ids.value = next;
    anchorId.value = id;
  }

  /** Visible row order, as rendered. Only top-level [data-id] wrappers count:
   *  checklist items carry data-id too but sit INSIDE a row's wrapper, so
   *  anything nested under another [data-id] is excluded. Rows without a
   *  wrapper (board cards on Today) can't participate in ranges - toggle
   *  still works. */
  function visibleOrder(): string[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>("main [data-id]"),
    ).flatMap((el) =>
      el.dataset.id && !el.parentElement?.closest("main [data-id]")
        ? [el.dataset.id]
        : [],
    );
  }

  function selectRange(id: string) {
    const order = visibleOrder();
    const a = anchorId.value ? order.indexOf(anchorId.value) : -1;
    const b = order.indexOf(id);
    if (a === -1 || b === -1) {
      toggle(id);
      return;
    }
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const next = new Set(ids.value);
    for (let i = lo; i <= hi; i++) next.add(order[i]!);
    ids.value = next;
  }

  function clear() {
    ids.value = new Set();
    anchorId.value = null;
    selectMode.value = false;
  }

  /** Drop a single id (e.g. after its row is deleted) without touching mode. */
  function drop(id: string) {
    if (!ids.value.has(id)) return;
    const next = new Set(ids.value);
    next.delete(id);
    ids.value = next;
  }

  return {
    ids,
    count,
    active,
    selectMode,
    has,
    toggle,
    selectRange,
    clear,
    drop,
  };
});
