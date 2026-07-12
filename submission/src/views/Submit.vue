<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import { useSubmitStore } from "../stores/submit.js";
import SlotGrid from "../components/SlotGrid.vue";
import SlotEditor from "../components/SlotEditor.vue";
import TemplatePicker from "../components/TemplatePicker.vue";
import type { SlotTransform } from "../lib/baker.js";
import type { TemplateDef } from "@direct-collage/shared";

const route = useRoute();
const store = useSubmitStore();
const { wall, wallError, phase, template, sources, transforms, activeSlot, ratio } =
  storeToRefs(store);

const permissionGranted = ref(false);
const preparing = ref<number | null>(null); // slot index currently being processed
const prepareError = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

/**
 * Which slot index is currently open in the full-screen editor (null = closed).
 * The editor is where crop/zoom/pan happens — the grid just shows thumbnails.
 */
const editingSlot = ref<number | null>(null);

const wallSlug = computed(() => route.params.wallSlug as string);

onMounted(() => store.loadWall(wallSlug.value));

/** User picked a template from the picker → store flips to edit phase. */
function onSelectTemplate(t: TemplateDef) {
  store.selectTemplate(t);
}

/**
 * Return to the template picker. If the user has already placed any photos,
 * confirm first — switching layouts clears all slots (different layouts have
 * different slot counts, so a Triad's 3 photos can't map onto a Solo's 1).
 */
function onChangeTemplate() {
  const hasPhotos = store.sources.some((s) => s !== null);
  if (hasPhotos && !window.confirm("Switching layout will clear your photos. Continue?")) {
    return;
  }
  store.changeTemplate();
}

/**
 * Open the full-screen editor for a slot. Works for both filled slots (edit
 * the crop) and empty slots (the editor's "Choose photo" button triggers the
 * file picker).
 */
function openEditor(slotIndex: number) {
  editingSlot.value = slotIndex;
}

function closeEditor() {
  editingSlot.value = null;
}

/**
 * The editor's "Choose photo" button (for empty slots) asks us to open the
 * file picker. We keep the editor open so the photo appears in it once loaded.
 */
function pickFromEditor() {
  if (editingSlot.value === null) return;
  preparing.value = editingSlot.value;
  prepareError.value = null;
  fileInput.value?.click();
}

async function onFileChosen(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ""; // reset so same file can be re-picked
  // If the user canceled the picker, file is undefined — reset preparing so
  // the "Processing photo…" state doesn't get stuck.
  if (!file || preparing.value === null) {
    preparing.value = null;
    return;
  }

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

function onEditorChange(t: SlotTransform) {
  if (editingSlot.value !== null) store.setTransform(editingSlot.value, t);
}

function onEditorRemove() {
  if (editingSlot.value !== null) store.removeSlot(editingSlot.value);
  editingSlot.value = null; // close editor after removing
}

async function onSubmit() {
  if (!permissionGranted.value) return;
  await store.submit(true);
  if (store.phase === "done") {
    permissionGranted.value = false;
  }
}

function onMakeAnother() {
  store.reset();
  permissionGranted.value = false;
  prepareError.value = null;
  editingSlot.value = null;
}

const busy = computed(() => preparing.value !== null || phase.value === "submitting");

const showEditor = computed(() => editingSlot.value !== null && template.value !== null);
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
      <!--
        The template badge is a button so the user can switch layouts. Only
        shown in the edit/submitting phases (not during pick). Confirming the
        switch clears any photos already arranged, since slot counts differ.
      -->
      <button
        v-if="template && (phase === 'edit' || phase === 'submitting')"
        type="button"
        class="flex items-center gap-1 rounded-full bg-neutral-800 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
        @click="onChangeTemplate"
      >
        {{ template.label }}
        <span class="text-neutral-500">▾</span>
      </button>
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

    <!-- Pick phase: choose a template layout -->
    <div v-else-if="phase === 'pick'" class="flex-1 overflow-y-auto py-4">
      <TemplatePicker
        :templates="store.enabledTemplates"
        @select="onSelectTemplate"
      />
    </div>

    <!-- Edit / Submitting render the grid -->
    <template v-else>
      <div v-if="prepareError" class="mb-2 rounded bg-rose-900/40 px-3 py-2 text-sm text-rose-200">
        {{ prepareError }}
      </div>

      <!-- The grid of slot thumbnails. Tapping a slot opens the full-screen
           editor (defined at the bottom of this template). The grid itself is
           just a layout preview — no crop/zoom UI here, so narrow slots like
           Pentagon-Row columns remain usable. -->
      <div v-if="template" class="relative flex justify-center">
        <SlotGrid
          :template="template"
          :ratio="ratio"
          :sources="sources"
          :transforms="transforms"
          :active-slot="activeSlot"
          @pick="(idx) => openEditor(idx)"
          @remove="(idx) => store.removeSlot(idx)"
        />
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

    <!--
      Full-screen slot editor overlay. Renders above the whole view when a slot
      is being edited. This is where crop/zoom/pan happens — the grid above is
      just a thumbnail preview. Solves the tiny-stripe problem: even a 45px-wide
      Pentagon-Row column gets a full-screen edit area here.
    -->
    <SlotEditor
      v-if="showEditor && template && editingSlot !== null"
      :slot="template.rect[editingSlot]!"
      :source="sources[editingSlot] ?? null"
      :transform="transforms[editingSlot]!"
      :ratio="ratio"
      :slot-number="editingSlot + 1"
      :total-slots="template.slots"
      :preparing="preparing === editingSlot"
      @close="closeEditor"
      @change="onEditorChange"
      @pick="pickFromEditor"
      @remove="onEditorRemove"
    />
  </div>
</template>
