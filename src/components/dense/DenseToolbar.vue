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
    controls.setFilter(props.routeKey, {
      tags: [],
      priority: [],
      state: [],
      effort: [],
    });
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
  effort: "effort",
};
const GROUP_LABEL: Record<string, string> = {
  today: "p0 + scheduled",
  context: "context",
  effort: "effort",
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
  return (
    f.tags.length + f.priority.length + f.state.length + (f.effort?.length ?? 0)
  );
});
const filterTitle = computed(() => {
  const f = state.value?.filter;
  // A bare "s" or "none" says nothing in a tooltip; name the axis.
  const sizes = (f?.effort ?? []).map((e) =>
    e === "none" ? "unsized" : `effort ${e.toLowerCase()}`,
  );
  const on = f ? [...f.priority, ...sizes, ...f.state, ...f.tags] : [];
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
    <div class="d-tool-title">
      <h1 v-if="title" class="d-h1">{{ title }}</h1>
      <span v-if="meta" class="d-h1-meta truncate">{{ meta }}</span>
    </div>
    <!-- Phone only (CSS): ends line one, so the title and "+ new" share it and
         the list's controls take line two. -->
    <span class="d-tool-break" aria-hidden="true"></span>
    <div class="d-tool-group">
      <div class="d-tool-wrap">
        <button
          :class="['chip', filterActive && 'chip-on']"
          :title="filterTitle"
          type="button"
          :aria-expanded="filterOpen"
          aria-haspopup="true"
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
          :aria-expanded="sortOpen"
          aria-haspopup="true"
          @click="onSort"
        >
          sort<span v-if="sortLabel" class="d-tool-state">
            · {{ sortLabel }}</span
          >
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
          :aria-expanded="groupOpen"
          aria-haspopup="true"
          @click="onGroup"
        >
          group<span v-if="groupLabel" class="d-tool-state">
            · {{ groupLabel }}</span
          >
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
        select
      </button>
      <button
        class="chip chip-primary d-tool-new"
        type="button"
        data-action="new-task"
        @click="emit('new')"
      >
        + new
      </button>
      <!-- A page's own controls (view toggle, more) ride the same line. -->
      <slot name="extra" />
    </div>
  </div>
</template>

<style scoped>
/* Pinned: the list's controls stay in reach however far it scrolls. One
   line on a laptop; paper behind it so rows pass underneath. */
.d-toolbar {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--paper);
  padding-top: var(--space-2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--hair);
  margin-bottom: var(--space-3);
  flex-wrap: wrap;
  gap: var(--space-2);
}
.d-tool-title {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  min-width: 0;
}
.d-tool-group {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}
.d-tool-break {
  display: none;
}
/* Phone: two pinned lines, never more. Line one is where you are and the one
   primary action: title, count, "+ new". Line two is the list's controls. The
   chip group dissolves (display: contents) so its children can be ordered
   across both lines; DOM and tab order are unchanged. Left to wrap on its own
   this bar ran to four lines on a 375px screen. */
@media (max-width: 600px) {
  .d-toolbar {
    flex-wrap: wrap;
    gap: 6px;
    padding-top: max(var(--space-2), env(safe-area-inset-top, 0px));
  }
  .d-tool-title {
    order: 0;
    flex: 1 1 0;
  }
  .d-tool-title .d-h1,
  .d-tool-title .d-h1-meta {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .d-tool-title .d-h1-meta {
    flex-shrink: 0;
  }
  .d-tool-group {
    display: contents;
  }
  .d-tool-group > * {
    order: 3;
  }
  .d-tool-group > .d-tool-new {
    order: 1;
  }
  .d-tool-break {
    display: block;
    order: 2;
    flex-basis: 100%;
    height: 0;
  }
  /* The state a chip names on a laptop ("sort · manual") costs a whole chip's
     width here. The popover shows it; the button keeps its title. */
  .d-tool-state {
    display: none;
  }
  .d-tool-group > .chip,
  .d-tool-group > .d-tool-wrap > .chip {
    padding-inline: 8px;
  }
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
/* Every control here is a .chip (main.css), which already grows to a 32px
   target under pointer:coarse; the active sort/group/filter is the ink
   inversion (.chip-on), never a cobalt fill. */
</style>
