import { nextTick, onBeforeUnmount, watch, type Ref } from "vue";
import Sortable from "sortablejs";
import { useVaultStore } from "../stores/vault";

/**
 * Drag-to-reorder for the grouped d-list views (Project / Area). Each group
 * body is its own Sortable instance with a UNIQUE group name, so dragging is
 * intra-group only - reordering within a priority/state bucket. Cross-group
 * moves (changing priority) are handled by the kanban board, not here.
 *
 * Persists the new order via `vault.reorderTodos` (writes `position`).
 *
 * Touch: press-hold (delay 180ms) so a normal vertical swipe still scrolls the
 * list; a deliberate hold initiates the drag. Handle is the whole `.d-row`,
 * matching the kanban card drag.
 *
 * Usage in a view:
 *   const { setBodyRef } = useListDragReorder(groups, routeKey);
 *   <div class="d-list-body" :ref="(el) => setBodyRef(g.key, el)"> ... </div>
 * with each row wrapped: <div :data-id="t.id"><DenseRow :todo="t" /></div>
 */
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

  function init() {
    destroy();
    for (const g of groups.value) {
      const el = bodyRefs[g.key];
      if (!el) continue;
      sortables.push(
        Sortable.create(el, {
          group: `list-${routeKey.value}-${g.key}`,
          animation: 150,
          handle: ".d-row",
          ghostClass: "opacity-30",
          chosenClass: "d-sortable-chosen",
          dragClass: "d-sortable-drag",
          delay: 180,
          delayOnTouchOnly: true,
          touchStartThreshold: 8,
          onEnd: async () => {
            const orderedIds = Array.from(el.children)
              .map((n) => (n as HTMLElement).dataset.id)
              .filter((x): x is string => !!x);
            if (orderedIds.length) {
              await vault.reorderTodos(
                orderedIds.map((id, i) => ({ id, position: i })),
              );
            }
            (document.activeElement as HTMLElement | null)?.blur();
          },
        }),
      );
    }
  }

  // Re-init whenever the group shape changes (count or membership).
  watch(
    () => groups.value.map((g) => `${g.key}:${g.items.length}`).join(","),
    () => void nextTick(init),
    { immediate: true },
  );

  onBeforeUnmount(destroy);

  return { setBodyRef };
}
