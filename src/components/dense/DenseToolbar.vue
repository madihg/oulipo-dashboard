<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useListControlsStore } from "../../stores/listControls";
import type {
  FilterState,
  GroupMode,
  SortMode,
} from "../../stores/listControls";
import Popover from "../Popover.vue";
import FilterPopover from "../FilterPopover.vue";
import SortPopover from "../SortPopover.vue";
import GroupPopover from "../GroupPopover.vue";
import { useSelectionStore } from "../../stores/selection";

const props = defineProps<{
  title: string;
  meta?: string | null;
  /** The listControls store key this toolbar's filter/sort/group popovers
   *  manage. Every caller passes one. */
  routeKey?: string;
  availableTags?: string[];
  hideProjectGroup?: boolean;
  showTodayGroup?: boolean;
  showAreaGroup?: boolean;
}>();
const emit = defineEmits<{
  new: [];
}>();

const controls = useListControlsStore();
const { byRoute } = storeToRefs(controls);
const state = computed(() =>
  props.routeKey ? controls.get(props.routeKey) : null,
);
// touch byRoute so reactivity tracks across keys
void byRoute;

const filterOpen = ref(false);
const sortOpen = ref(false);
const groupOpen = ref(false);

function onFilter() {
  filterOpen.value = !filterOpen.value;
  sortOpen.value = false;
  groupOpen.value = false;
}
function onSort() {
  sortOpen.value = !sortOpen.value;
  filterOpen.value = false;
  groupOpen.value = false;
}
function onGroup() {
  groupOpen.value = !groupOpen.value;
  filterOpen.value = false;
  sortOpen.value = false;
}

function applyFilter(v: FilterState) {
  if (props.routeKey) controls.setFilter(props.routeKey, v);
  filterOpen.value = false;
}
function clearFilter() {
  if (props.routeKey)
    controls.setFilter(props.routeKey, { tags: [], priority: [], state: [] });
  filterOpen.value = false;
}
function setSort(s: SortMode) {
  if (props.routeKey) controls.setSort(props.routeKey, s);
  sortOpen.value = false;
}
function setGroup(g: GroupMode) {
  if (props.routeKey) controls.setGroup(props.routeKey, g);
  groupOpen.value = false;
}

// Named only when off the default, so the toolbar stays quiet most of the time.
const SORT_LABEL: Record<string, string> = {
  alpha: "a to z",
  deadline: "deadline",
  created: "newest",
  manual: "manual",
  context: "context",
};
const GROUP_LABEL: Record<string, string> = {
  today: "p0 + scheduled",
  context: "context",
  area: "area",
  state: "state",
  project: "project",
  none: "none",
};
const sortLabel = computed(() =>
  state.value && state.value.sort !== "priority"
    ? (SORT_LABEL[state.value.sort] ?? state.value.sort)
    : "",
);
const groupLabel = computed(() =>
  state.value && state.value.group !== "priority"
    ? (GROUP_LABEL[state.value.group] ?? state.value.group)
    : "",
);
const filterCount = computed(() => {
  const f = state.value?.filter;
  if (!f) return 0;
  return f.tags.length + f.priority.length + f.state.length;
});
const filterTitle = computed(() => {
  const f = state.value?.filter;
  const on = f ? [...f.priority, ...f.state, ...f.tags] : [];
  return on.length ? `filtering: ${on.join(", ")}` : "filter this list";
});
const filterActive = computed(() =>
  props.routeKey ? controls.isFilterActive(props.routeKey) : false,
);

// Multi-select entry point that works without a keyboard (modifier clicks
// don't exist on touch). Toggling off also clears any selection.
const selection = useSelectionStore();
function onSelectToggle() {
  if (selection.selectMode) selection.clear();
  else selection.selectMode = true;
}
</script>

<template>
  <div class="d-toolbar">
    <div class="flex items-baseline gap-s-3 min-w-0">
      <h1 v-if="title" class="d-h1">{{ title }}</h1>
      <span v-if="meta" class="d-h1-meta truncate">{{ meta }}</span>
    </div>
    <div class="flex gap-s-2 flex-shrink-0">
      <div class="d-tool-wrap">
        <button
          :class="['chip', filterActive && 'chip-on']"
          :title="filterTitle"
          type="button"
          @click="onFilter"
        >
          filter{{ filterCount ? ` · ${filterCount}` : "" }}
        </button>
        <Popover
          v-if="routeKey && state"
          :open="filterOpen"
          @close="filterOpen = false"
        >
          <FilterPopover
            :value="state.filter"
            :available-tags="availableTags ?? []"
            @apply="applyFilter"
            @clear="clearFilter"
          />
        </Popover>
      </div>
      <div class="d-tool-wrap">
        <button
          class="chip"
          type="button"
          title="sort this list"
          @click="onSort"
        >
          sort{{ sortLabel ? ` · ${sortLabel}` : "" }}
        </button>
        <Popover
          v-if="routeKey && state"
          :open="sortOpen"
          @close="sortOpen = false"
        >
          <SortPopover :value="state.sort" @change="setSort" />
        </Popover>
      </div>
      <div class="d-tool-wrap">
        <button
          class="chip"
          type="button"
          title="group this list"
          @click="onGroup"
        >
          group{{ groupLabel ? ` · ${groupLabel}` : "" }}
        </button>
        <Popover
          v-if="routeKey && state"
          :open="groupOpen"
          anchor="right"
          @close="groupOpen = false"
        >
          <GroupPopover
            :value="state.group"
            :hide-project="hideProjectGroup"
            :show-today="showTodayGroup"
            :show-area="showAreaGroup"
            @change="setGroup"
          />
        </Popover>
      </div>
      <button
        :class="['chip', selection.selectMode && 'chip-on']"
        type="button"
        :aria-pressed="selection.selectMode"
        @click="onSelectToggle"
      >
        select{{ selection.selectMode ? " ·" : "" }}
      </button>
      <button
        class="chip chip-primary"
        type="button"
        data-action="new-task"
        @click="emit('new')"
      >
        + new
      </button>
    </div>
  </div>
</template>

<style scoped>
.d-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--hair);
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.d-h1 {
  font-size: var(--fs-sub);
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ink);
  text-transform: lowercase;
}
.d-h1-meta {
  font-size: var(--fs-small);
  color: var(--ink-50);
  text-transform: lowercase;
}
.d-tool-wrap {
  position: relative;
}
/* The select toggle is the only touch entry to multi-select and therefore to
   the BulkBar's when/area moves; at 22px tall it was a laptop button. Coarse
   pointers may bump target size (DESIGN.md), never swap layout. */
</style>
