<script setup lang="ts">
import type { ArtifactLink, ArtifactKind } from "../types/artifacts";

/**
 * Attachment-style chips for a todo's deliverable links (metadata.artifacts) -
 * the email-attachment idiom: icon, title, kind, click to open. Rendered at
 * the top of notes in TodoEditor so the Google Doc/Sheet that IS the task's
 * artifact is one click away.
 */
defineProps<{ artifacts: ArtifactLink[] }>();

const KIND_LABEL: Record<ArtifactKind, string> = {
  doc: "google doc",
  sheet: "google sheet",
  slides: "google slides",
  folder: "drive folder",
  link: "link",
};
</script>

<template>
  <div class="af-row">
    <a
      v-for="a in artifacts"
      :key="a.url"
      class="af-chip interactive"
      :href="a.url"
      target="_blank"
      rel="noopener noreferrer"
      :title="a.url"
    >
      <span
        class="af-ico"
        :class="`af-ico-${a.kind ?? 'link'}`"
        aria-hidden="true"
      >
        <svg
          v-if="a.kind === 'sheet'"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
        >
          <rect x="2.5" y="2" width="11" height="12" rx="1" />
          <path d="M2.5 6.5h11M2.5 10h11M8 6.5V14" />
        </svg>
        <svg
          v-else-if="a.kind === 'slides'"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
        >
          <rect x="2" y="3" width="12" height="10" rx="1" />
          <rect x="5" y="6" width="6" height="4" />
        </svg>
        <svg
          v-else-if="a.kind === 'folder'"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
        >
          <path
            d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 2h4.5A1.5 1.5 0 0 1 14 6.5v5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7z"
          />
        </svg>
        <svg
          v-else
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
        >
          <path d="M4 2h5.5L13 5.5V14H4V2z" />
          <path d="M9.5 2v3.5H13M6 8.5h4M6 11h4" />
        </svg>
      </span>
      <span class="af-text">
        <span class="af-title">{{ a.title }}</span>
        <span class="af-kind">{{ KIND_LABEL[a.kind ?? "link"] }}</span>
      </span>
      <span class="af-open" aria-hidden="true">
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
        >
          <path d="M6 3h7v7M13 3 7 9" />
          <path d="M11 9.5V13H3V5h3.5" />
        </svg>
      </span>
    </a>
  </div>
</template>

<style scoped>
.af-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.af-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 300px;
  min-width: 0;
  padding: 6px 10px;
  background: #ffffff;
  border: 1px solid var(--sl-200);
  border-radius: 2px;
  text-decoration: none;
  transition:
    background 120ms ease,
    border-color 120ms ease;
}
.af-chip:hover {
  background: var(--sl-100);
  border-color: var(--sl-300);
}
.af-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 2px;
  flex-shrink: 0;
}
.af-ico svg {
  width: 15px;
  height: 15px;
}
.af-ico-doc,
.af-ico-link {
  color: var(--acc-carnation-text);
  background: var(--cobalt-tint);
}
.af-ico-sheet {
  color: var(--acc-reinforcement-text);
  background: rgba(30, 142, 90, 0.1);
}
.af-ico-slides {
  color: var(--acc-hard-text);
  background: rgba(232, 155, 27, 0.12);
}
.af-ico-folder {
  color: var(--sl-600);
  background: var(--sl-100);
}
.af-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.af-title {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--sl-900);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.af-kind {
  font-family:
    "Diatype Mono Variable", "JetBrains Mono", ui-monospace, monospace;
  font-variation-settings: "MONO" 1;
  font-size: 0.5625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sl-400);
}
.af-open {
  color: var(--sl-300);
  flex-shrink: 0;
  display: inline-flex;
}
.af-open svg {
  width: 12px;
  height: 12px;
}
.af-chip:hover .af-open {
  color: var(--sl-600);
}
@media (pointer: coarse) {
  .af-chip {
    min-height: var(--touch-target);
  }
}
</style>
