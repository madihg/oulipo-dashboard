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
      <span class="af-ico" aria-hidden="true">
        <svg
          v-if="a.kind === 'sheet'"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <rect x="2.5" y="2" width="11" height="12" rx="1" />
          <path d="M2.5 6.5h11M2.5 10h11M8 6.5V14" />
        </svg>
        <svg
          v-else-if="a.kind === 'slides'"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <rect x="2" y="3" width="12" height="10" rx="1" />
          <rect x="5" y="6" width="6" height="4" />
        </svg>
        <svg
          v-else-if="a.kind === 'folder'"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
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
          stroke-width="1.5"
        >
          <path d="M4 2h5.5L13 5.5V14H4V2z" />
          <path d="M9.5 2v3.5H13M6 8.5h4M6 11h4" />
        </svg>
      </span>
      <span class="af-text">
        <span class="af-title">{{ a.title }}</span>
        <span class="cap">{{ KIND_LABEL[a.kind ?? "link"] }}</span>
      </span>
      <span class="af-open" aria-hidden="true">
        <svg
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path d="M4.5 2H10v5.5M10 2 5 7" />
          <path d="M8 7.5V10H2V4h2.5" />
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
  background: var(--paper);
  border: 1px solid var(--hair);
  border-radius: 2px;
  text-decoration: none;
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}
.af-chip:hover {
  background: var(--ground-2);
  border-color: var(--metal);
}
/* Kind icons are 1.5px monolines on ink; the kind is named in the caption
   below the title, never by a tinted fill. */
.af-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  color: var(--ink-70);
}
.af-ico svg {
  width: 16px;
  height: 16px;
}
.af-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.af-title {
  font-size: var(--fs-small);
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.af-open {
  color: var(--ink-40);
  flex-shrink: 0;
  display: inline-flex;
  transition: color var(--dur-fast) var(--ease-out);
}
.af-open svg {
  width: 12px;
  height: 12px;
}
.af-chip:hover .af-open {
  color: var(--ink-70);
}
@media (pointer: coarse) {
  .af-chip {
    min-height: var(--touch-target);
  }
}
</style>
