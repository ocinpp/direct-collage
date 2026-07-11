<script setup lang="ts">
import type { TemplateDef } from "@direct-collage/shared";

/**
 * Card-grid picker for the submission portal. Each card shows an SVG mini-
 * preview generated directly from the template's normalized `rect` array, so
 * what the user sees matches what SlotGrid will render. Tapping a card calls
 * `select` → the store flips to the "edit" phase.
 */
defineProps<{
  templates: TemplateDef[];
}>();

const emit = defineEmits<{
  select: [template: TemplateDef];
}>();

/**
 * Build SVG <rect> elements for a template's slots, in a 100×100 viewBox.
 * Normalized coords (0..1) map to 0..100. A gap between cells gives a clean
 * mosaic look that matches the actual slot grid.
 */
function slotRects(template: TemplateDef) {
  const gap = 3; // visible gutter between cells, in viewBox units
  return template.rect.map((s) => ({
    x: s.x * 100 + gap / 2,
    y: s.y * 100 + gap / 2,
    w: s.w * 100 - gap,
    h: s.h * 100 - gap,
  }));
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="text-center">
      <h2 class="text-lg font-semibold">Choose a layout</h2>
      <p class="mt-1 text-sm text-neutral-400">
        Pick how many photos to combine into your collage.
      </p>
    </div>

    <!--
      Flat grid — 7 layouts is few enough that family headers (Solo/Triad/...)
      add noise without aiding discovery. The SVG preview + photo count on each
      card is what the user actually navigates by.
    -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <button
        v-for="t in templates"
        :key="t.variant"
        type="button"
        class="flex flex-col items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 p-3 transition-colors hover:border-brand-500 hover:bg-neutral-800 active:scale-[0.98]"
        @click="emit('select', t)"
      >
        <!-- SVG mini-preview, generated from the template's rect geometry -->
        <svg
          viewBox="0 0 100 100"
          class="h-20 w-20"
          :style="{ aspectRatio: '1 / 1' }"
          aria-hidden="true"
        >
          <rect
            v-for="(r, i) in slotRects(t)"
            :key="i"
            :x="r.x"
            :y="r.y"
            :width="r.w"
            :height="r.h"
            rx="3"
            class="fill-brand-500/70 stroke-brand-300 stroke-1"
          />
        </svg>
        <span class="text-center text-xs leading-tight text-neutral-200">
          {{ t.label.replace(/^[^-]+—\s*/, "") }}
          <span class="block text-[10px] text-neutral-500">
            {{ t.slots }} photo{{ t.slots === 1 ? "" : "s" }}
          </span>
        </span>
      </button>
    </div>
  </div>
</template>
