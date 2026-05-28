<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { supabase } from "../lib/supabase";

const props = defineProps<{ todoId: string }>();

type Rule =
  | {
      type: "every";
      interval: "day" | "week" | "month" | "year";
      count: number;
    }
  | { type: "after_completion"; delay_days: number };

const ruleId = ref<string | null>(null);
const mode = ref<"none" | "every" | "after">("none");
const interval = ref<"day" | "week" | "month" | "year">("week");
const count = ref(1);
const delayDays = ref(7);
const nextFireAt = ref<string | null>(null);

async function load() {
  await supabase.auth.getSession();
  const { data } = await supabase
    .from("repeating_rules")
    .select("*")
    .eq("todo_id", props.todoId)
    .maybeSingle();
  if (data) {
    ruleId.value = data.id as string;
    nextFireAt.value = data.next_fire_at as string | null;
    const r = data.rule as Rule;
    if (r.type === "every") {
      mode.value = "every";
      interval.value = r.interval;
      count.value = r.count;
    } else if (r.type === "after_completion") {
      mode.value = "after";
      delayDays.value = r.delay_days;
    }
  } else {
    ruleId.value = null;
    mode.value = "none";
    nextFireAt.value = null;
  }
}

watch(
  () => props.todoId,
  () => void load(),
);
onMounted(() => void load());

function buildRule(): Rule | null {
  if (mode.value === "every")
    return { type: "every", interval: interval.value, count: count.value };
  if (mode.value === "after")
    return { type: "after_completion", delay_days: delayDays.value };
  return null;
}

function computeNextFire(rule: Rule): string {
  const now = new Date();
  if (rule.type === "every") {
    const n = Math.max(1, rule.count);
    if (rule.interval === "day") now.setUTCDate(now.getUTCDate() + n);
    else if (rule.interval === "week") now.setUTCDate(now.getUTCDate() + 7 * n);
    else if (rule.interval === "month") now.setUTCMonth(now.getUTCMonth() + n);
    else now.setUTCFullYear(now.getUTCFullYear() + n);
  }
  // after_completion: no scheduled fire until completed; trigger handles it.
  return now.toISOString();
}

async function save() {
  const rule = buildRule();
  if (!rule) {
    if (ruleId.value) {
      await supabase.from("repeating_rules").delete().eq("id", ruleId.value);
      ruleId.value = null;
      nextFireAt.value = null;
    }
    return;
  }
  const next = rule.type === "every" ? computeNextFire(rule) : null;
  if (ruleId.value) {
    await supabase
      .from("repeating_rules")
      .update({ rule, next_fire_at: next } as never)
      .eq("id", ruleId.value);
  } else {
    const { data } = await supabase
      .from("repeating_rules")
      .insert({
        todo_id: props.todoId,
        rule,
        next_fire_at: next,
      } as never)
      .select()
      .single();
    if (data) ruleId.value = data.id as string;
  }
  nextFireAt.value = next;
}
</script>

<template>
  <div class="mt-s-4">
    <p
      class="font-mono uppercase tracking-tracked text-meta text-text-tertiary mb-s-2"
    >
      repeat
    </p>
    <div class="flex flex-wrap items-center gap-s-3 text-base">
      <select
        v-model="mode"
        class="bg-transparent border-b border-border-light"
        @change="save"
      >
        <option value="none">no</option>
        <option value="every">every</option>
        <option value="after">after completion</option>
      </select>
      <template v-if="mode === 'every'">
        <input
          v-model.number="count"
          type="number"
          min="1"
          class="bg-transparent border-b border-border-light w-12 text-center"
          @change="save"
        />
        <select
          v-model="interval"
          class="bg-transparent border-b border-border-light"
          @change="save"
        >
          <option value="day">day</option>
          <option value="week">week</option>
          <option value="month">month</option>
          <option value="year">year</option>
        </select>
      </template>
      <template v-if="mode === 'after'">
        <input
          v-model.number="delayDays"
          type="number"
          min="1"
          class="bg-transparent border-b border-border-light w-12 text-center"
          @change="save"
        />
        <span
          class="font-mono uppercase tracking-tracked text-meta text-text-tertiary"
          >days after done</span
        >
      </template>
      <span
        v-if="nextFireAt"
        class="font-mono uppercase tracking-tracked text-meta text-text-tertiary"
      >
        next: {{ new Date(nextFireAt).toLocaleDateString() }}
      </span>
    </div>
  </div>
</template>
