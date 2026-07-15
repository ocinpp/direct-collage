<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { AspectRatio, CompositePublicDTO } from "@direct-collage/shared";
import { useAutoScroll } from "../composables/useAutoScroll.js";

const props = defineProps<{
  composites: CompositePublicDTO[];
  ratio: AspectRatio;
  scrollSpeed: number;
}>();

// --- DOM refs for auto-scroll ---
const containerRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);

const speedRef = computed(() => props.scrollSpeed);
const enabledRef = computed(() => props.composites.length > 4);

const { isScrolling, pause } = useAutoScroll({
  containerRef,
  contentRef,
  speed: speedRef,
  enabled: enabledRef,
});

// Pause on new photo
watch(
  () => props.composites.length,
  (n, o) => {
    if (n > (o ?? 0)) pause(600);
  },
);

/**
 * Deterministic rotation per index — not random, so the duplicated list loop
 * is seamless (item N and N+len have the same rotation).
 * Formula: ((index * 37) % 16) - 8  →  range [-8, +7] degrees
 */
function rotationFor(index: number): number {
  return ((index * 37) % 16) - 8;
}

/**
 * Duplicate the list for the seamless auto-scroll loop (same pattern as the
 * scrolling grid). Keys are suffixed with copy index for uniqueness.
 */
const renderList = computed(() => {
  const items = props.composites;
  if (items.length === 0) return [];
  return [...items, ...items].map((c, i) => ({
    key: `${c.id}-${Math.floor(i / items.length)}`,
    composite: c,
    rotation: rotationFor(i),
  }));
});
</script>

<template>
  <div
    ref="containerRef"
    class="h-full overflow-hidden"
    :class="!isScrolling ? 'flex items-center justify-center p-4' : ''"
  >
    <div ref="contentRef" :class="!isScrolling ? 'w-full max-w-5xl' : ''">
      <TransitionGroup
        name="polaroid"
        tag="div"
        class="polaroid-columns gap-4 px-4 py-2"
        aria-live="polite"
      >
        <div
          v-for="item in renderList"
          :key="item.key"
          class="polaroid mb-4 inline-block bg-white p-2 pb-8"
          :style="{ transform: `rotate(${item.rotation}deg)` }"
        >
          <img
            :src="item.composite.url"
            :alt="`Collage ${item.composite.id}`"
            class="block h-32 w-32 object-cover sm:h-40 sm:w-40 lg:h-44 lg:w-44"
            loading="lazy"
          />
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
/* CSS columns layout — polaroids flow into natural masonry columns */
.polaroid-columns {
  column-count: 2;
  column-gap: 1rem;
}
@media (min-width: 640px) {
  .polaroid-columns {
    column-count: 3;
  }
}
@media (min-width: 1024px) {
  .polaroid-columns {
    column-count: 5;
  }
}

.polaroid {
  /* break-inside: avoid keeps each polaroid intact within a column */
  break-inside: avoid;
  box-shadow:
    0 4px 6px rgba(0, 0, 0, 0.3),
    0 1px 3px rgba(0, 0, 0, 0.4);
  transition: transform 0.2s ease;
}

/* FLIP transition for new polaroids entering */
.polaroid-move {
  transition: transform 0.4s ease;
}
.polaroid-enter-active {
  transition: opacity 0.4s ease;
}
.polaroid-enter-from {
  opacity: 0;
}
.polaroid-leave-active {
  transition: opacity 0.3s ease;
}
</style>
