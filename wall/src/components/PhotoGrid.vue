<script setup lang="ts">
import type { CompositePublicDTO } from "@direct-collage/shared";

defineProps<{
  composites: CompositePublicDTO[];
}>();
</script>

<template>
  <!--
    Responsive CSS Grid (PRD §6.3.3): 1 col mobile, 3 tablet, 5 large.
    Cells are square (aspect-ratio:1) to match the wall's 1:1 composites.
    For Phase 1 we render a plain grid; auto-scroll + hybrid reflow come in
    Phase 3 per the implementation plan.
  -->
  <div
    class="grid grid-cols-1 gap-2 p-2 sm:grid-cols-3 lg:grid-cols-5"
    aria-live="polite"
  >
    <div
      v-for="c in composites"
      :key="c.id"
      class="relative aspect-square overflow-hidden rounded bg-neutral-900"
    >
      <img
        :src="c.url"
        :alt="`Collage ${c.id}`"
        class="h-full w-full object-cover"
        loading="lazy"
      />
    </div>
  </div>
</template>
