<script setup lang="ts">
import type { AspectRatio, CompositePublicDTO } from "@direct-collage/shared";

const props = defineProps<{
  composite: CompositePublicDTO;
  /** Tailwind grid-span classes for positioning ("col-span-2 row-span-2" or ""). */
  spanClass: string;
  /** Wall aspect ratio — drives cell shape. All composites share this ratio. */
  ratio: AspectRatio;
}>();

/**
 * CSS aspect-ratio for the wall's configured ratio. Applied to ALL cells —
 * including the 2×2 hero — because the spans are chosen to preserve the
 * ratio: a 2×2 span of square cells is still square (2 col-widths wide,
 * 2 row-heights tall, where row-height = col-width via the aspect-ratio).
 */
const cellAspect = (() => {
  switch (props.ratio) {
    case "1:1":
      return "1 / 1";
    case "4:5":
      return "4 / 5";
    case "9:16":
      return "9 / 16";
  }
})();
</script>

<template>
  <div
    class="relative overflow-hidden bg-neutral-900"
    :class="spanClass"
    :style="{ aspectRatio: cellAspect }"
  >
    <img
      :src="composite.url"
      :alt="`Collage ${composite.id}`"
      class="h-full w-full object-cover"
      loading="lazy"
    />
  </div>
</template>
