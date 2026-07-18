<script setup lang="ts">
import type { AspectRatio, CompositePublicDTO } from "@direct-collage/shared";

const props = defineProps<{
  composite: CompositePublicDTO;
  /** Tailwind grid-span classes for positioning ("col-span-2 row-span-2" or ""). */
  spanClass: string;
  /** Wall aspect ratio — drives cell shape. All composites share this ratio. */
  ratio: AspectRatio;
  /** True if this is the newest photo — applies a persistent accent ring. */
  isNewest?: boolean;
}>();

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
    class="relative overflow-hidden rounded-lg bg-neutral-900 shadow-lg"
    :class="[spanClass, isNewest ? 'newest-photo' : '']"
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
