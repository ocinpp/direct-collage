<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useAuthStore } from "../stores/auth.js";
import { useQueueStore } from "../stores/queue.js";
import { api } from "../lib/api.js";
import type { WallPublicDTO } from "@direct-collage/shared";
import CompositeCard from "../components/CompositeCard.vue";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const queueStore = useQueueStore();
const { items, loading, error, actingId } = storeToRefs(queueStore);

const wall = ref<WallPublicDTO | null>(null);
const wallLoadingError = ref<string | null>(null);

// --- Title editor ---
const titleDraft = ref("");
const editingTitle = ref(false);
const savingTitle = ref(false);
const titleError = ref<string | null>(null);

function startEditTitle() {
  titleDraft.value = wall.value?.title ?? wall.value?.name ?? "";
  editingTitle.value = true;
  titleError.value = null;
}

async function saveTitle() {
  if (!wall.value) return;
  savingTitle.value = true;
  titleError.value = null;
  try {
    const updated = await api.walls.patch(wall.value.id, { title: titleDraft.value.trim() || null });
    wall.value = updated;
    editingTitle.value = false;
  } catch (e) {
    titleError.value = e instanceof Error ? e.message : "Failed to save title";
  } finally {
    savingTitle.value = false;
  }
}

const wallParam = computed(() => route.params.id as string);

/** Poll the queue while the tab is open so newly-submitted composites appear. */
let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  // Resolve the wall. Accept either a cuid (id) or the slug (e.g. "demo").
  try {
    const walls = await api.walls.list();
    const found =
      walls.find((w) => w.id === wallParam.value) ??
      walls.find((w) => w.slug === wallParam.value) ??
      walls[0];
    if (!found) {
      wallLoadingError.value = "No walls exist yet.";
      return;
    }
    wall.value = found;
    await queueStore.load(found.id);
    pollTimer = setInterval(() => queueStore.load(found.id), 5000);
  } catch (e) {
    wallLoadingError.value = e instanceof Error ? e.message : "Failed to load wall";
  }
});

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}
// Cleanup on unmount.
onUnmounted(stopPolling);

async function onLogout() {
  stopPolling();
  await auth.logout();
  router.replace("/login");
}
</script>

<template>
  <div class="mx-auto max-w-5xl p-4">
    <!-- Header -->
    <header class="mb-4 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold">
          {{ wall?.name ?? "Wall" }}
          <span class="ml-2 text-sm font-normal text-neutral-500">
            moderation queue
          </span>
        </h1>
        <p v-if="wall" class="text-xs text-neutral-500">
          slug: {{ wall.slug }} · {{ wall.aspectRatio }}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span v-if="auth.email" class="text-sm text-neutral-500">{{ auth.email }}</span>
        <button
          class="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          type="button"
          @click="onLogout"
        >
          Sign out
        </button>
      </div>
    </header>

    <!-- Wall title editor (shown on the media wall at the top) -->
    <section v-if="wall" class="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <p class="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Wall title
          </p>
          <p class="mt-0.5 truncate text-sm text-neutral-700">
            {{ wall.title || wall.name }}<span v-if="!wall.title" class="text-neutral-400"> (using name)</span>
          </p>
        </div>
        <button
          v-if="!editingTitle"
          type="button"
          class="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          @click="startEditTitle"
        >
          Edit
        </button>
      </div>

      <div v-if="editingTitle" class="mt-3 flex items-center gap-2">
        <input
          v-model="titleDraft"
          type="text"
          maxlength="120"
          placeholder="Display title for the wall"
          class="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          @keyup.enter="saveTitle"
          @keyup.esc="editingTitle = false"
        />
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          :disabled="savingTitle"
          @click="saveTitle"
        >
          {{ savingTitle ? "Saving…" : "Save" }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
          @click="editingTitle = false"
        >
          Cancel
        </button>
      </div>
      <p v-if="titleError" class="mt-2 text-sm text-rose-600">{{ titleError }}</p>
    </section>

    <!-- Errors -->
    <p v-if="wallLoadingError" class="rounded bg-rose-100 px-3 py-2 text-rose-700">
      {{ wallLoadingError }}
    </p>
    <p v-if="error" class="rounded bg-rose-100 px-3 py-2 text-rose-700">{{ error }}</p>

    <!-- Loading -->
    <div v-if="loading && items.length === 0" class="py-16 text-center text-neutral-400">
      Loading queue…
    </div>

    <!-- Empty -->
    <div
      v-else-if="items.length === 0"
      class="rounded-xl border border-dashed border-neutral-300 py-16 text-center text-neutral-400"
    >
      No pending composites. New submissions will appear here.
    </div>

    <!-- Queue grid -->
    <div
      v-else
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
    >
      <CompositeCard
        v-for="c in items"
        :key="c.id"
        :composite="c"
        :busy="actingId === c.id"
        @approve="queueStore.approve(c.id)"
        @reject="queueStore.reject(c.id)"
      />
    </div>
  </div>
</template>
