<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { AspectRatio, CompositePublicDTO } from "@direct-collage/shared";
import { useAutoScroll } from "../composables/useAutoScroll.js";

const props = defineProps<{
  composites: CompositePublicDTO[];
  ratio: AspectRatio;
  scrollSpeed: number;
}>();

/**
 * SCATTERED POLAROIDS — flex-wrap row layout + queue model + seamless loop.
 *
 * LAYOUT: flex-wrap (row direction). Photos flow left-to-right, wrapping to
 * the next row. Like laying out physical photos on a table.
 *
 * SCROLL: duplicated list + useAutoScroll for a seamless loop (same engine
 * as ScrollingGrid). No visible reset — when the scroll reaches one full copy,
 * it snaps back invisibly because copy 2 is identical to copy 1.
 *
 * NEW PHOTOS (Option A queue + Option D bottom-append):
 * 1. SSE delivers → goes into pendingNew queue
 * 2. Every ~5s, appended to the END of displayList (bottom of the pile)
 * 3. Fades in at the bottom; the downward scroll reveals it naturally
 *
 * ORDER: oldest at top, newest at bottom (chronological top→bottom).
 */

const displayList = ref<CompositePublicDTO[]>([]);
const pendingNew = ref<CompositePublicDTO[]>([]);

const INSERT_INTERVAL_MS = 5000;
let insertTimer: ReturnType<typeof setInterval> | null = null;

/** Initialize: reverse so OLDEST is at top (index 0), NEWEST at bottom. */
function initDisplay() {
  displayList.value = [...props.composites].reverse();
  pendingNew.value = [];
}

/** Append one pending photo to the END (bottom of the pile). */
function insertPending() {
  if (pendingNew.value.length === 0) return;
  const photo = pendingNew.value.shift()!;
  displayList.value = [...displayList.value, photo];
}

// --- Scroll refs ---
const containerRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);

const speedRef = computed(() => props.scrollSpeed);
const enabledRef = computed(() => displayList.value.length > 4);

const { isScrolling } = useAutoScroll({
  containerRef,
  contentRef,
  speed: speedRef,
  enabled: enabledRef,
});

onMounted(() => {
  initDisplay();
  insertTimer = setInterval(insertPending, INSERT_INTERVAL_MS);
});

onUnmounted(() => {
  if (insertTimer) clearInterval(insertTimer);
});

// --- New photo detection (via knownIds set, immune to maxPhotos capping) ---
const knownIds = ref<Set<string>>(new Set());

watch(
  () => props.composites,
  (newComposites) => {
    if (newComposites.length === 0) return;

    if (knownIds.value.size === 0) {
      // First load — track ids, don't queue.
      knownIds.value = new Set(newComposites.map((c) => c.id));
      return;
    }

    const fresh = newComposites.filter((c) => !knownIds.value.has(c.id));
    knownIds.value = new Set(newComposites.map((c) => c.id));

    if (fresh.length === 0) return;

    if (fresh.length <= 3) {
      // Normal SSE push(s) → queue them (FIFO — oldest of the batch first).
      pendingNew.value = [...pendingNew.value, ...fresh.reverse()];
    } else {
      // Reconnect re-fetch → rebuild.
      displayList.value = [...newComposites].reverse();
      pendingNew.value = [];
    }
  },
  { deep: false },
);

/**
 * Deterministic rotation per index.
 * Formula: ((index * 37) % 16) - 8 → range [-8, +7] degrees.
 */
function rotationFor(index: number): number {
  return ((index * 37) % 16) - 8;
}

/**
 * Duplicated render list for the seamless scroll loop. Keys are suffixed
 * with copy index (0 or 1) for uniqueness.
 */
const renderList = computed(() => {
  const items = displayList.value;
  if (items.length === 0) return [];
  const halfLen = items.length;
  return [...items, ...items].map((c, i) => ({
    key: `${c.id}-${i < halfLen ? 0 : 1}`,
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
      <!--
        flex-wrap: photos flow left-to-right (row direction), wrapping to the
        next row. This is the natural reading direction and avoids the CSS
        column issue where content flows vertically across columns.
      -->
      <div class="flex flex-wrap justify-center gap-4 px-4 py-2" aria-live="polite">
        <div
          v-for="item in renderList"
          :key="item.key"
          class="polaroid inline-block bg-white p-2 pb-8"
          :style="{ transform: `rotate(${item.rotation}deg)` }"
        >
          <img
            :src="item.composite.url"
            :alt="`Collage ${item.composite.id}`"
            class="block h-32 w-32 object-cover sm:h-40 sm:w-40 lg:h-44 lg:w-44"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.polaroid {
  box-shadow:
    0 4px 6px rgba(0, 0, 0, 0.3),
    0 1px 3px rgba(0, 0, 0, 0.4);
  /* Fade-in: plays once on element creation. Only animates opacity. */
  animation: polaroid-enter 0.6s ease;
}

@keyframes polaroid-enter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
