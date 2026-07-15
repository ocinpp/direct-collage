<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { AspectRatio, CompositePublicDTO } from "@direct-collage/shared";
import PhotoCell from "./PhotoCell.vue";
import { spanForIndex, spanClassForIndex, padForLoop } from "../composables/useMasonrySpans.js";
import { useAutoScroll } from "../composables/useAutoScroll.js";

const props = defineProps<{
  composites: CompositePublicDTO[];
  ratio: AspectRatio;
  scrollSpeed: number;
}>();

// --- DOM refs for the auto-scroll engine ---
const containerRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);

const speedRef = computed(() => props.scrollSpeed);
const enabledRef = computed(() => props.composites.length > 4);

const { isScrolling, resetToTop } = useAutoScroll({
  containerRef,
  contentRef,
  speed: speedRef,
  enabled: enabledRef,
});

// When a new composite arrives via SSE, reset scroll to top so the new photo
// (which lands at position 0 = the hero slot) is visible. The 1.5s pause gives
// the FLIP animation + highlight pulse time to play before scrolling resumes.
watch(
  () => props.composites.length,
  (newLen, oldLen) => {
    if (newLen > (oldLen ?? 0)) resetToTop(1500);
  },
);

// --- Detect responsive column count for hero positioning ---
// Tailwind breakpoints: <640=1col, ≥640(sm)=3col, ≥1024(lg)=5col.
// We need this to compute grid-column-start for hero cells so they spiral
// through different columns instead of always landing at column 1.
const numCols = ref(1);

function detectCols() {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(min-width: 1024px)").matches) numCols.value = 5;
  else if (window.matchMedia("(min-width: 640px)").matches) numCols.value = 3;
  else numCols.value = 1;
}

let mediaListeners: Array<() => void> = [];

onMounted(() => {
  detectCols();
  const queries = [
    window.matchMedia("(min-width: 640px)"),
    window.matchMedia("(min-width: 1024px)"),
  ];
  for (const q of queries) {
    const handler = () => detectCols();
    q.addEventListener("change", handler);
    mediaListeners.push(() => q.removeEventListener("change", handler));
  }
});

onUnmounted(() => mediaListeners.forEach((fn) => fn()));

/**
 * Compute grid-column-start for hero cells so they appear in different
 * columns as you scroll down. Each hero (every 7th item) gets a start column
 * that cycles through the available columns, accounting for the 2-col span.
 *
 * At 5 cols: heroes land at cols 1,3,2,4,1,3,2,4... (shifting right, wrapping)
 * At 3 cols: heroes land at cols 1,2,1,2... (alternating)
 */
function gridColumnStart(index: number): number | undefined {
  if (spanForIndex(index) !== "hero") return undefined;
  const cols = numCols.value;
  if (cols < 3) return undefined; // 1-col: hero fills, no positioning needed
  // Which hero number is this (0-based)?
  const heroNum = Math.floor(index / 7);
  // Max start column so a 2-wide hero fits: cols - 1 (1-indexed)
  const maxStart = Math.max(1, cols - 1);
  // Cycle through 1..maxStart
  return (heroNum % maxStart) + 1;
}

const renderList = computed(() => {
  const duplicated = padForLoop(props.composites);
  // The duplicated list is [..items, ..items]. Copy index = 0 (first half) or
  // 1 (second half). Keys are `id-copyIndex` so TransitionGroup can track items
  // across re-renders for FLIP animation. When a new photo is prepended, only
  // its key is new; existing items keep their keys.
  const originalLen = props.composites.length;
  return duplicated.map((c, i) => ({
    key: `${c.id}-${i < originalLen ? 0 : 1}`,
    composite: c,
    spanClass: spanClassForIndex(i),
    colStart: gridColumnStart(i),
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
          :style="item.colStart ? { gridColumnStart: item.colStart } : undefined"
        />
      </TransitionGroup>
    </div>
  </div>
</template>
