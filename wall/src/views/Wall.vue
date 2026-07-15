<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch, type Component } from "vue";
import { useRoute } from "vue-router";
import { useFeed } from "../composables/useFeed.js";
import ScrollingGrid from "../components/ScrollingGrid.vue";
import FullscreenShowcase from "../components/FullscreenShowcase.vue";
import RotatingHeroBento from "../components/RotatingHeroBento.vue";
import ScatteredPolaroids from "../components/ScatteredPolaroids.vue";

const route = useRoute();
const { wall, composites, loading, error, connected, load, disconnect } = useFeed();

const wallSlug = computed(() => (route.params.wallSlug as string) || "demo");

/** Map displayMode → component. Falls back to ScrollingGrid (the default). */
const modeComponent = computed<Component>(() => {
  switch (wall.value?.displayMode) {
    case "fullscreen-showcase":
      return FullscreenShowcase;
    case "rotating-hero-bento":
      return RotatingHeroBento;
    case "scattered-polaroids":
      return ScatteredPolaroids;
    default:
      return ScrollingGrid;
  }
});

watch(wallSlug, (slug) => load(slug), { immediate: false });
onMounted(() => load(wallSlug.value));
onUnmounted(() => disconnect());

const bgStyle = computed(() => ({
  backgroundColor: wall.value?.bgColor ?? "#000000",
}));
const displayTitle = computed(() => wall.value?.title || wall.value?.name || "");
const scrollSpeed = computed(() => wall.value?.scrollSpeed ?? 30);
</script>

<template>
  <div class="flex h-dvh flex-col text-white" :style="bgStyle">
    <!-- Header: logo + title (fixed, doesn't scroll) -->
    <header class="flex shrink-0 items-center justify-center gap-4 px-6 py-3">
      <img
        v-if="wall?.headerLogo"
        :src="wall.headerLogo"
        alt="Wall logo"
        class="max-h-14 w-auto object-contain"
      />
      <h1
        v-if="displayTitle"
        class="text-center text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl"
      >
        {{ displayTitle }}
      </h1>
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
    <div v-if="loading" class="flex flex-1 items-center justify-center">
      <span class="animate-pulse text-neutral-400">Loading wall…</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="flex flex-1 items-center justify-center">
      <span class="text-rose-400">{{ error }}</span>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="composites.length === 0"
      class="flex flex-1 flex-col items-center justify-center gap-2 text-center text-neutral-500"
    >
      <div class="text-5xl">📸</div>
      <p class="text-lg">No photos on this wall yet.</p>
      <p class="text-sm">Approved submissions will appear here in real time.</p>
    </div>

    <!-- Content: dispatched to the mode-specific component -->
    <component
      v-else-if="wall"
      :is="modeComponent"
      :composites="composites"
      :ratio="wall.aspectRatio"
      :scroll-speed="scrollSpeed"
      class="flex-1 overflow-hidden"
    />
  </div>
</template>
