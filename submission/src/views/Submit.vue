<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import { useSubmitStore } from "../stores/submit.js";
import SlotGrid from "../components/SlotGrid.vue";

const route = useRoute();
const store = useSubmitStore();
const { wall, wallError, phase, template, sources, transforms, activeSlot, ratio } =
  storeToRefs(store);

const permissionGranted = ref(false);
const preparing = ref<number | null>(null); // slot index currently preparing
const prepareError = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const wallSlug = computed(() => route.params.wallSlug as string);

onMounted(() => store.loadWall(wallSlug.value));

function pickFile(slotIndex: number) {
  preparing.value = slotIndex;
  prepareError.value = null;
  fileInput.value?.click();
}

async function onFileChosen(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ""; // reset so same file can be re-picked
  if (!file || preparing.value === null) return;

  const slotIndex = preparing.value;
  prepareError.value = null;
  try {
    await store.fillSlot(slotIndex, file);
  } catch (err) {
    prepareError.value = err instanceof Error ? err.message : "Could not load image";
  } finally {
    preparing.value = null;
  }
}

async function onSubmit() {
  if (!permissionGranted.value) return;
  await store.submit(true);
  // If submit succeeded, the store flipped phase to "done"; clear permission
  // so a follow-up "make another" starts from a clean consent state.
  if (store.phase === "done") {
    permissionGranted.value = false;
  }
}

/** After the user clicks "Make another", also clear local UI state. */
function onMakeAnother() {
  store.reset();
  permissionGranted.value = false;
  prepareError.value = null;
}

const busy = computed(() => preparing.value !== null || phase.value === "submitting");
</script>

<template>
  <!--
    min-h-dvh (not min-h-screen): iOS Safari's 100vh includes the area behind
    the URL bar, which pushes the submit button off-screen. 100dvh tracks the
    actual visible viewport as the URL bar shows/hides.
  -->
  <div class="mx-auto flex min-h-dvh max-w-md flex-col p-4">
    <!-- Hidden file input; re-used for whichever slot is active -->
    <input
      ref="fileInput"
      type="file"
      accept="image/jpeg,image/png"
      class="hidden"
      @change="onFileChosen"
    />

    <!-- Header -->
    <header class="mb-3 flex items-center justify-between">
      <h1 class="text-lg font-semibold">{{ wall?.name ?? "DirectCollage" }}</h1>
      <span
        v-if="template"
        class="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
      >
        {{ template.label }}
      </span>
    </header>

    <!-- Loading -->
    <div v-if="phase === 'loading'" class="flex flex-1 items-center justify-center">
      <span class="animate-pulse text-neutral-400">Loading…</span>
    </div>

    <!-- Error (wall) -->
    <div
      v-else-if="phase === 'error'"
      class="flex flex-1 flex-col items-center justify-center gap-2 text-center"
    >
      <p class="text-rose-400">{{ wallError }}</p>
    </div>

    <!-- Done -->
    <div
      v-else-if="phase === 'done'"
      class="flex flex-1 flex-col items-center justify-center gap-3 text-center"
    >
      <div class="text-5xl">🎉</div>
      <h2 class="text-xl font-semibold">Submitted!</h2>
      <p class="text-neutral-400">
        Your collage is in the moderation queue. It'll appear on the wall once approved.
      </p>
      <button
        class="rounded-lg border border-neutral-700 px-4 py-2 text-sm"
        type="button"
        @click="onMakeAnother"
      >
        Make another
      </button>
    </div>

    <!-- Edit / Pick / Submitting all render the grid -->
    <template v-else>
      <div v-if="prepareError" class="mb-2 rounded bg-rose-900/40 px-3 py-2 text-sm text-rose-200">
        {{ prepareError }}
      </div>

      <!-- The grid, with an overlay while a photo is being prepared -->
      <div v-if="template" class="relative flex justify-center">
        <SlotGrid
          :template="template"
          :ratio="ratio"
          :sources="sources"
          :transforms="transforms"
          :active-slot="activeSlot"
          @pick="(idx) => pickFile(idx)"
          @change="(idx, t) => store.setTransform(idx, t)"
          @remove="(idx) => store.removeSlot(idx)"
        />

        <!-- Processing overlay: sits on top of the grid so the user sees
             feedback right where their photo will appear. -->
        <div
          v-if="preparing !== null"
          class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-xl bg-black/70 text-sm text-neutral-200"
        >
          <span class="h-6 w-6 animate-spin rounded-full border-2 border-neutral-500 border-t-brand-500" />
          <span>Processing photo…</span>
        </div>
      </div>

      <!-- Footer: permission + submit -->
      <div class="mt-auto pt-4">
        <label class="flex items-start gap-2 text-sm text-neutral-300">
          <input
            v-model="permissionGranted"
            type="checkbox"
            class="mt-0.5 h-4 w-4 accent-brand-500"
          />
          <span>I grant permission to display this collage on the wall.</span>
        </label>

        <button
          class="mt-3 w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          type="button"
          :disabled="!store.allSlotsFilled || !permissionGranted || busy"
          @click="onSubmit"
        >
          <span v-if="phase === 'submitting'">Uploading… {{ store.uploadPct }}%</span>
          <span v-else>Submit collage</span>
        </button>

        <p v-if="store.submitError" class="mt-2 text-center text-sm text-rose-400">
          {{ store.submitError }}
        </p>
      </div>
    </template>
  </div>
</template>
