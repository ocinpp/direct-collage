<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { AspectRatio, TemplateSlot } from "@direct-collage/shared";
import type { PreparedImage } from "../lib/image.js";
import { drawSlot, type SlotTransform } from "../lib/baker.js";

/**
 * Lightweight slot THUMBNAIL shown in the grid. Renders a WYSIWYG preview of
 * the slot via drawSlot() (so the grid reflects the baked result), but does
 * NOT contain any crop/zoom/pan editing UI — that moved to the full-screen
 * SlotEditor. Tapping a filled slot (or the empty placeholder) emits `pick`,
 * which the parent turns into "open the editor for this slot".
 */
const props = defineProps<{
  slot: TemplateSlot;
  source: PreparedImage | null;
  transform: SlotTransform;
  ratio: AspectRatio;
  active: boolean;
}>();

const emit = defineEmits<{
  pick: [slotIndex: number];
  remove: [slotIndex: number];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const imgEl = ref<HTMLImageElement | null>(null);

function loadSource() {
  if (!props.source) {
    imgEl.value = null;
    return;
  }
  const img = new Image();
  img.onload = () => {
    imgEl.value = img;
    renderPreview();
  };
  img.src = props.source.url;
}

function renderPreview() {
  const canvas = canvasRef.value;
  const img = imgEl.value;
  if (!canvas || !img || !props.source) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawSlot(
    ctx,
    img,
    { x: 0, y: 0, w: 1, h: 1 },
    props.transform,
    { w: canvas.width, h: canvas.height },
  );
}

watch(() => [props.source, props.transform], loadSource, { deep: true });
onMounted(() => loadSource());

let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas || typeof ResizeObserver === "undefined") return;
  resizeObserver = new ResizeObserver(() => renderPreview());
  resizeObserver.observe(canvas);
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

function onPick() {
  emit("pick", props.slot.index);
}
</script>

<template>
  <button
    type="button"
    class="relative h-full w-full overflow-hidden border-2 transition-colors"
    :class="active ? 'border-brand-500' : 'border-ink'"
    @click="onPick"
  >
    <!-- Filled: WYSIWYG canvas preview (no editing here — tap opens the editor) -->
    <canvas
      v-if="source"
      ref="canvasRef"
      class="absolute inset-0 h-full w-full"
      aria-hidden="true"
    />

    <!-- Empty: dashed border on white, big "+", mono uppercase label -->
    <span
      v-else
      class="absolute inset-0 flex flex-col items-center justify-center gap-1 border-2 border-dashed border-ink/30 bg-white text-ink/50"
    >
      <span class="text-4xl leading-none">+</span>
      <span class="px-1 text-center font-mono text-[9px] font-bold uppercase leading-tight tracking-wider">
        Add photo
      </span>
    </span>

    <!-- Remove chip: hard-edged stamp on the photo -->
    <span
      v-if="source"
      class="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center border border-ink bg-white text-sm font-bold text-ink hover:bg-brand-500 hover:text-white"
      @click.stop="emit('remove', slot.index)"
    >
      ✕
    </span>
  </button>
</template>
