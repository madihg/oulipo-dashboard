import { defineStore } from "pinia";
import { ref, watch } from "vue";

/**
 * Persistent filter state for Today (and any other list view that opts in).
 * Hydrates from localStorage on creation; writes back on every change.
 *
 * The filters are deliberately AND-ed at the consumer side - a null means
 * "no constraint on this axis".
 */
const STORAGE_KEY = "hmart.filters.v1";

type Persisted = {
  todayArea: string | null;
  todayProject: string | null;
  todayPriority: "P0" | "P1" | "P2" | null;
};

function loadPersisted(): Persisted {
  if (typeof window === "undefined") {
    return { todayArea: null, todayProject: null, todayPriority: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw)
      return { todayArea: null, todayProject: null, todayPriority: null };
    const obj = JSON.parse(raw) as Partial<Persisted>;
    return {
      todayArea: obj.todayArea ?? null,
      todayProject: obj.todayProject ?? null,
      todayPriority: obj.todayPriority ?? null,
    };
  } catch {
    return { todayArea: null, todayProject: null, todayPriority: null };
  }
}

export const useFiltersStore = defineStore("filters", () => {
  const initial = loadPersisted();
  const todayArea = ref<string | null>(initial.todayArea);
  const todayProject = ref<string | null>(initial.todayProject);
  const todayPriority = ref<"P0" | "P1" | "P2" | null>(initial.todayPriority);

  function persist() {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todayArea: todayArea.value,
        todayProject: todayProject.value,
        todayPriority: todayPriority.value,
      }),
    );
  }

  watch([todayArea, todayProject, todayPriority], persist);

  function clear() {
    todayArea.value = null;
    todayProject.value = null;
    todayPriority.value = null;
  }

  return { todayArea, todayProject, todayPriority, clear };
});
