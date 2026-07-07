<script setup lang="ts">
import { useRoute } from "vue-router";

defineEmits<{ add: []; search: [] }>();
const route = useRoute();

function isOn(path: string) {
  return route.path === path || route.path.startsWith(path + "/");
}
</script>

<template>
  <nav class="m-tabs" aria-label="primary">
    <router-link to="/today" class="m-tab" :class="{ on: isOn('/today') }">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path
          d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M18.4 5.6l-1.1 1.1M6.7 17.3l-1.1 1.1"
        />
      </svg>
      <span>today</span>
    </router-link>

    <router-link to="/inbox" class="m-tab" :class="{ on: isOn('/inbox') }">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path
          d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
        />
      </svg>
      <span>inbox</span>
    </router-link>

    <button
      type="button"
      class="m-tab m-add"
      aria-label="new task"
      @click="$emit('add')"
    >
      <span class="m-add-ico">
        <svg viewBox="0 0 24 24" aria-hidden="true" stroke-width="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
    </button>

    <router-link
      to="/areas"
      class="m-tab"
      :class="{ on: isOn('/areas') || isOn('/area') }"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
      </svg>
      <span>areas</span>
    </router-link>

    <button
      type="button"
      class="m-tab"
      aria-label="search"
      @click="$emit('search')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <span>search</span>
    </button>
  </nav>
</template>

<style scoped>
/* Mobile-only: hidden by default (incl. desktop), shown < 768px.
   The display rule lives here (scoped) so it isn't outranked by a global
   utility class - scoped selectors carry the data-attribute and win. */
.m-tabs {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 40;
  /* Solid background (no backdrop-filter: on iOS it can intercept/eat taps on
     children of a fixed, blurred container). */
  background: #ffffff;
  border-top: 1px solid var(--sl-200);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
@media (max-width: 767px) {
  .m-tabs {
    display: flex;
  }
}
.m-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 56px;
  padding: 8px 0 6px;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-decoration: none;
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.59rem;
  text-transform: lowercase;
  letter-spacing: 0.04em;
  /* Solid idle (not washed 50% grey); active reads via cobalt. */
  color: var(--sl-700);
}
.m-tab svg {
  width: 23px;
  height: 23px;
  fill: none;
  stroke: var(--sl-700);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.m-tab.on {
  color: var(--acc-carnation-text);
}
.m-tab.on svg {
  stroke: var(--acc-carnation);
}
.m-add {
  flex: 0 0 auto;
  padding-left: 6px;
  padding-right: 6px;
}
.m-add-ico {
  width: 44px;
  height: 44px;
  background: var(--sl-900);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: -2px;
}
.m-add-ico svg {
  width: 24px;
  height: 24px;
  stroke: #ffffff;
}
</style>
