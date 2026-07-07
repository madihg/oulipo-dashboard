import { nextTick, onBeforeUnmount, watch, type Ref } from "vue";
import Sortable from "sortablejs";
import { useVaultStore } from "../stores/vault";
import type { TodoRow } from "../types/database";

/**
 * Drag-to-reorder for the grouped d-list views (Project / Area).
 *
 * When the list is grouped BY PRIORITY (sections P0/P1/P2/none), all section
 * bodies share one Sortable group so a task can be dragged ACROSS sections to
 * change its priority - the drop persists both the new priority (from the
 * destination section) and the new position. This is the list-view equivalent
 * of the kanban's cross-column drag.
 *
 * For any other grouping, each section is its own group (intra-group reorder
 * only, position-only) so a drag can't silently change the grouping field.
 *
 * Touch: press-hold (delay 180ms) so a normal vertical swipe still scrolls.
 * The drag also stamps the todo id on the native dataTransfer so a drop onto a
 * sidebar area / project (AreasNav) reassigns it.
 *
 * Usage:
 *   const { setBodyRef } = useListDragReorder(groups, routeKey);
 *   <div class="d-list-body" :data-prio="g.key" :ref="(el)=>setBodyRef(g.key, el)">
 *     <div v-for="t in g.items" :key="t.id" :data-id="t.id"><DenseRow :todo="t"/></div>
 *   </div>
 */
const PRIORITY_KEYS = ["P0", "P1", "P2", "ongoing", "none"];

export function useListDragReorder(
  groups: Ref<Array<{ key: string; items: Array<{ id: string }> }>>,
  routeKey: Ref<string>,
) {
  const vault = useVaultStore();
  const bodyRefs: Record<string, HTMLElement | null> = {};
  const sortables: Sortable[] = [];

  function setBodyRef(key: string, el: unknown) {
    bodyRefs[key] = (el as HTMLElement | null) ?? null;
  }

  function destroy() {
    while (sortables.length) sortables.pop()?.destroy();
  }

  function idsOf(el: HTMLElement): string[] {
    return Array.from(el.children)
      .map((n) => (n as HTMLElement).dataset.id)
      .filter((x): x is string => !!x);
  }

  function init() {
    destroy();
    const gs = groups.value;
    const isPriority =
      gs.length > 0 && gs.every((g) => PRIORITY_KEYS.includes(g.key));

    for (const g of gs) {
      const el = bodyRefs[g.key];
      if (!el) continue;
      sortables.push(
        Sortable.create(el, {
          // Shared group across priority sections -> cross-section drag allowed.
          group: isPriority
            ? `list-${routeKey.value}-pri`
            : `list-${routeKey.value}-${g.key}`,
          animation: 150,
          handle: ".d-row",
          ghostClass: "opacity-30",
          chosenClass: "d-sortable-chosen",
          dragClass: "d-sortable-drag",
          delay: 180,
          delayOnTouchOnly: true,
          touchStartThreshold: 8,
          setData: (dt, dragEl) => {
            const id = (dragEl as HTMLElement).dataset.id;
            if (id) dt.setData("application/x-hmart-todo", id);
          },
          onEnd: async (evt) => {
            const toEl = evt.to as HTMLElement;
            const fromEl = evt.from as HTMLElement;
            const destKey = toEl.dataset.prio ?? null;
            const destPriority: TodoRow["priority"] =
              isPriority && destKey && destKey !== "none"
                ? (destKey as TodoRow["priority"])
                : null;

            const updates: Array<{
              id: string;
              position: number;
              priority?: TodoRow["priority"];
            }> = idsOf(toEl).map((id, i) =>
              isPriority
                ? { id, position: i, priority: destPriority }
                : { id, position: i },
            );
            // Cross-section move: also renumber the source section.
            if (fromEl !== toEl) {
              updates.push(
                ...idsOf(fromEl).map((id, i) => ({ id, position: i })),
              );
            }
            if (updates.length) await vault.reorderTodos(updates);
            (document.activeElement as HTMLElement | null)?.blur();
          },
        }),
      );
    }
  }

  watch(
    () => groups.value.map((g) => `${g.key}:${g.items.length}`).join(","),
    () => void nextTick(init),
    { immediate: true },
  );

  onBeforeUnmount(destroy);

  return { setBodyRef };
}
