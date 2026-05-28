<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <section>
    <h2 class="font-title text-section lowercase">{{ title }}</h2>
    <p
      class="mt-s-2 font-mono uppercase tracking-tracked text-caption text-text-tertiary"
    >
      placeholder - lands in a later user story
    </p>
  </section>
</template>
