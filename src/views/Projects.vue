<script setup lang="ts">
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useVaultStore } from "../stores/vault";
import { areaEmoji } from "../utils/areaEmoji";

/**
 * Every project on one page. A project is named as its key result, in three
 * words at most ("Baby HK Nov5"); the row carries its area's emoji in front
 * and what the project was called before in grey, so the short name stays
 * recognisable. A row opens the project's board.
 */
const vault = useVaultStore();
const { areas, projects } = storeToRefs(vault);

/** Notes are written "Original name. OKR: the full key result." */
const MARK = ". OKR:";

const rows = computed(() => {
  const byId = new Map(areas.value.map((a) => [a.id, a]));
  return projects.value
    .map((p) => {
      const area = byId.get(p.area_id) ?? null;
      const notes = p.notes ?? "";
      const cut = notes.indexOf(MARK);
      return {
        p,
        area,
        emoji: areaEmoji(area?.name),
        was: cut > 0 ? notes.slice(0, cut) : "",
        okr: cut > 0 ? notes.slice(cut + MARK.length).trim() : notes,
      };
    })
    .sort(
      (a, b) =>
        (a.area?.position ?? 99) - (b.area?.position ?? 99) ||
        a.p.position - b.p.position,
    );
});

onMounted(() => void vault.loadAreasAndProjects());
</script>

<template>
  <section class="list-column">
    <div class="pj-head">
      <h1 class="pj-title">projects</h1>
      <span class="pj-meta">{{ rows.length }} · named as key results</span>
    </div>

    <div v-if="!rows.length" class="d-empty">
      <p>no projects yet.</p>
      <router-link to="/today" class="chip">go to today</router-link>
    </div>

    <nav v-else class="pj-list" aria-label="projects">
      <router-link
        v-for="r in rows"
        :key="r.p.id"
        :to="`/project/${r.p.slug}/kanban`"
        class="pj-row interactive"
        :title="r.okr"
        :aria-label="`${r.p.name}, in ${r.area?.name ?? 'no area'}`"
      >
        <span class="pj-emoji" aria-hidden="true">{{ r.emoji }}</span>
        <span class="pj-name">{{ r.p.name }}</span>
        <span class="pj-was">{{ r.was }}</span>
        <span class="chev" aria-hidden="true"></span>
      </router-link>
    </nav>
  </section>
</template>

<style scoped>
.pj-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--hair);
}
.pj-title {
  font-size: var(--fs-sub);
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ink);
}
.pj-meta {
  font-size: var(--fs-small);
  color: var(--ink-50);
}
.pj-list {
  display: flex;
  flex-direction: column;
}
.pj-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  min-height: 36px;
  border-bottom: 1px solid var(--hair);
  text-decoration: none;
  color: var(--ink);
}
.pj-row:hover {
  background: var(--ground-2);
}
.pj-emoji {
  width: 1.4em;
  flex-shrink: 0;
  text-align: center;
}
.pj-name {
  font-size: var(--fs-body);
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}
.pj-was {
  flex: 1 1 0;
  min-width: 0;
  font-size: var(--fs-small);
  color: var(--ink-50);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (pointer: coarse) {
  .pj-row {
    min-height: 44px;
  }
}
</style>
