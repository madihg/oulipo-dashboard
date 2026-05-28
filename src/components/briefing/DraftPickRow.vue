<script setup lang="ts">
import { computed, ref } from "vue";
import type { DraftPick } from "../../types/briefing";

const props = defineProps<{ pick: DraftPick }>();
defineEmits<{
  markSent: [id: string];
  skip: [id: string];
}>();

const expanded = ref(false);

const priorityAccent = computed(() => {
  switch (props.pick.priority) {
    case "P0":
      return "var(--acc-carnation)";
    case "P1":
      return "var(--acc-hard)";
    case "P2":
      return "var(--acc-reverse)";
    default:
      return "rgba(0,0,0,0.3)";
  }
});

const channelLabel = computed(() => {
  switch (props.pick.recipient_channel) {
    case "gmail":
      return "gmail";
    case "instagram":
      return "ig";
    case "linkedin":
      return "linkedin";
    case "imessage":
      return "imessage";
    default:
      return "other";
  }
});
</script>

<template>
  <article
    :class="[
      'd-brief-row',
      expanded && 'is-expanded',
      pick.marked_sent_at && 'is-sent',
    ]"
  >
    <header class="d-brief-row-head" @click="expanded = !expanded">
      <span class="d-brief-priority" :style="{ color: priorityAccent }">{{
        pick.priority
      }}</span>
      <span class="d-brief-category">{{ pick.category }}</span>
      <span class="d-brief-recipient">{{ pick.recipient_name }}</span>
      <span v-if="pick.recipient_email" class="d-brief-email">{{
        pick.recipient_email
      }}</span>
      <span class="d-brief-channel">{{ channelLabel }}</span>
    </header>
    <p class="d-brief-hook">
      <span class="d-brief-why">{{ pick.why_today }}</span>
      <span v-if="pick.hook"> · {{ pick.hook }}</span>
    </p>
    <div v-if="expanded" class="d-brief-body">
      <p v-if="pick.subject" class="d-brief-subject">
        <span class="d-brief-label">subject</span> {{ pick.subject }}
      </p>
      <pre class="d-brief-pre">{{ pick.body }}</pre>
      <div class="d-brief-actions">
        <a
          v-if="pick.gmail_draft_url"
          :href="pick.gmail_draft_url"
          target="_blank"
          rel="noopener noreferrer"
          class="d-brief-btn d-brief-btn-primary"
          >open in gmail</a
        >
        <button
          v-if="!pick.marked_sent_at"
          type="button"
          class="d-brief-btn"
          @click="$emit('markSent', pick.id)"
        >
          mark sent
        </button>
        <span v-else class="d-brief-sent-tag">sent</span>
        <button
          type="button"
          class="d-brief-btn d-brief-btn-text"
          @click="$emit('skip', pick.id)"
        >
          skip
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.d-brief-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}
.d-brief-row.is-sent {
  opacity: 0.5;
}
.d-brief-row-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  cursor: pointer;
}
.d-brief-priority {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.06em;
}
.d-brief-category {
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
.d-brief-email {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.6875rem;
  color: rgba(0, 0, 0, 0.5);
}
.d-brief-channel {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(0, 0, 0, 0.5);
  margin-left: auto;
}
.d-brief-hook {
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.6);
  padding-left: 0;
}
.d-brief-why {
  color: rgba(0, 0, 0, 0.85);
}
.d-brief-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
}
.d-brief-subject {
  font-size: 0.8125rem;
  color: rgba(0, 0, 0, 0.85);
}
.d-brief-label {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(0, 0, 0, 0.5);
  margin-right: 6px;
}
.d-brief-pre {
  font-family: inherit;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: rgba(0, 0, 0, 0.85);
  white-space: pre-wrap;
  margin: 0;
  padding: 8px;
  border: 1px solid rgba(0, 0, 0, 0.12);
}
.d-brief-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.d-brief-btn {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(0, 0, 0, 0.85);
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.85);
  padding: 4px 10px;
  border-radius: 2px;
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
}
.d-brief-btn:hover {
  background: rgba(0, 0, 0, 0.04);
}
.d-brief-btn-primary {
  background: #000000;
  color: #ffffff;
}
.d-brief-btn-primary:hover {
  background: rgba(0, 0, 0, 0.85);
}
.d-brief-btn-text {
  background: transparent;
  border-color: transparent;
  color: rgba(0, 0, 0, 0.5);
}
.d-brief-btn-text:hover {
  color: rgba(0, 0, 0, 0.85);
}
.d-brief-sent-tag {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--acc-reinforcement-text);
}
</style>
