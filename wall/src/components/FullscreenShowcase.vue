<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { AspectRatio, CompositePublicDTO } from "@direct-collage/shared";

const props = defineProps<{
  composites: CompositePublicDTO[];
  ratio: AspectRatio;
  scrollSpeed: number;
}>();

const activeIndex = ref(0);
let cycleTimer: ReturnType<typeof setInterval> | null = null;

/** Derive display time from speed: 0 = 12s (slow), 100 = 2s (fast). Default ~30 → 6s. */
const displayMs = computed(() => {
  const s = props.scrollSpeed;
  return Math.round(12000 - (s / 100) * 10000);
});

const activeComposite = computed(() => props.composites[activeIndex.value]);
const upcoming = computed(() =>
  Array.from({ length: Math.min(10, props.composites.length) }, (_, i) => {
    const idx = (activeIndex.value + 1 + i) % props.composites.length;
    return props.composites[idx];
  }),
);

function next() {
  if (props.composites.length === 0) return;
  activeIndex.value = (activeIndex.value + 1) % props.composites.length;
}

function jumpTo(index: number) {
  activeIndex.value = index;
  restartCycle();
}

function restartCycle() {
  if (cycleTimer) clearInterval(cycleTimer);
  cycleTimer = setInterval(next, displayMs.value);
}

// Restart cycle when speed changes.
watch(displayMs, restartCycle);

onMounted(restartCycle);
onUnmounted(() => {
  if (cycleTimer) clearInterval(cycleTimer);
});

// Reset to photo 0 when a new composite is prepended (so the new one shows).
watch(
  () => props.composites[0]?.id,
  () => {
    activeIndex.value = 0;
    restartCycle();
  },
);

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
  <div class="flex h-full flex-col">
    <!-- Main showcase area -->
    <div class="relative flex flex-1 items-center justify-center overflow-hidden p-4">
      <Transition name="showcase" mode="out-in">
        <div
          :key="activeComposite.id"
          class="showcase-img h-full max-h-[85%]"
          :style="{ aspectRatio: cellAspect }"
        >
          <img
            :src="activeComposite.url"
            :alt="`Collage ${activeComposite.id}`"
            class="h-full w-full rounded-lg object-cover shadow-2xl"
          />
        </div>
      </Transition>
    </div>

    <!-- Thumbnail strip -->
    <div class="flex shrink-0 justify-center gap-2 overflow-hidden px-4 pb-4 pt-2">
      <button
        v-for="(thumb, i) in upcoming"
        :key="thumb.id"
        type="button"
        class="h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 border-transparent opacity-50 transition-all hover:opacity-100"
        @click="jumpTo((activeIndex + 1 + i) % composites.length)"
      >
        <img :src="thumb.url" :alt="`Upcoming ${i}`" class="h-full w-full object-cover" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Ken Burns effect on each showcase image */
.showcase-img img {
  animation: kenburns 6s ease-out both;
}

@keyframes kenburns {
  0% {
    transform: scale(1) translate(0, 0);
  }
  100% {
    transform: scale(1.12) translate(-1%, -1.5%);
  }
}

/* Crossfade between photos */
.showcase-enter-active,
.showcase-leave-active {
  transition: opacity 0.6s ease;
}
.showcase-enter-from,
.showcase-leave-to {
  opacity: 0;
}
</style>
