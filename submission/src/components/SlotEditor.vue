<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from "vue";
import type { AspectRatio, TemplateSlot } from "@direct-collage/shared";
import { OUTPUT_DIMS, type PreparedImage } from "../lib/image.js";
import { drawSlot, type SlotTransform } from "../lib/baker.js";
import { useCropZoom } from "../composables/useCropZoom.js";

/**
 * Full-screen slot editor overlay.
 *
 * Solves the tiny-stripe problem: in the grid, a Pentagon-Row column is ~45px
 * wide — impossible to pinch-zoom or hit a slider on. Here the slot's editing
 * canvas is sized to the slot's OWN aspect ratio (so WYSIWYG is preserved) but
 * scaled up to fill most of the screen. Crop/zoom/pan logic comes from the
 * shared useCropZoom composable — identical math to what the baker uses.
 *
 * Two modes:
 *  - Filled slot: shows the crop/zoom/pan editor + Remove + Done
 *  - Empty slot: prompts to pick a photo (Done doubles as "open picker")
 */
const props = defineProps<{
  slot: TemplateSlot;
  source: PreparedImage | null;
  transform: SlotTransform;
  ratio: AspectRatio;
  slotNumber: number;
  totalSlots: number;
  /** True while a file is being EXIF-corrected + downsampled for this slot. */
  preparing: boolean;
}>();

const emit = defineEmits<{
  close: [];
  change: [transform: SlotTransform];
  pick: [];
  remove: [];
}>();

// Reactive refs into props for the composable.
const slotRef = toRef(props, "slot");
const sourceRef = toRef(props, "source");
const transformRef = toRef(props, "transform");
const ratioRef = toRef(props, "ratio");
const canvasRef = ref<HTMLCanvasElement | null>(null);

function onChange(t: SlotTransform) {
  emit("change", t);
}

/**
 * The editor's square canvas represents the WHOLE output canvas (e.g. 1080 for
 * a 1:1 wall), not just the slot's area — so pan deltas convert using the full
 * output width. Passing the slot's own width here would make horizontal pan
 * crawl on narrow-stripe slots (slotOutW tiny → x-factor tiny).
 */
const canvasOutputWidth = computed(() => OUTPUT_DIMS[props.ratio].w);

const {
  zoomPct,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onZoomInput,
} = useCropZoom({
  slot: slotRef,
  source: sourceRef,
  transform: transformRef,
  ratio: ratioRef,
  canvasRef,
  canvasOutputWidth,
  onChange,
});

// --- Preview rendering (shared drawSlot path with the baker) ---
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

/**
 * Crop-editor render on a single square canvas. Standard crop-tool pattern:
 * the user sees the FULL photo with the crop frame bright and everything
 * outside it dimmed, so they understand what's being included vs cropped away.
 *
 * Two layers, BOTH drawn at the user's current transform (so they move/zoom
 * together coherently), differing only in clip region and brightness:
 *
 *  1. DIMMED: drawSlot across the WHOLE canvas (no frame clip) at ~35% alpha.
 *     Shows the full photo including the parts being cropped out.
 *  2. BRIGHT: drawSlot clipped to the centered crop frame at 100% alpha.
 *     Shows exactly what will appear in the slot.
 *
 * Both calls use the same normalized frame rect and the same canvas dims, so
 * the photo is positioned identically — the bright window is literally the
 * same image, just revealed at full brightness inside the frame.
 *
 * Outside the frame the dimmed photo is visible against black; inside, the
 * bright version wins. A white border strokes the frame boundary.
 */
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

  const cw = canvas.width;
  const ch = canvas.height;

  // --- Compute the centered crop frame at the slot's aspect ratio ---
  const { w: slotW, h: slotH } = slotOutDims.value;
  const slotAspect = slotW / slotH;
  const canvasAspect = cw / ch;
  let frameW: number;
  let frameH: number;
  if (slotAspect >= canvasAspect) {
    frameW = cw;
    frameH = cw / slotAspect;
  } else {
    frameH = ch;
    frameW = ch * slotAspect;
  }
  const frameX = (cw - frameW) / 2;
  const frameY = (ch - frameH) / 2;

  // The frame as a NORMALIZED rect within the whole canvas. Both layers use
  // this same rect + canvas dims so the photo positions identically.
  const frameRectNorm = {
    x: frameX / cw,
    y: frameY / ch,
    w: frameW / cw,
    h: frameH / ch,
  };

  // --- Black background ---
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cw, ch);

  // --- Layer 1: dimmed full photo, UNCLIPPED — shows the cropped-away parts.
  // Uses clip=false so drawSlot doesn't trim the image to the frame rect; the
  // photo spills across the whole canvas at 35% alpha, making the frame a
  // bright "window" cut into the dimmed photo.
  ctx.save();
  ctx.globalAlpha = 0.35;
  drawSlot(ctx, img, frameRectNorm, props.transform, { w: cw, h: ch }, false);
  ctx.restore();

  // --- Layer 2: bright crop, clipped to the frame ---
  ctx.save();
  ctx.beginPath();
  ctx.rect(frameX, frameY, frameW, frameH);
  ctx.clip();
  drawSlot(ctx, img, frameRectNorm, props.transform, { w: cw, h: ch });
  ctx.restore();

  // --- Brand-pink border around the frame (ties the editor into the palette) ---
  ctx.strokeStyle = "#f472b6"; // brand-400
  ctx.lineWidth = 2 * dpr;
  ctx.strokeRect(frameX, frameY, frameW, frameH);
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

/**
 * The crop frame's aspect ratio, derived from the slot's OUTPUT pixel shape —
 * what the baker produces for this slot. For a narrow vertical stripe slot
 * (e.g. Pentagon-Row column: 0.15w × 1.0h in a 1:1 wall = 162×1080), the crop
 * frame is tall and narrow, matching exactly what will appear in that cell.
 */
const slotOutDims = computed(() => {
  const { w, h } = OUTPUT_DIMS[props.ratio];
  return { w: props.slot.w * w, h: props.slot.h * h };
});

/**
 * The editing container is a SQUARE — big enough to show the full source photo
 * as context (the dimmed ghost layer) regardless of the slot's shape. The crop
 * frame sits inside it at the slot's aspect ratio. This way even a thin-stripe
 * slot gets a comfortable editing surface: the ghost shows the whole photo,
 * and the narrow crop frame shows precisely what will appear.
 */
const editorAspectStyle = computed(() => ({
  aspectRatio: "1 / 1",
  maxHeight: "70vh",
  maxWidth: "100%",
}));

const canEdit = computed(() => props.source !== null);
</script>

<template>
  <!--
    Full-screen overlay. Cream chrome (header/footer/buttons) for the photobooth
    aesthetic, but the editing canvas area stays dark (black) so the photo and
    the dimmed-ghost/bright-crop-frame read with proper contrast.
  -->
  <div
    class="fixed inset-0 z-50 flex flex-col bg-paper text-ink"
    role="dialog"
    aria-modal="true"
  >
    <!-- Top bar: cream chrome -->
    <header class="flex shrink-0 items-center justify-between border-b-2 border-ink px-5 py-3">
      <button
        type="button"
        class="stamp-press border-2 border-ink bg-white px-4 py-1.5 font-display text-xs uppercase tracking-wide hover:bg-ink hover:text-paper"
        @click="emit('close')"
      >
        ← Back
      </button>
      <span class="font-mono text-xs font-bold uppercase tracking-widest text-ink/60">
        Photo {{ slotNumber }} of {{ totalSlots }}
      </span>
      <span class="w-14" />
    </header>

    <!-- Editing area: dark canvas region for photo contrast -->
    <div class="flex flex-1 flex-col items-center justify-center gap-4 bg-neutral-950 px-4 pb-4">
      <template v-if="canEdit">
        <div class="relative w-full" :style="editorAspectStyle">
          <canvas
            ref="canvasRef"
            class="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
          />
        </div>

        <!-- Zoom slider on the dark canvas area (dark-theme slider variant) -->
        <div class="flex w-full max-w-md items-center gap-3 border border-white/15 bg-white/5 px-4 py-3">
          <span class="font-mono text-sm tabular-nums text-neutral-400">−</span>
          <input
            type="range"
            min="0"
            max="100"
            :value="zoomPct"
            class="dc-zoom-slider dc-zoom-slider-dark h-6 flex-1"
            @input="onZoomInput"
            @pointerdown.stop
          />
          <span class="font-mono text-sm tabular-nums text-neutral-400">+</span>
        </div>
      </template>

      <!-- Empty: stamp-style "+" on the dark canvas area -->
      <button
        v-else
        type="button"
        class="relative flex aspect-square w-full max-w-xs flex-col items-center justify-center gap-3 border-2 border-dashed border-white/20 text-neutral-400 transition-colors hover:border-brand-400 hover:bg-white/5"
        @click="emit('pick')"
      >
        <template v-if="preparing">
          <span class="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-brand-500" />
          <span class="font-mono text-sm">Processing photo…</span>
        </template>
        <template v-else>
          <span class="text-6xl leading-none">+</span>
          <span class="font-mono text-sm font-bold uppercase tracking-wider">Add photo</span>
        </template>
      </button>
    </div>

    <!-- Bottom actions: cream chrome, stamp-style buttons -->
    <footer class="flex shrink-0 items-center justify-between gap-3 border-t-2 border-ink bg-paper px-5 pb-6 pt-3">
      <button
        v-if="canEdit"
        type="button"
        class="stamp-press border-2 border-ink bg-white px-5 py-2.5 font-display text-xs uppercase tracking-wide text-ink hover:bg-brand-500 hover:text-white"
        @click="emit('remove')"
      >
        Remove
      </button>
      <span v-else />

      <button
        v-if="canEdit"
        type="button"
        class="stamp-press border-2 border-ink bg-brand-500 px-6 py-2.5 font-display text-xs uppercase tracking-wide text-white stamp-shadow-sm"
        @click="emit('close')"
      >
        Done
      </button>
    </footer>
  </div>
</template>
