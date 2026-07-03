<script setup lang="ts">
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useVaultStore } from "../stores/vault";
import { projectColor } from "../composables/useProjectColor";

const vault = useVaultStore();
const { areas } = storeToRefs(vault);

const ordered = computed(() =>
  [...areas.value].sort((a, b) => a.position - b.position),
);

onMounted(() => void vault.loadAreasAndProjects());
</script>

<template>
  <section class="list-column">
    <div class="d-area-header">
      <p class="d-area-kicker">areas</p>
      <h2 class="d-area-title">areas</h2>
    </div>

    <nav class="d-areas-list">
      <router-link
        v-for="a in ordered"
        :key="a.id"
        :to="`/area/${a.slug}`"
        class="d-area-link interactive"
      >
        <span
          class="d-area-dot"
          :style="{ background: projectColor(a.slug) }"
        />
        <span class="d-area-name">{{ a.name.toLowerCase() }}</span>
        <span class="d-area-chev" aria-hidden="true">›</span>
      </router-link>
    </nav>

    <p class="d-area-kicker mt-s-5 mb-s-1">reservoirs</p>
    <nav class="d-areas-list">
      <router-link to="/reservoir/apply" class="d-area-link interactive">
        <span class="d-area-dot" style="background: var(--acc-carnation)" />
        <span class="d-area-name">apply</span>
        <span class="d-area-chev" aria-hidden="true">›</span>
      </router-link>
      <router-link to="/reservoir/share" class="d-area-link interactive">
        <span class="d-area-dot" style="background: var(--acc-hard)" />
        <span class="d-area-name">share</span>
        <span class="d-area-chev" aria-hidden="true">›</span>
      </router-link>
    </nav>
  </section>
</template>

<style scoped>
.d-area-header {
  margin-bottom: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--sl-200);
}
.d-area-kicker {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-400);
}
.d-area-title {
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--sl-900);
  text-transform: lowercase;
  margin-top: 2px;
}
.d-areas-list {
  display: flex;
  flex-direction: column;
}
.d-area-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  min-height: 36px;
  border-top: 1px solid var(--sl-200);
  text-decoration: none;
}
.d-area-link:first-child {
  border-top: 0;
}
.d-area-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}
.d-area-name {
  flex: 1;
  font-size: 0.9375rem;
  color: var(--sl-900);
  text-transform: lowercase;
}
.d-area-chev {
  font-size: 1.0625rem;
  color: var(--sl-400);
}
</style>
