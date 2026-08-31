<script setup lang="ts">
/**
 * System map - one page that shows the whole machine: what captures data,
 * where it lands in Supabase, and what surfaces it. Structure is declared here
 * (architecture changes rarely); row counts are fetched live so the page can
 * never quietly drift from the real database.
 */
import { onMounted, ref } from "vue";
import { supabase } from "../lib/supabase";

type Table = { name: string; note: string; count?: number | null };
type Schema = { name: string; tint: string; blurb: string; tables: Table[] };

const counts = ref<Record<string, number | null>>({});
const loading = ref(true);

// Tables we show a live count for. Keyed "schema.table".
const COUNTED = [
  "hmart.todos",
  "hmart.granola_notes",
  "hmart.matter_items",
  "hmart.matter_annotations",
  "hmart.network_contacts",
  "hmart.memory_entries",
  "hmart.routine_ledger",
  "hmart.learn_wikis",
  "hmart.outings_events",
  "hmart.apply_opportunities",
];

const schemas: Schema[] = [
  {
    name: "hmart",
    tint: "var(--sl-900, #111)",
    blurb:
      "private productivity core - the source of truth for tasks, notes and memory",
    tables: [
      { name: "todos", note: "tasks; state + area + project" },
      {
        name: "areas / projects / headings",
        note: "the 12 life areas and their structure",
      },
      {
        name: "checklist_items / todo_tags / tags",
        note: "task detail and labelling",
      },
      {
        name: "granola_notes",
        note: "every meeting: notes, summaries, verbatim transcripts (Granola + anarlog)",
      },
      { name: "matter_items", note: "reading library mirrored from Matter" },
      { name: "matter_annotations", note: "highlights from that library" },
      { name: "network_contacts", note: "CRM - people, orgs, last thread" },
      {
        name: "memory_entries",
        note: "durable rules, taxonomies, portable routine specs",
      },
      {
        name: "routine_ledger",
        note: "what each routine already processed (dedupe memory)",
      },
      {
        name: "picker_runs",
        note: "run log: every routine execution and its counts",
      },
      { name: "daily_debriefs / board_notes", note: "the daily surface" },
      {
        name: "learn_wikis / learn_items / make_wikis",
        note: "knowledge threads",
      },
      { name: "apply_opportunities / share_items", note: "the reservoirs" },
      {
        name: "outings_events / outings_briefings",
        note: "SF events feeding oulipo.xyz/derive",
      },
      {
        name: "inbox_reply_drafts",
        note: "drafted Gmail replies awaiting review",
      },
      { name: "claude_tasks", note: "queue for work approved in the kanban" },
    ],
  },
  {
    name: "oulipo_dashboard",
    tint: "#f6009b",
    blurb: "the portfolio catalogue",
    tables: [
      {
        name: "works",
        note: "171 works powering halimmadi.com and oulipo.xyz",
      },
    ],
  },
  {
    name: "public",
    tint: "#0057ff",
    blurb: "anything the websites read without signing in",
    tables: [
      {
        name: "works / events (views)",
        note: "read-only projections of the catalogue",
      },
      { name: "newsletter", note: "signups from halimmadi.com" },
      { name: "style / brand_system", note: "canonical voice and brand rules" },
      {
        name: "derive_events / derive_briefings (views)",
        note: "what oulipo.xyz/derive renders",
      },
      { name: "shows / show_state / hydra_*", note: "live performance state" },
    ],
  },
  {
    name: "singulars",
    tint: "#6b3fe0",
    blurb: "the human-vs-machine poetry series",
    tables: [
      {
        name: "performances / poems / votes / themes",
        note: "each duel and how the room voted",
      },
      {
        name: "fine_tune_jobs / candidate_models",
        note: "the models trained on winning poems",
      },
      {
        name: "eval_runs / eval_scores / poem_classifier_scores",
        note: "how the models are judged",
      },
      {
        name: "stage_state / stage_presence",
        note: "live stage during a show",
      },
    ],
  },
  {
    name: "wikitongues",
    tint: "#0a7d55",
    blurb: "endangered-language model work (Igala)",
    tables: [
      {
        name: "FineTuneJob / CandidateModel / EvalRun",
        note: "training and evaluation",
      },
      { name: "LexEntry / RagEntry / ParallelPair", note: "language data" },
      {
        name: "RubricScore / PairwiseComparison",
        note: "annotator judgements",
      },
    ],
  },
  {
    name: "becoming_border · hatchings_eyes",
    tint: "#8a8a8a",
    blurb: "per-artwork state for individual pieces",
    tables: [
      {
        name: "crossings, storage buckets",
        note: "audience traces from live works",
      },
    ],
  },
];

const routines = [
  {
    id: "daily-desk",
    when: "every day, 06:14",
    where: "local scheduled task",
    reads: ["Granola", "anarlog", "Day One", "Gmail", "hmart.todos"],
    writes: [
      "granola_notes",
      "todos (inbox)",
      "inbox_reply_drafts",
      "daily_debriefs",
      "routine_ledger",
    ],
    note: "The daily pass. Triages meetings, journal and inbox into the kanban and drafts replies. Never sends.",
  },
  {
    id: "weekly-desk",
    when: "Sundays, 07:26",
    where: "local scheduled task",
    reads: [
      "Granola (full window)",
      "anarlog (full history)",
      "Gmail (new senders)",
    ],
    writes: [
      "granola_notes",
      "network_contacts",
      "daily_debriefs",
      "picker_runs",
    ],
    note: "The capture backstop. Guarantees nothing ages out unrecorded, and feeds the CRM.",
  },
  {
    id: "outings-briefing",
    when: "Mondays, 04:13",
    where: "local scheduled task",
    reads: ["Gmail label City/_SF_", "80+ venue sites"],
    writes: ["outings_events", "outings_briefings"],
    note: "Builds the week of SF events. This is what oulipo.xyz/derive renders.",
  },
  {
    id: "anarlog-sync",
    when: "continuous",
    where: "launchd (com.halim.anarlog-sync)",
    reads: ["anarlog local database"],
    writes: ["granola_notes"],
    note: "Mirrors meeting recordings as they finish. Zero model tokens.",
  },
  {
    id: "matter-sync",
    when: "on demand",
    where: "script (scripts/matter-sync.py)",
    reads: ["Matter API"],
    writes: ["matter_items", "matter_annotations"],
    note: "Mirrors the reading library. Incremental, idempotent, zero model tokens.",
  },
];

const captures = [
  { name: "Granola / anarlog", what: "meetings + transcripts" },
  { name: "Gmail", what: "inbox, new correspondents" },
  { name: "Day One", what: "journal" },
  { name: "Matter", what: "reading + highlights" },
  { name: "kanban capture bar", what: "anything typed by hand" },
];

const surfaces = [
  { name: "hmart kanban", what: "this app - todos, inbox, debrief" },
  { name: "halimmadi.com", what: "works, newsletter" },
  { name: "oulipo.xyz/derive", what: "the weekly outings page" },
  { name: "Umami", what: "site analytics" },
];

onMounted(async () => {
  await Promise.all(
    COUNTED.map(async (key) => {
      const table = key.split(".")[1] ?? key;
      try {
        // The client is already scoped to the hmart schema.
        const { count, error } = await supabase
          .from(table)
          .select("*", { count: "exact", head: true });
        counts.value[key] = error ? null : (count ?? null);
      } catch {
        counts.value[key] = null;
      }
    }),
  );
  loading.value = false;
});

function countFor(schema: string, tableLabel: string): string {
  const first = tableLabel.split(" ")[0];
  const v = counts.value[`${schema}.${first}`];
  return typeof v === "number" ? v.toLocaleString() : "";
}
</script>

<template>
  <div class="sysmap">
    <header class="sysmap-head">
      <h1 class="font-display lowercase text-xl">system map</h1>
      <p class="sysmap-sub">
        everything that captures, stores or surfaces your data.
        <span v-if="loading">counting rows…</span>
        <span v-else>row counts are live.</span>
      </p>
    </header>

    <!-- The spine: capture -> store -> surface -->
    <section class="flow">
      <div class="flow-col">
        <p class="flow-cap">capture</p>
        <div v-for="c in captures" :key="c.name" class="chip">
          <span class="chip-name">{{ c.name }}</span>
          <span class="chip-note">{{ c.what }}</span>
        </div>
      </div>

      <div class="flow-arrow" aria-hidden="true">→</div>

      <div class="flow-col flow-col--center">
        <p class="flow-cap">store</p>
        <div class="core">
          <p class="core-title">Supabase · oulipo_main</p>
          <p class="core-note">
            7 schemas, 83 tables. hmart is the private core; everything else is
            per-project.
          </p>
          <div class="core-stats">
            <span
              ><b>{{ counts["hmart.todos"] ?? "—" }}</b> todos</span
            >
            <span
              ><b>{{ counts["hmart.granola_notes"] ?? "—" }}</b> meetings</span
            >
            <span
              ><b>{{ counts["hmart.matter_items"] ?? "—" }}</b> reads</span
            >
            <span
              ><b>{{ counts["hmart.network_contacts"] ?? "—" }}</b>
              contacts</span
            >
          </div>
        </div>
      </div>

      <div class="flow-arrow" aria-hidden="true">→</div>

      <div class="flow-col">
        <p class="flow-cap">surface</p>
        <div v-for="s in surfaces" :key="s.name" class="chip">
          <span class="chip-name">{{ s.name }}</span>
          <span class="chip-note">{{ s.what }}</span>
        </div>
      </div>
    </section>

    <!-- Routines -->
    <section class="block">
      <h2 class="block-title">routines</h2>
      <p class="block-sub">
        what runs on its own, when, and exactly which tables it touches.
      </p>
      <div class="routines">
        <article v-for="r in routines" :key="r.id" class="routine">
          <div class="routine-head">
            <span class="routine-id">{{ r.id }}</span>
            <span class="routine-when">{{ r.when }}</span>
          </div>
          <p class="routine-where">{{ r.where }}</p>
          <p class="routine-note">{{ r.note }}</p>
          <div class="routine-io">
            <div>
              <span class="io-cap">reads</span>
              <span v-for="x in r.reads" :key="x" class="tag tag-read">{{
                x
              }}</span>
            </div>
            <div>
              <span class="io-cap">writes</span>
              <span v-for="x in r.writes" :key="x" class="tag tag-write">{{
                x
              }}</span>
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- Schemas -->
    <section class="block">
      <h2 class="block-title">the database</h2>
      <p class="block-sub">
        every schema, what it is for, and what lives in it.
      </p>
      <div class="schemas">
        <article v-for="sc in schemas" :key="sc.name" class="schema">
          <div class="schema-head">
            <span class="schema-dot" :style="{ background: sc.tint }" />
            <span class="schema-name">{{ sc.name }}</span>
          </div>
          <p class="schema-blurb">{{ sc.blurb }}</p>
          <ul class="schema-tables">
            <li v-for="t in sc.tables" :key="t.name">
              <span class="t-name">{{ t.name }}</span>
              <span v-if="countFor(sc.name, t.name)" class="t-count">{{
                countFor(sc.name, t.name)
              }}</span>
              <span class="t-note">{{ t.note }}</span>
            </li>
          </ul>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sysmap {
  padding: var(--s-5) var(--s-5) var(--s-7);
  max-width: 1180px;
}
.sysmap-head {
  margin-bottom: var(--s-5);
}
.sysmap-sub {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  color: var(--sl-400);
  text-transform: lowercase;
  margin-top: 2px;
}

/* spine */
.flow {
  display: grid;
  grid-template-columns: 1fr auto 1.35fr auto 1fr;
  gap: var(--s-3);
  align-items: start;
  padding: var(--s-4);
  border: 1px solid var(--sl-200);
  margin-bottom: var(--s-6);
}
.flow-cap,
.io-cap,
.block-sub {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sl-400);
}
.flow-cap {
  margin-bottom: var(--s-2);
}
.flow-arrow {
  align-self: center;
  color: var(--sl-300);
  font-size: 14px;
}
.chip {
  border: 1px solid var(--sl-200);
  padding: var(--s-2);
  margin-bottom: var(--s-2);
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.chip-name {
  font-size: 12px;
}
.chip-note {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  color: var(--sl-400);
}
.core {
  border: 2px solid #000;
  padding: var(--s-3);
}
.core-title {
  font-size: 13px;
  font-weight: 600;
}
.core-note {
  font-size: 11px;
  color: var(--sl-400);
  margin: 2px 0 var(--s-2);
  line-height: 1.35;
}
.core-stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  color: var(--sl-400);
}
.core-stats b {
  color: #000;
}

/* blocks */
.block {
  margin-bottom: var(--s-6);
}
.block-title {
  font-size: 14px;
  text-transform: lowercase;
  margin-bottom: 2px;
}
.block-sub {
  margin-bottom: var(--s-3);
  text-transform: none;
  letter-spacing: 0;
}

/* routines */
.routines {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--s-3);
}
.routine {
  border: 1px solid var(--sl-200);
  padding: var(--s-3);
}
.routine-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--s-2);
}
.routine-id {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  font-weight: 600;
}
.routine-when,
.routine-where {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  color: var(--sl-400);
}
.routine-note {
  font-size: 11px;
  line-height: 1.4;
  margin: var(--s-2) 0;
}
.routine-io > div {
  margin-top: var(--s-1);
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  align-items: center;
}
.tag {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 9px;
  padding: 1px 4px;
  border: 1px solid var(--sl-200);
}
.tag-write {
  border-color: #000;
}

/* schemas */
.schemas {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: var(--s-3);
}
.schema {
  border: 1px solid var(--sl-200);
  padding: var(--s-3);
}
.schema-head {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}
.schema-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.schema-name {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  font-weight: 600;
}
.schema-blurb {
  font-size: 11px;
  color: var(--sl-400);
  margin: 2px 0 var(--s-2);
  line-height: 1.35;
}
.schema-tables {
  list-style: none;
  padding: 0;
  margin: 0;
}
.schema-tables li {
  padding: 3px 0;
  border-top: 1px solid var(--sl-100, #f0f0f0);
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-1);
  align-items: baseline;
}
.t-name {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
}
.t-count {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 9px;
  color: #fff;
  background: #000;
  padding: 0 3px;
}
.t-note {
  font-size: 10px;
  color: var(--sl-400);
  flex: 1 1 100%;
  line-height: 1.3;
}

@media (max-width: 860px) {
  .flow {
    grid-template-columns: 1fr;
  }
  .flow-arrow {
    transform: rotate(90deg);
    justify-self: center;
  }
}
</style>
