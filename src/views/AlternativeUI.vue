<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import EdEditorial from "../components/alt/EdEditorial.vue";
import EdBrutalist from "../components/alt/EdBrutalist.vue";
import EdCalm from "../components/alt/EdCalm.vue";
import EdDense from "../components/alt/EdDense.vue";
import EdTerminal from "../components/alt/EdTerminal.vue";
import type { AltToday } from "../components/alt/types";

type Direction = "editorial" | "brutalist" | "calm" | "dense" | "terminal";

const directions: Array<{
  key: Direction;
  label: string;
  tagline: string;
}> = [
  {
    key: "editorial",
    label: "editorial",
    tagline: "magazine headlines · serif date · column rule",
  },
  {
    key: "brutalist",
    label: "brutalist",
    tagline: "all-caps mono · stark hairlines · 4px accent caps",
  },
  {
    key: "calm",
    label: "calm",
    tagline: "linear-soft · rounded cards · slate-50 ground",
  },
  {
    key: "dense",
    label: "dense",
    tagline: "notion-hybrid · 4-col grid · color dots per project",
  },
  {
    key: "terminal",
    label: "terminal",
    tagline: "dark mono · single-letter shortcuts · green prompts",
  },
];

const STORAGE_KEY = "hmart.alt-ui.direction";
const active = ref<Direction>(
  (window?.localStorage?.getItem(STORAGE_KEY) as Direction) ?? "editorial",
);

function pick(d: Direction) {
  active.value = d;
  window?.localStorage?.setItem(STORAGE_KEY, d);
}

const Comp = computed(() => {
  switch (active.value) {
    case "editorial":
      return EdEditorial;
    case "brutalist":
      return EdBrutalist;
    case "calm":
      return EdCalm;
    case "dense":
      return EdDense;
    case "terminal":
      return EdTerminal;
  }
});

// Sample "today" data shared by every mockup so the comparison is honest.
// Same 6 tasks rendered through 5 different lenses.
const today = ref<AltToday>({
  weekday: "tuesday",
  date: "may 19 2026",
  groups: [
    {
      label: "p0",
      accent: "carnation",
      tasks: [
        {
          id: "1",
          title: "ship hmart kanban v1.0",
          area: "strategy",
          project: "ai workflows",
          deadline: "today",
          tags: ["release"],
        },
        {
          id: "2",
          title: "email Lele Barnett re: gallery intro",
          area: "growth",
          project: "5x4",
          deadline: null,
          tags: ["network", "warm"],
        },
        {
          id: "3",
          title: "draft response to Soham Patel",
          area: "growth",
          project: "5x4",
          deadline: null,
          tags: ["network"],
        },
      ],
    },
    {
      label: "overdue",
      accent: "carnation",
      tasks: [
        {
          id: "4",
          title: "submit DAIR Institute pitch",
          area: "growth",
          project: "apply",
          deadline: "2d ago",
          tags: ["apply", "p0"],
        },
      ],
    },
    {
      label: "scheduled",
      accent: "tertiary",
      tasks: [
        {
          id: "5",
          title: "rehearse clarinet 25 min",
          area: "earn + learn",
          project: "clarinet strategy",
          deadline: "today",
          tags: ["practice"],
        },
        {
          id: "6",
          title: "review tax timeline (Q2 → may 27)",
          area: "foundation",
          project: "be patient w. money",
          deadline: "8d",
          tags: ["wealth"],
        },
      ],
    },
  ],
});

onMounted(() => {
  // Reset doc title hint
  document.title = "hmart · alternative ui";
});
</script>

<template>
  <section
    class="min-h-screen"
    :class="{
      'bg-bg': active !== 'terminal',
      'bg-[#0b0e14] text-[#d6deeb]': active === 'terminal',
    }"
  >
    <!-- Picker bar - same across all directions so the switch is the chrome -->
    <header
      class="sticky top-0 z-30 backdrop-blur border-b px-s-5 py-s-3 flex flex-wrap items-baseline justify-between gap-s-4"
      :class="
        active === 'terminal'
          ? 'bg-[#0b0e14]/95 border-[#1f2530]'
          : 'bg-bg/95 border-border-light'
      "
    >
      <div class="flex items-baseline gap-s-4">
        <router-link
          to="/today"
          class="interactive font-display text-xl lowercase"
          :class="active === 'terminal' ? 'text-[#d6deeb]' : ''"
          >hmart</router-link
        >
        <span
          class="font-mono uppercase tracking-tracked text-meta"
          :class="
            active === 'terminal' ? 'text-[#6e7889]' : 'text-text-tertiary'
          "
          >alternative ui · five reads on the same day</span
        >
      </div>
      <nav
        class="flex flex-wrap gap-s-3 font-mono uppercase tracking-tracked text-meta"
      >
        <button
          v-for="d in directions"
          :key="d.key"
          class="interactive"
          :class="
            active === d.key
              ? active === 'terminal'
                ? 'text-[#ffd866]'
                : 'text-text-primary'
              : active === 'terminal'
                ? 'text-[#6e7889]'
                : 'text-text-tertiary'
          "
          @click="pick(d.key)"
        >
          {{ d.label }}
        </button>
      </nav>
    </header>

    <p
      class="px-s-5 py-s-2 font-mono uppercase tracking-tracked text-meta"
      :class="active === 'terminal' ? 'text-[#4d556a]' : 'text-text-hint'"
    >
      {{ directions.find((d) => d.key === active)?.tagline }}
    </p>

    <component :is="Comp" :today="today" />
  </section>
</template>
