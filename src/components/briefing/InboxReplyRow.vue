<script setup lang="ts">
import { ref } from "vue";
import type { InboxReply } from "../../types/briefing";

defineProps<{ reply: InboxReply }>();
defineEmits<{ skip: [id: string] }>();

const expanded = ref(false);
</script>

<template>
  <article :class="['d-brief-row', expanded && 'is-expanded']">
    <header class="d-brief-row-head" @click="expanded = !expanded">
      <span
        :class="[
          'd-brief-confidence',
          reply.confidence === 'known' && 'is-known',
          reply.confidence === 'warm' && 'is-warm',
          reply.confidence === 'starred' && 'is-starred',
        ]"
        >{{ reply.confidence }}</span
      >
      <span class="d-brief-recipient">{{
        reply.sender_name ?? reply.sender_email
      }}</span>
      <span v-if="reply.subject" class="d-brief-subject-line">{{
        reply.subject
      }}</span>
    </header>
    <p class="d-brief-snippet">{{ reply.snippet }}</p>
    <div v-if="expanded" class="d-brief-body">
      <pre class="d-brief-pre">{{ reply.drafted_body }}</pre>
      <div class="d-brief-actions">
        <a
          v-if="reply.gmail_draft_url"
          :href="reply.gmail_draft_url"
          target="_blank"
          rel="noopener noreferrer"
          class="d-brief-btn d-brief-btn-primary"
          >open in gmail</a
        >
        <button
          type="button"
          class="d-brief-btn d-brief-btn-text"
          @click="$emit('skip', reply.id)"
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
.d-brief-row-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  cursor: pointer;
}
.d-brief-confidence {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 1px 6px;
  border: 1px solid rgba(0, 0, 0, 0.85);
  color: rgba(0, 0, 0, 0.85);
}
.d-brief-confidence.is-known {
  background: #000000;
  color: #ffffff;
}
.d-brief-confidence.is-warm {
  background: #ffffff;
  color: rgba(0, 0, 0, 0.85);
}
.d-brief-confidence.is-starred {
  background: var(--acc-versus);
  border-color: var(--acc-versus);
  color: var(--acc-versus-text);
}
.d-brief-recipient {
  font-size: 0.875rem;
  color: rgba(0, 0, 0, 0.85);
  font-weight: 600;
}
.d-brief-subject-line {
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.5);
  font-style: italic;
}
.d-brief-snippet {
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.6);
  font-style: italic;
}
.d-brief-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
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
}
.d-brief-btn-primary {
  background: #000000;
  color: #ffffff;
}
.d-brief-btn-text {
  background: transparent;
  border-color: transparent;
  color: rgba(0, 0, 0, 0.5);
}
.d-brief-btn-text:hover {
  color: rgba(0, 0, 0, 0.85);
}
</style>
