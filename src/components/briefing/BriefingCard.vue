<script setup lang="ts">
import { computed } from "vue";
import type { NetworkBriefing } from "../../types/briefing";
import BriefingSection from "./BriefingSection.vue";
import BriefingFooter from "./BriefingFooter.vue";
import DraftPickRow from "./DraftPickRow.vue";
import InboxReplyRow from "./InboxReplyRow.vue";
import NewContactRow from "./NewContactRow.vue";

const props = defineProps<{
  briefing: NetworkBriefing;
  refreshing: boolean;
}>();
defineEmits<{
  refresh: [];
  markSent: [id: string];
  skipPick: [id: string];
  skipReply: [id: string];
  addContact: [thread_id: string];
  dismissContact: [thread_id: string];
}>();

const repliesTotal = computed(
  () =>
    props.briefing.inbox_replies.known.length +
    props.briefing.inbox_replies.warm.length,
);

const replySubtitle = computed(() => {
  const k = props.briefing.inbox_replies.known.length;
  const w = props.briefing.inbox_replies.warm.length;
  const parts: string[] = [];
  if (k) parts.push(`${k} known`);
  if (w) parts.push(`${w} warm`);
  return parts.join(" · ") || null;
});
</script>

<template>
  <section class="d-brief-card">
    <BriefingSection
      title="today's picks"
      :count="briefing.todays_picks.length"
      :default-open="true"
    >
      <DraftPickRow
        v-for="p in briefing.todays_picks"
        :key="p.id"
        :pick="p"
        @mark-sent="(id) => $emit('markSent', id)"
        @skip="(id) => $emit('skipPick', id)"
      />
    </BriefingSection>

    <BriefingSection
      title="inbox replies"
      :count="repliesTotal"
      :subtitle="replySubtitle"
      :default-open="true"
    >
      <template v-if="briefing.inbox_replies.known.length">
        <p class="d-brief-subheading">known contacts</p>
        <InboxReplyRow
          v-for="r in briefing.inbox_replies.known"
          :key="r.id"
          :reply="r"
          @skip="(id) => $emit('skipReply', id)"
        />
      </template>
      <template v-if="briefing.inbox_replies.warm.length">
        <p class="d-brief-subheading">warm signals</p>
        <InboxReplyRow
          v-for="r in briefing.inbox_replies.warm"
          :key="r.id"
          :reply="r"
          @skip="(id) => $emit('skipReply', id)"
        />
      </template>
    </BriefingSection>

    <BriefingSection
      title="new from inbox"
      :count="briefing.new_from_inbox.length"
      :default-open="true"
    >
      <NewContactRow
        v-for="c in briefing.new_from_inbox"
        :key="c.thread_id"
        :candidate="c"
        @add="(id) => $emit('addContact', id)"
        @dismiss="(id) => $emit('dismissContact', id)"
      />
    </BriefingSection>

    <BriefingSection
      title="maintenance due"
      :count="briefing.maintenance_due.length"
    >
      <article
        v-for="m in briefing.maintenance_due"
        :key="m.contact_id"
        class="d-brief-row"
      >
        <header class="d-brief-row-head">
          <span class="d-brief-tier">tier {{ m.tier }}</span>
          <span class="d-brief-recipient">{{ m.recipient_name }}</span>
        </header>
        <p class="d-brief-why">{{ m.why_due }}</p>
      </article>
    </BriefingSection>

    <BriefingSection
      title="recently sent"
      :count="briefing.recently_sent.length"
    >
      <article
        v-for="s in briefing.recently_sent"
        :key="`${s.contact_id}-${s.sent_at}`"
        class="d-brief-row"
      >
        <header class="d-brief-row-head">
          <span class="d-brief-recipient">{{ s.recipient_name }}</span>
          <span class="d-brief-when">{{ s.sent_at }}</span>
        </header>
        <p v-if="s.subject" class="d-brief-why">{{ s.subject }}</p>
        <p v-if="s.outcome" class="d-brief-outcome">{{ s.outcome }}</p>
      </article>
    </BriefingSection>

    <BriefingSection title="carried over" :count="briefing.carried_over.length">
      <article
        v-for="(p, i) in briefing.carried_over"
        :key="i"
        class="d-brief-row"
      >
        <header class="d-brief-row-head">
          <span class="d-brief-recipient">{{ p.recipient_name }}</span>
        </header>
        <p class="d-brief-why">{{ p.reason }}</p>
        <p v-if="p.unblocks_when" class="d-brief-outcome">
          unblocks: {{ p.unblocks_when }}
        </p>
      </article>
    </BriefingSection>

    <BriefingFooter
      :footer="briefing.footer"
      :refreshing="refreshing"
      @refresh="$emit('refresh')"
    />
  </section>
</template>

<style scoped>
.d-brief-card {
  display: flex;
  flex-direction: column;
  margin-bottom: 1rem;
}
.d-brief-subheading {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(0, 0, 0, 0.5);
  padding: 6px 0 2px 0;
}
.d-brief-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}
.d-brief-row-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}
.d-brief-tier {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(0, 0, 0, 0.5);
}
.d-brief-recipient {
  font-size: 0.875rem;
  color: rgba(0, 0, 0, 0.85);
  font-weight: 600;
}
.d-brief-when {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(0, 0, 0, 0.5);
  margin-left: auto;
}
.d-brief-why {
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.6);
}
.d-brief-outcome {
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.6);
  font-style: italic;
}
</style>
