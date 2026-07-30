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
  count?: number | null;
  /** When set, this toolbar manages filter/sort/group popovers via the
   *  listControls store keyed by this string. Otherwise it emits bare events. */
  routeKey?: string;
  availableTags?: string[];
  hideProjectGroup?: boolean;
  showTodayGroup?: boolean;
  showAreaGroup?: boolean;
}>();
const emit = defineEmits<{
  filter: [];
  sort: [];
  group: [];
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
  if (props.routeKey) {
    filterOpen.value = !filterOpen.value;
    sortOpen.value = false;
    groupOpen.value = false;
  } else emit("filter");
}
function onSort() {
  if (props.routeKey) {
    sortOpen.value = !sortOpen.value;
    filterOpen.value = false;
    groupOpen.value = false;
  } else emit("sort");
}
function onGroup() {
  if (props.routeKey) {
    groupOpen.value = !groupOpen.value;
    filterOpen.value = false;
    sortOpen.value = false;
  } else emit("group");
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
      <span v-if="count != null" class="d-count-chip">{{ count }}</span>
    </div>
    <div class="flex gap-s-2 flex-shrink-0">
      <div class="d-tool-wrap">
        <button
          :class="['d-tool', filterActive && 'd-tool-on']"
          type="button"
          @click="onFilter"
        >
          filter{{ filterActive ? " ·" : "" }}
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
        <button class="d-tool" type="button" @click="onSort">sort</button>
        <Popover
          v-if="routeKey && state"
          :open="sortOpen"
          @close="sortOpen = false"
        >
          <SortPopover :value="state.sort" @change="setSort" />
        </Popover>
      </div>
      <div class="d-tool-wrap">
        <button class="d-tool" type="button" @click="onGroup">group</button>
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
        :class="['d-tool', selection.selectMode && 'd-tool-on']"
        type="button"
        :aria-pressed="selection.selectMode"
        @click="onSelectToggle"
      >
        select{{ selection.selectMode ? " ·" : "" }}
      </button>
      <button
        class="d-tool d-tool-primary"
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
  border-bottom: 1px solid var(--sl-200);
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.d-h1 {
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--sl-900);
  text-transform: lowercase;
}
.d-h1-meta {
  font-size: 0.75rem;
  color: var(--sl-500);
  text-transform: lowercase;
}
.d-count-chip {
  font-size: 0.625rem;
  color: var(--sl-500);
  background: var(--sl-100);
  padding: 1px 6px;
  border-radius: 2px;
}
.d-tool-wrap {
  position: relative;
}
.d-tool {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--sl-700);
  border: 1px solid var(--sl-200);
  padding: 4px 10px;
  border-radius: 2px;
  cursor: pointer;
  background: transparent;
  transition: background 150ms ease;
}
.d-tool:hover {
  background: var(--sl-100);
}
.d-tool-on {
  background: var(--sl-900);
  color: #ffffff;
  border-color: var(--sl-900);
}
.d-tool-primary {
  background: var(--sl-900);
  color: #ffffff;
  border-color: var(--sl-900);
}
.d-tool-primary:hover {
  background: var(--sl-800);
  border-color: var(--sl-800);
}
</style>
