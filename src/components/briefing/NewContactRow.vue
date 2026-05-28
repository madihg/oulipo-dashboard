<script setup lang="ts">
import type { NewContact } from "../../types/briefing";

defineProps<{ candidate: NewContact }>();
defineEmits<{
  add: [thread_id: string];
  dismiss: [thread_id: string];
}>();
</script>

<template>
  <article class="d-brief-row">
    <header class="d-brief-row-head">
      <span class="d-brief-recipient">{{
        candidate.sender_name ?? candidate.sender_email
      }}</span>
      <span class="d-brief-email">{{ candidate.sender_email }}</span>
      <span class="d-brief-proposal"
        >proposed: {{ candidate.proposed_category }} · tier
        {{ candidate.proposed_tier }}</span
      >
    </header>
    <p class="d-brief-context">{{ candidate.context }}</p>
    <div class="d-brief-actions">
      <button
        type="button"
        class="d-brief-btn d-brief-btn-primary"
        @click="$emit('add', candidate.thread_id)"
      >
        add to crm
      </button>
      <button
        type="button"
        class="d-brief-btn d-brief-btn-text"
        @click="$emit('dismiss', candidate.thread_id)"
      >
        dismiss
      </button>
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
.d-brief-proposal {
  font-family:
    "JetBrains Mono", "Diatype Mono Variable", ui-monospace, monospace;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(0, 0, 0, 0.5);
  margin-left: auto;
}
.d-brief-context {
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.6);
  font-style: italic;
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
