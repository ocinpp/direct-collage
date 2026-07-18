<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { AspectRatio, CompositePublicDTO } from "@direct-collage/shared";

const props = defineProps<{
  composites: CompositePublicDTO[];
  ratio: AspectRatio;
  scrollSpeed: number;
  gridStyle?: string;
}>();

/**
 * "NOW PLAYING / UP NEXT" queue model — internal state machine.
 *
 * Decoupled from props.composites (which is just the incoming feed). The
 * internal state (featured / queue / shown) is managed independently so that
 * when a new photo arrives, ONLY the featured photo changes — the queue and
 * recently-shown lists stay in place (no visual reset).
 *
 *   featured  → the big photo currently displayed
 *   queue     → ordered list of photos waiting to be featured (front = next)
 *   shown     → photos that have already been featured this cycle (most recent first)
 *
 * Cycle (every ~4s):
 *   featured → shown (prepend)
 *   queue.shift() → featured
 *   if queue empty: refill from all composites (reshuffle shown → queue)
 *
 * New photo arrives:
 *   featured → shown (prepend)
 *   new photo → featured
 *   queue + shown stay in place (no reset!)
 */

const featured = ref<CompositePublicDTO | null>(null);
const queue = ref<CompositePublicDTO[]>([]);
const shown = ref<CompositePublicDTO[]>([]);

/** Derive rotation time from speed: 0 = 8s (slow), 100 = 2s (fast). Default ~30 → 4s. */
const cycleMs = computed(() => {
  const s = props.scrollSpeed;
  return Math.round(8000 - (s / 100) * 6000);
});

let cycleTimer: ReturnType<typeof setInterval> | null = null;

/** A map of all composites by id, for resolving references after reconnects. */
const compositeMap = computed(() => {
  const m = new Map<string, CompositePublicDTO>();
  for (const c of props.composites) m.set(c.id, c);
  return m;
});

/** Initialize internal state from the composites array (first load). */
function init() {
  const items = props.composites;
  if (items.length === 0) return;
  featured.value = items[0]!;
  queue.value = items.slice(1);
  shown.value = [];
}

/** Advance: featured → shown, next from queue → featured. */
function advance() {
  if (!featured.value) return;

  // Move current featured to shown (cap at 12 to limit DOM).
  shown.value = [featured.value, ...shown.value].slice(0, 12);

  if (queue.value.length > 0) {
    // Pull next from the queue.
    featured.value = queue.value[0]!;
    queue.value = queue.value.slice(1);
  } else {
    // Queue empty — refill from all composites except the current featured.
    const all = props.composites.filter((c) => c.id !== featured.value!.id);
    if (all.length > 0) {
      queue.value = all;
      featured.value = queue.value[0]!;
      queue.value = queue.value.slice(1);
      shown.value = []; // new cycle
    }
  }
}

function restartCycle() {
  if (cycleTimer) clearInterval(cycleTimer);
  cycleTimer = setInterval(advance, cycleMs.value);
}

// Restart cycle when speed changes.
watch(cycleMs, restartCycle);

onMounted(() => {
  init();
  restartCycle();
});
onUnmounted(() => {
  if (cycleTimer) clearInterval(cycleTimer);
});

/**
 * New photo arrives (prepended at composites[0]). Insert it at the FRONT of
 * the queue so it becomes the NEXT featured photo — but let the current one
 * finish its display time first (no jarring mid-display interruption).
 *
 * This means: the attendee waits at most ~4s (current photo's remaining time)
 * before their photo becomes the big one. The queue/shown lists update
 * smoothly on the next advance() cycle.
 */
watch(
  () => props.composites[0]?.id,
  (newId, oldId) => {
    if (!newId || newId === oldId) return;
    const newPhoto = compositeMap.value.get(newId);
    if (!newPhoto) return;
    // Push to front of queue — it'll be featured on the next advance().
    queue.value = [newPhoto, ...queue.value];
  },
);

/**
 * Handle full composites replacement (SSE reconnect re-fetch): if our
 * featured photo is no longer in the list, reinitialize.
 */
watch(
  () => props.composites,
  (newComposites) => {
    if (featured.value && !compositeMap.value.has(featured.value.id)) {
      // Our featured photo was removed — reinitialize from scratch.
      init();
      restartCycle();
    } else if (!featured.value && newComposites.length > 0) {
      // First load (featured was null).
      init();
      restartCycle();
    }
  },
  { deep: false },
);

/** Small photos for the right-side grid: up-next first, then recently-shown. */
const smallPhotos = computed(() => [...queue.value, ...shown.value].slice(0, 24));

const cellAspect = computed(() => {
  switch (props.ratio) {
    case "1:1":
      return "1 / 1";
    case "4:5":
      return "4 / 5";
    case "9:16":
      return "9 / 16";
  }
});
</script>

<template>
  <div class="flex h-full items-stretch justify-center gap-2 overflow-hidden p-3">
    <!--
      Left: large featured photo. Full height (100%), width derived purely from
      the aspect-ratio. No maxWidth constraint — it fights aspect-ratio and
      makes the photo non-square. The right grid flexes to fill whatever's left.
    -->
    <div
      v-if="featured"
      class="relative h-full shrink-0 overflow-hidden rounded-lg bg-neutral-900 shadow-lg"
      :style="{
        aspectRatio: cellAspect,
        height: '100%',
        ...(gridStyle === 'gallery-frame' ? { border: '1px solid color-mix(in srgb, currentColor 20%, transparent)' } : {}),
      }"
    >
      <!--
        out-in: old photo fully fades out before new one fades in. Prevents
        the "black box" gap where both are partially transparent simultaneously.
        The bg-neutral-900 on the container ensures any gap is dark, not black.
      -->
      <Transition name="bento-fade" mode="out-in">
        <img
          :key="featured.id"
          :src="featured.url"
          :alt="`Featured ${featured.id}`"
          class="absolute inset-0 h-full w-full object-cover"
        />
      </Transition>
    </div>

    <!-- Right: small photos in a fixed 4-column grid. No TransitionGroup —
         it caused jank when multiple items shifted positions simultaneously
         during the featured/shown/queue rotation. A plain re-render is smoother. -->
    <div class="grid flex-1 overflow-hidden"
      :class="[
        gridStyle === 'gallery-frame' ? 'gap-0 grid-gallery-frame' : 'gap-1.5',
        gridStyle === 'mounted-print' ? 'grid-mounted-print' : '',
      ]"
      style="grid-template-columns: repeat(4, 1fr); grid-auto-rows: min-content"
    >
      <div
        v-for="item in smallPhotos"
        :key="item.id"
        class="relative w-full overflow-hidden rounded-lg shadow-lg"
        :style="{ aspectRatio: cellAspect }"
      >
        <img
          :src="item.url"
          :alt="`Collage ${item.id}`"
          class="h-full w-full object-cover"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Crossfade the featured photo when it rotates */
.bento-fade-enter-active,
.bento-fade-leave-active {
  transition: opacity 0.6s ease;
}
.bento-fade-enter-from {
  opacity: 0;
}
.bento-fade-leave-to {
  opacity: 0;
}
.bento-fade-leave-active {
  position: absolute;
  inset: 0;
}
</style>
