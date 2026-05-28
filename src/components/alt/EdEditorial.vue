<script setup lang="ts">
import type { AltToday } from "./types";
defineProps<{ today: AltToday }>();
</script>

<template>
  <div class="ed-editorial">
    <article class="mx-auto max-w-2xl px-s-5 py-s-6">
      <!-- Masthead row, like a newspaper dateline -->
      <div class="hairline pb-s-3 flex items-baseline justify-between">
        <span
          class="font-mono uppercase tracking-tracked text-meta text-text-tertiary"
          >vol. xix · no. 140</span
        >
        <span
          class="font-mono uppercase tracking-tracked text-meta text-text-tertiary"
          >today, {{ today.weekday }}</span
        >
      </div>

      <!-- Headline date -->
      <h1
        class="ed-headline mt-s-4 leading-none tracking-tight text-text-primary lowercase"
      >
        {{ today.date }}
      </h1>
      <p
        class="mt-s-2 font-mono uppercase tracking-tracked text-meta text-text-tertiary"
      >
        {{ today.groups.reduce((n, g) => n + g.tasks.length, 0) }}
        items · let's pick the one
      </p>

      <!-- Column body -->
      <div class="mt-s-6 ed-column-rule">
        <section
          v-for="(g, i) in today.groups"
          :key="g.label"
          :class="i === 0 ? '' : 'mt-s-6 hairline pt-s-5'"
        >
          <h2
            class="font-mono uppercase tracking-tracked text-meta mb-s-3"
            :class="
              g.accent === 'carnation'
                ? 'text-acc-carnation-text'
                : 'text-text-tertiary'
            "
          >
            <span
              class="ed-section-dot"
              :class="
                g.accent === 'carnation'
                  ? 'bg-acc-carnation'
                  : 'bg-text-tertiary'
              "
            ></span>
            {{ g.label }} · {{ g.tasks.length }}
          </h2>
          <ul class="flex flex-col gap-s-4">
            <li v-for="t in g.tasks" :key="t.id" class="ed-item">
              <h3 class="ed-title text-text-primary">{{ t.title }}</h3>
              <p
                class="mt-s-1 font-mono uppercase tracking-tracked text-meta text-text-tertiary flex flex-wrap gap-x-s-3 gap-y-s-1"
              >
                <span>{{ t.area }} / {{ t.project }}</span>
                <span v-if="t.deadline">· {{ t.deadline }}</span>
                <span v-for="tag in t.tags" :key="tag">· #{{ tag }}</span>
              </p>
            </li>
          </ul>
        </section>
      </div>

      <footer
        class="mt-s-8 hairline pt-s-4 font-mono uppercase tracking-tracked text-meta text-text-hint"
      >
        end of edition · file the day in the logbook tonight
      </footer>
    </article>
  </div>
</template>

<style scoped>
/* Editorial-leaning type: Playfair-style serif for the date, Inter-equivalent
   for body. Falls back to design-system stack to stay self-contained. */
.ed-editorial {
  font-feature-settings: "ss01", "ss02";
}
.ed-headline {
  font-family: "Bodoni Moda", "Iowan Old Style", Georgia, serif;
  font-weight: 500;
  font-size: clamp(2.5rem, 7vw, 4.5rem);
  letter-spacing: -0.02em;
}
.ed-title {
  font-family: "Iowan Old Style", Georgia, "Times New Roman", serif;
  font-size: 1.0625rem;
  line-height: 1.35;
}
.ed-column-rule > :not(:first-child) {
  border-top: 0;
}
.ed-item {
  padding-left: 0.5rem;
  border-left: 1px solid rgba(0, 0, 0, 0.08);
}
.ed-section-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 0.5rem;
  vertical-align: middle;
}
</style>
