<script setup lang="ts">
import { computed } from "vue";
import type { TemplateDef, AspectRatio } from "@direct-collage/shared";
import type { PreparedImage } from "../lib/image.js";
import type { SlotTransform } from "../lib/baker.js";
import PhotoSlot from "./PhotoSlot.vue";

const props = defineProps<{
  template: TemplateDef;
  ratio: AspectRatio;
  sources: (PreparedImage | null)[];
  transforms: SlotTransform[];
  activeSlot: number;
}>();

const emit = defineEmits<{
  pick: [slotIndex: number];
  change: [slotIndex: number, transform: SlotTransform];
  remove: [slotIndex: number];
}>();

/**
 * Build an inline CSS grid that mirrors the template's slot geometry.
 *
 * Strategy: every slot's normalized {x, y, w, h} defines an absolute rect, so
 * we position each slot absolutely inside a ratio-locked container. This is
 * simpler than reverse-engineering grid spans and is exact for all 7 layouts.
 */
const containerAspect = computed(() => aspectToCss(props.ratio));

function aspectToCss(r: AspectRatio): string {
  switch (r) {
    case "1:1":
      return "1 / 1";
    case "4:5":
      return "4 / 5";
    case "9:16":
      return "9 / 16";
  }
}

function slotStyle(s: { x: number; y: number; w: number; h: number }) {
  return {
    left: `${s.x * 100}%`,
    top: `${s.y * 100}%`,
    width: `${s.w * 100}%`,
    height: `${s.h * 100}%`,
  } as Record<string, string>;
}
</script>

<template>
  <div
    class="relative w-full max-w-sm gap-1 rounded-xl bg-black p-1"
    :style="{ aspectRatio: containerAspect }"
  >
    <div
      v-for="(s, i) in template.rect"
      :key="i"
      class="absolute p-0.5"
      :style="slotStyle(s)"
    >
      <PhotoSlot
        :slot="s"
        :source="sources[i] ?? null"
        :transform="transforms[i]!"
        :ratio="ratio"
        :active="i === activeSlot"
        @pick="(idx) => emit('pick', idx)"
        @change="(idx, t) => emit('change', idx, t)"
        @remove="(idx) => emit('remove', idx)"
      />
    </div>
  </div>
</template>
