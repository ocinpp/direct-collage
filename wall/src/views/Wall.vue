<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type Component } from "vue";
import { useRoute } from "vue-router";
import { useFeed } from "../composables/useFeed.js";
import ScrollingGrid from "../components/ScrollingGrid.vue";
import FullscreenShowcase from "../components/FullscreenShowcase.vue";
import RotatingHeroBento from "../components/RotatingHeroBento.vue";
import ScatteredPolaroids from "../components/ScatteredPolaroids.vue";
import FlipCardWave from "../components/FlipCardWave.vue";
import type { FontFamily } from "@direct-collage/shared";

const route = useRoute();
const { wall, composites, loading, error, connected, load, disconnect } = useFeed();

const wallSlug = computed(() => (route.params.wallSlug as string) || "demo");

const modeComponent = computed<Component>(() => {
  switch (wall.value?.displayMode) {
    case "fullscreen-showcase":
      return FullscreenShowcase;
    case "rotating-hero-bento":
      return RotatingHeroBento;
    case "scattered-polaroids":
      return ScatteredPolaroids;
    case "flip-card-wave":
      return FlipCardWave;
    default:
      return ScrollingGrid;
  }
});

watch(wallSlug, (slug) => load(slug), { immediate: false });
onMounted(() => load(wallSlug.value));
onUnmounted(() => disconnect());

const displayTitle = computed(() => wall.value?.title || wall.value?.name || "");
const scrollSpeed = computed(() => wall.value?.scrollSpeed ?? 30);

const rootStyle = computed(() => ({
  backgroundColor: wall.value?.bgColor ?? "#000000",
  color: wall.value?.textColor ?? "#ffffff",
}));

/** CSS class for the selected display font. */
const fontClass = computed(() => {
  const ff = wall.value?.fontFamily as FontFamily | undefined;
  switch (ff) {
    case "archivo-black":
      return "font-archivo-black";
    case "anton":
      return "font-anton";
    case "space-grotesk":
      return "font-space-grotesk";
    case "bebas-neue":
      return "font-bebas-neue";
    default:
      return "";
  }
});

// --- Live clock ---
const clock = ref("");
let clockTimer: ReturnType<typeof setInterval> | null = null;

function updateClock() {
  clock.value = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

onMounted(() => {
  updateClock();
  clockTimer = setInterval(updateClock, 1000);
});

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer);
});

/** Pass the newest composite ID to scrolling modes for accent ring. */
const newestId = computed(() => composites.value[0]?.id ?? null);

/** Grid style from wall config — applied to grid-based modes. */
const gridStyle = computed(() => wall.value?.gridStyle ?? "none");
</script>

<template>
  <div class="wall-atmosphere relative flex h-dvh flex-col" :style="rootStyle">
    <!-- Header: logo + title + clock -->
    <header
      class="relative z-1 flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-6 py-3"
    >
      <!-- Left: clock (keeps it away from the fixed connection indicator) -->
      <span
        v-if="clock"
        class="w-20 shrink-0 font-mono text-sm tabular-nums opacity-60 sm:text-base"
      >
        {{ clock }}
      </span>

      <!-- Center: logo + title -->
      <div class="flex items-center justify-center gap-4">
        <div v-if="wall?.headerLogo" class="rounded-lg bg-white/5 p-1.5">
          <img
            :src="wall.headerLogo"
            alt="Wall logo"
            class="max-h-12 w-auto object-contain"
          />
        </div>
        <h1
          v-if="displayTitle"
          class="text-center text-2xl tracking-tight sm:text-3xl lg:text-4xl"
          :class="fontClass"
        >
          {{ displayTitle }}
        </h1>
      </div>

      <!-- Right: spacer to balance the clock (connection indicator is fixed) -->
      <span class="w-20 shrink-0" />
    </header>

    <!-- Connection indicator -->
    <div
      v-if="!loading"
      class="fixed right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-xs"
    >
      <span
        class="h-2 w-2 rounded-full"
        :class="connected ? 'bg-emerald-400' : 'bg-amber-400'"
      />
      <span>{{ connected ? "live" : "reconnecting…" }}</span>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="relative z-1 flex flex-1 items-center justify-center">
      <span class="animate-pulse text-neutral-400">Loading wall…</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="relative z-1 flex flex-1 items-center justify-center">
      <span class="text-rose-400">{{ error }}</span>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="composites.length === 0"
      class="relative z-1 flex flex-1 flex-col items-center justify-center gap-2 text-center text-neutral-500"
    >
      <div class="text-5xl">📸</div>
      <p class="text-lg">No photos on this wall yet.</p>
      <p class="text-sm">Approved submissions will appear here in real time.</p>
    </div>

    <!-- Content: dispatched to the mode-specific component -->
    <div
      v-if="wall && !loading && !error && composites.length > 0"
      class="relative z-1 flex-1 overflow-hidden"
      :class="gridStyle === 'decorative' ? 'wall-decorative-bg' : ''"
    >
      <component
        :is="modeComponent"
        :composites="composites"
        :ratio="wall.aspectRatio"
        :scroll-speed="scrollSpeed"
        :newest-id="newestId"
        :grid-style="gridStyle"
        class="h-full"
      />
    </div>
  </div>
</template>
