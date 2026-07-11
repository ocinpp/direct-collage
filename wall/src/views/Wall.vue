<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useFeed } from "../composables/useFeed.js";
import PhotoGrid from "../components/PhotoGrid.vue";

const route = useRoute();
const { wall, composites, loading, error, connected, load, disconnect } = useFeed();

const wallSlug = computed(() => (route.params.wallSlug as string) || "demo");

// (Re)load whenever the slug changes (e.g. navigating between walls).
watch(wallSlug, (slug) => load(slug), { immediate: false });

onMounted(() => load(wallSlug.value));
onUnmounted(() => disconnect());

/**
 * Display title: the user-facing `title` if set, falling back to the wall
 * `name`. Always non-empty for rendering.
 */
const displayTitle = computed(() => wall.value?.title || wall.value?.name || "");

/** Background color from wall config (PRD §6.3.5 branding). */
const bgStyle = computed(() => ({
  backgroundColor: wall.value?.bgColor ?? "#000000",
}));
</script>

<template>
  <div class="flex min-h-full flex-col text-white" :style="bgStyle">
    <!-- Top header: reserved space for logo + display title (PRD §6.3.5). -->
    <header class="flex shrink-0 items-center justify-center gap-4 px-6 py-4">
      <img
        v-if="wall?.headerLogo"
        :src="wall.headerLogo"
        alt="Wall logo"
        class="max-h-16 w-auto object-contain"
      />
      <h1
        v-if="displayTitle"
        class="text-center text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl"
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
    <div v-if="loading" class="flex h-screen items-center justify-center">
      <span class="animate-pulse text-neutral-400">Loading wall…</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="flex h-screen items-center justify-center">
      <span class="text-rose-400">{{ error }}</span>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="composites.length === 0"
      class="flex h-screen flex-col items-center justify-center gap-2 text-center text-neutral-500"
    >
      <div class="text-5xl">📸</div>
      <p class="text-lg">No photos on this wall yet.</p>
      <p class="text-sm">Approved submissions will appear here in real time.</p>
    </div>

    <!-- The grid -->
    <PhotoGrid v-else :composites="composites" />
  </div>
</template>
