<script setup lang="ts">
import { computed } from "vue";
import type { AspectRatio, CompositePublicDTO } from "@direct-collage/shared";
import PhotoCell from "./PhotoCell.vue";
import { spanClassForIndex, padForLoop } from "../composables/useMasonrySpans.js";

const props = defineProps<{
  composites: CompositePublicDTO[];
  ratio: AspectRatio;
}>();

/**
 * The render list: items padded to a multiple of 10 (so the masonry pattern
 * tiles perfectly), then duplicated for the seamless auto-scroll loop. Copy 1
 * and copy 2 are visually identical, so snapping the scroll offset back to 0
 * after scrolling one full copy is invisible.
 *
 * The TransitionGroup keys are suffixed with the copy index to keep them
 * unique across the two copies (otherwise Vue can't distinguish them).
 */
const renderList = computed(() => {
  const padded = padForLoop(props.composites);
  return padded.map((c, i) => ({
    key: `${c.id}-${Math.floor(i / props.composites.length)}`,
    composite: c,
    spanClass: spanClassForIndex(i),
  }));
});
</script>

<template>
  <!--
    Masonry grid: grid-auto-flow: dense packs the variable spans (hero 2×2,
    tall 1×2, wide 2×1, normal 1×1) without leaving gaps. The pattern repeats
    every 10 items (see useMasonrySpans), so copy 1 and copy 2 align exactly.

    TransitionGroup enables Vue's built-in FLIP: when a new photo is prepended,
    the new cell enters with a transition and existing cells animate to their
    new grid positions. The `cell` transition classes are defined in style.css.
  -->
  <TransitionGroup
    name="cell"
    tag="div"
    class="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-5"
    style="grid-auto-flow: dense"
    aria-live="polite"
  >
    <PhotoCell
      v-for="item in renderList"
      :key="item.key"
      :composite="item.composite"
      :span-class="item.spanClass"
      :ratio="ratio"
    />
  </TransitionGroup>
</template>
