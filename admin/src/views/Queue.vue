<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useAuthStore } from "../stores/auth.js";
import { useQueueStore } from "../stores/queue.js";
import { api } from "../lib/api.js";
import type { DisplayMode, WallAnalyticsDTO, WallPublicDTO } from "@direct-collage/shared";
import { DISPLAY_MODE_LABELS } from "@direct-collage/shared";
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

// --- Branding editor (bgColor, headerLogo, scrollSpeed) ---
const editingBranding = ref(false);
const savingBranding = ref(false);
const brandingError = ref<string | null>(null);
const bgColorDraft = ref("#000000");
const textColorDraft = ref("#ffffff");
const headerLogoDraft = ref("");
const scrollSpeedDraft = ref(30);
const displayModeDraft = ref<DisplayMode>("scrolling-grid");
const maxPhotosDraft = ref(100);

// --- Analytics ---
const analytics = ref<WallAnalyticsDTO | null>(null);
let analyticsTimer: ReturnType<typeof setInterval> | null = null;

async function loadAnalytics(wallId: string) {
  try {
    analytics.value = await api.analytics.get(wallId);
  } catch {
    // Non-fatal — analytics are supplementary
  }
}

function startEditBranding() {
  bgColorDraft.value = wall.value?.bgColor ?? "#000000";
  textColorDraft.value = wall.value?.textColor ?? "#ffffff";
  headerLogoDraft.value = wall.value?.headerLogo ?? "";
  scrollSpeedDraft.value = wall.value?.scrollSpeed ?? 30;
  displayModeDraft.value = wall.value?.displayMode ?? "scrolling-grid";
  maxPhotosDraft.value = wall.value?.maxPhotos ?? 100;
  editingBranding.value = true;
  brandingError.value = null;
}

async function saveBranding() {
  if (!wall.value) return;
  savingBranding.value = true;
  brandingError.value = null;
  try {
    const updated = await api.walls.patch(wall.value.id, {
      bgColor: bgColorDraft.value || null,
      textColor: textColorDraft.value || null,
      headerLogo: headerLogoDraft.value.trim() || null,
      scrollSpeed: scrollSpeedDraft.value,
      displayMode: displayModeDraft.value,
      maxPhotos: maxPhotosDraft.value,
    });
    wall.value = updated;
    editingBranding.value = false;
  } catch (e) {
    brandingError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    savingBranding.value = false;
  }
}

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
    await queueStore.load(found.id, "PENDING");
    pollTimer = setInterval(() => queueStore.refresh(), 5000);
    await loadAnalytics(found.id);
    analyticsTimer = setInterval(() => loadAnalytics(found.id), 10000);
  } catch (e) {
    wallLoadingError.value = e instanceof Error ? e.message : "Failed to load wall";
  }
});

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  if (analyticsTimer) clearInterval(analyticsTimer);
  analyticsTimer = null;
}

/** Switch status tab and reload. */
async function switchTab(status: string) {
  if (!wall.value) return;
  await queueStore.load(wall.value.id, status);
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

    <!-- Branding editor (bg color, logo, scroll speed) -->
    <section v-if="wall" class="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
      <div class="flex items-center justify-between gap-3">
        <p class="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Wall appearance
        </p>
        <button
          v-if="!editingBranding"
          type="button"
          class="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          @click="startEditBranding"
        >
          Edit
        </button>
      </div>

      <div v-if="!editingBranding" class="mt-2 flex flex-wrap items-center gap-4 text-sm text-neutral-700">
        <span class="flex items-center gap-1.5">
          <span
            class="inline-block h-4 w-4 rounded border border-neutral-300"
            :style="{ backgroundColor: wall.bgColor ?? '#000000' }"
          />
          {{ wall.bgColor ?? "default (black)" }}
        </span>
        <span class="flex items-center gap-1.5">
          <span
            class="inline-block h-4 w-4 rounded border border-neutral-300"
            :style="{ backgroundColor: wall.textColor ?? '#ffffff' }"
          />
          Text: {{ wall.textColor ?? "default (white)" }}
        </span>
        <span v-if="wall.headerLogo" class="truncate">Logo: {{ wall.headerLogo }}</span>
        <span v-else>No logo</span>
        <span>Speed: {{ wall.scrollSpeed ?? 30 }}</span>
        <span>Max: {{ wall.maxPhotos ?? 100 }} photos</span>
        <span>Mode: {{ wall.displayMode ? DISPLAY_MODE_LABELS[wall.displayMode] : "Scrolling Grid" }}</span>
      </div>

      <div v-if="editingBranding" class="mt-3 space-y-3">
        <label class="flex items-center justify-between gap-3">
          <span class="text-sm font-medium text-neutral-700">Background color</span>
          <input
            v-model="bgColorDraft"
            type="color"
            class="h-8 w-12 cursor-pointer rounded border border-neutral-300"
          />
        </label>
        <label class="flex items-center justify-between gap-3">
          <span class="text-sm font-medium text-neutral-700">Text color</span>
          <input
            v-model="textColorDraft"
            type="color"
            class="h-8 w-12 cursor-pointer rounded border border-neutral-300"
          />
        </label>
        <label class="block">
          <span class="text-sm font-medium text-neutral-700">Header logo URL</span>
          <input
            v-model="headerLogoDraft"
            type="url"
            placeholder="https://example.com/logo.png"
            class="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </label>
        <label class="block">
          <span class="text-sm font-medium text-neutral-700">
            Transition speed: {{ scrollSpeedDraft }}
          </span>
          <input
            v-model.number="scrollSpeedDraft"
            type="range"
            min="0"
            max="100"
            step="5"
            class="mt-2 h-2 w-full accent-brand-500"
          />
          <div class="flex justify-between text-xs text-neutral-400">
            <span>Slow (0)</span>
            <span>Fast (100)</span>
          </div>
        </label>
        <label class="block">
          <span class="text-sm font-medium text-neutral-700">Display mode</span>
          <select
            v-model="displayModeDraft"
            class="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          >
            <option v-for="(label, key) in DISPLAY_MODE_LABELS" :key="key" :value="key">
              {{ label }}
            </option>
          </select>
        </label>
        <label class="block">
          <span class="text-sm font-medium text-neutral-700">Max photos on wall</span>
          <input
            v-model.number="maxPhotosDraft"
            type="number"
            min="10"
            max="1000"
            step="10"
            class="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <span class="mt-1 block text-xs text-neutral-400">Oldest photos are evicted (FIFO). Default: 100.</span>
        </label>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            :disabled="savingBranding"
            @click="saveBranding"
          >
            {{ savingBranding ? "Saving…" : "Save" }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
            @click="editingBranding = false"
          >
            Cancel
          </button>
        </div>
        <p v-if="brandingError" class="text-sm text-rose-600">{{ brandingError }}</p>
      </div>
    </section>

    <!-- Analytics panel -->
    <section v-if="analytics" class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-xl border border-neutral-200 bg-white p-3 text-center">
        <p class="font-mono text-2xl font-bold text-neutral-900">{{ analytics.total }}</p>
        <p class="text-xs uppercase tracking-wide text-neutral-500">Total</p>
      </div>
      <div class="rounded-xl border border-neutral-200 bg-white p-3 text-center">
        <p class="font-mono text-2xl font-bold text-emerald-600">{{ analytics.approved }}</p>
        <p class="text-xs uppercase tracking-wide text-neutral-500">Approved</p>
      </div>
      <div class="rounded-xl border border-neutral-200 bg-white p-3 text-center">
        <p class="font-mono text-2xl font-bold text-rose-600">{{ analytics.rejected }}</p>
        <p class="text-xs uppercase tracking-wide text-neutral-500">Rejected</p>
      </div>
      <div class="rounded-xl border border-neutral-200 bg-white p-3 text-center">
        <p class="font-mono text-2xl font-bold text-amber-600">{{ analytics.pending }}</p>
        <p class="text-xs uppercase tracking-wide text-neutral-500">Pending</p>
      </div>
    </section>

    <!-- Errors -->
    <p v-if="wallLoadingError" class="rounded bg-rose-100 px-3 py-2 text-rose-700">
      {{ wallLoadingError }}
    </p>
    <p v-if="error" class="rounded bg-rose-100 px-3 py-2 text-rose-700">{{ error }}</p>

    <!-- Status tabs -->
    <div class="mb-4 flex gap-1 border-b-2 border-neutral-200">
      <button
        v-for="tab in [
          { key: 'PENDING', label: 'Pending', count: analytics?.pending },
          { key: 'APPROVED', label: 'Approved', count: analytics?.approved },
          { key: 'REJECTED', label: 'Rejected', count: analytics?.rejected },
        ]"
        :key="tab.key"
        type="button"
        class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors"
        :class="queueStore.activeStatus === tab.key
          ? 'border-b-2 border-brand-600 text-brand-600'
          : 'text-neutral-500 hover:text-neutral-700'"
        :style="queueStore.activeStatus === tab.key ? { marginBottom: '-2px' } : ''"
        @click="switchTab(tab.key)"
      >
        {{ tab.label }}
        <span
          class="rounded-full px-1.5 py-0.5 text-xs"
          :class="queueStore.activeStatus === tab.key
            ? 'bg-brand-100 text-brand-700'
            : 'bg-neutral-100 text-neutral-500'"
        >
          {{ tab.count ?? 0 }}
        </span>
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading && items.length === 0" class="py-16 text-center text-neutral-400">
      Loading…
    </div>

    <!-- Empty -->
    <div
      v-else-if="items.length === 0"
      class="rounded-xl border border-dashed border-neutral-300 py-16 text-center text-neutral-400"
    >
      <span v-if="queueStore.activeStatus === 'PENDING'">No pending composites. New submissions will appear here.</span>
      <span v-else-if="queueStore.activeStatus === 'APPROVED'">No approved photos yet.</span>
      <span v-else>No rejected photos.</span>
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

    <!-- Load more -->
    <div v-if="queueStore.hasMore && items.length > 0" class="mt-4 flex justify-center">
      <button
        type="button"
        :disabled="queueStore.loadingMore"
        class="rounded-lg border border-neutral-300 bg-white px-6 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        @click="queueStore.loadMore()"
      >
        {{ queueStore.loadingMore ? "Loading…" : "Load more" }}
      </button>
    </div>
  </div>
</template>
