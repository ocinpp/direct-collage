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
  <div class="flex flex-col gap-6">
    <div>
      <h2 class="font-display text-xl uppercase tracking-tight text-ink">Choose a layout</h2>
      <p class="mt-1 text-sm text-ink/60">
        Pick how many photos to combine into your collage.
      </p>
    </div>

    <!--
      Flat grid of stamp/sticker cards. White surface, hard ink border, flat
      offset shadow. On press the shadow collapses + card shifts — "picked up."
    -->
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <button
        v-for="t in templates"
        :key="t.variant"
        type="button"
        class="stamp-press flex flex-col items-center gap-3 border-2 border-ink bg-white p-4 stamp-shadow-sm hover:bg-brand-50"
        @click="emit('select', t)"
      >
        <!-- SVG mini-preview in warm stamp-red -->
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
            class="fill-brand-500"
          />
        </svg>
        <span class="text-center font-display text-xs uppercase leading-tight tracking-wide text-ink">
          {{ t.label.replace(/^[^-]+—\s*/, "") }}
          <span class="mt-0.5 block font-mono text-[10px] font-normal normal-case text-ink/50">
            {{ t.slots }} photo{{ t.slots === 1 ? "" : "s" }}
          </span>
        </span>
      </button>
    </div>
  </div>
</template>
