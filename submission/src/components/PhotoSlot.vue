<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { TemplateSlot } from "@direct-collage/shared";
import type { PreparedImage } from "../lib/image.js";
import { drawSlot, type SlotTransform } from "../lib/baker.js";

const props = defineProps<{
  slot: TemplateSlot;
  source: PreparedImage | null;
  transform: SlotTransform;
  active: boolean;
}>();

const emit = defineEmits<{
  pick: [slotIndex: number];
  change: [slotIndex: number, transform: SlotTransform];
  remove: [slotIndex: number];
}>();

// --- Preview canvas (WYSIWYG with the baker) ---
const canvasRef = ref<HTMLCanvasElement | null>(null);
const imgEl = ref<HTMLImageElement | null>(null);

/**
 * Max zoom scale (cover-relative), per PRD §6.1.4.
 *
 * Worked example (source 2160×2160, Solo slot 1080×1080):
 *   absMax     = min(srcW/slotW, srcH/slotH) * 1.2 = min(2,2)*1.2 = 2.4
 *   coverScale = max(slotW/srcW, slotH/srcH)       = 0.5  (image shrunk to cover)
 *   maxS       = absMax / coverScale                = 2.4 / 0.5 = 4.8
 *
 * So the slider ranges from cover-fit (1.0, whole image visible) up to 4.8×
 * (zoomed to ~20% of the source — 1.2× past native 1:1 pixel mapping). The
 * `* 1.2` is the PRD's oversample headroom; below absMax=coverScale the
 * source is already pixelating at cover, so we floor accordingly.
 */
const maxScale = computed(() => {
  if (!props.source) return 1;
  const slotOutW = props.slot.w * 1080;
  const slotOutH = props.slot.h * 1080;
  const absMax = Math.min(props.source.width / slotOutW, props.source.height / slotOutH) * 1.2;
  const coverScale = Math.max(slotOutW / props.source.width, slotOutH / props.source.height);
  return Math.max(1.05, absMax / coverScale);
});

const zoomPct = computed(() =>
  Math.round(((props.transform.scale - 1) / (maxScale.value - 1 || 1)) * 100),
);

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
 * Render the preview using drawSlot() — the EXACT same math as the baker.
 * The canvas is sized to the slot's CSS pixels (times devicePixelRatio for
 * sharpness), and drawSlot maps the normalized rect into it.
 */
function renderPreview() {
  const canvas = canvasRef.value;
  const img = imgEl.value;
  if (!canvas || !img || !props.source) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  // The canvas represents a SQUARE region of the output canvas (the slot's
  // own rect). We draw the source into a canvas whose aspect = slot aspect,
  // sized to CSS * dpr. drawSlot gets a normalized rect of {0,0,1,1} and the
  // canvas dims.
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

// Re-render whenever the source or transform changes.
watch(() => [props.source, props.transform], loadSource, { deep: true });
onMounted(() => loadSource());

// Re-render on resize (responsive layout can change slot CSS size).
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

// --- Multi-touch gestures: one finger pans, two fingers pinch-to-zoom ---
/**
 * Track up to 2 active pointers by pointerId so we can distinguish pan
 * (1 finger) from pinch (2 fingers). Pointer Events unify touch + mouse, so
 * this also works with a mouse (though pinch needs two pointers).
 */
const pointers = ref<Map<number, { x: number; y: number }>>(new Map());
/** Last position of the (single) panning finger, for computing pan delta. */
const lastPos = ref({ x: 0, y: 0 });
/** Last distance between the two fingers, for computing pinch delta. */
let lastPinchDist = 0;

function pinchDistance() {
  const [a, b] = [...pointers.value.values()];
  if (!a || !b) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function clampScale(s: number) {
  return Math.min(maxScale.value, Math.max(1, s));
}

/**
 * Convert a CSS-pixel drag delta into SOURCE-pixel offset units so the image
 * tracks the finger 1:1 on screen.
 *
 * The chain: a finger moves `dCss` CSS px. That maps to `dCss * dpr` device
 * px on the preview canvas. The preview canvas (device px) represents the
 * slot's OUTPUT pixel area, so that's `dCss * dpr * (slotOutW / canvasW)`
 * output px. drawSlot applies the offset as `offset * drawScale` to get output
 * px, so the source-pixel delta we need is `outputDelta / drawScale`.
 *
 * Simplifying (canvasW ≈ rect.width * dpr → dpr cancels):
 *   sourceDelta = dCss * (slotOutW / rect.width) / drawScale
 * where drawScale = coverScale * transform.scale.
 *
 * Earlier we multiplied by `scale` instead of dividing — that's why the image
 * raced the finger (factor ~3.6× at Solo, scale 1). The PAN_FRICTION constant
 * below lets us dial the feel below strict 1:1 if it still reads "twitchy".
 */
const PAN_FRICTION = 0.85;

function cssToSourceDelta(dxCss: number, dyCss: number) {
  const canvas = canvasRef.value;
  if (!canvas || !props.source) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
  const slotOutW = props.slot.w * 1080;
  const slotOutH = props.slot.h * 1080;
  // drawScale in drawSlot = coverScale * transform.scale, where coverScale is
  // how much the source is shrunk to just cover the slot (output/source).
  const coverScale = Math.max(
    slotOutW / props.source.width,
    slotOutH / props.source.height,
  );
  const drawScale = coverScale * props.transform.scale;
  const sx = (slotOutW / rect.width / drawScale) * PAN_FRICTION;
  const sy = (slotOutH / rect.height / drawScale) * PAN_FRICTION;
  return { x: dxCss * sx, y: dyCss * sy };
}

function onPointerDown(e: PointerEvent) {
  if (!props.source) return;
  pointers.value.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.value.size === 2) {
    // Entering pinch mode: seed the baseline distance.
    lastPinchDist = pinchDistance();
  } else if (pointers.value.size === 1) {
    lastPos.value = { x: e.clientX, y: e.clientY };
  }
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!props.source) return;
  if (!pointers.value.has(e.pointerId)) return;
  pointers.value.set(e.pointerId, { x: e.clientX, y: e.clientY });

  // Two fingers → pinch-to-zoom.
  if (pointers.value.size >= 2) {
    const dist = pinchDistance();
    if (lastPinchDist > 0) {
      // Scale factor = ratio of finger-distance change.
      const factor = dist / lastPinchDist;
      const newScale = clampScale(props.transform.scale * factor);
      // Translate the slider-equivalent: emit the new scale.
      emit("change", props.slot.index, { ...props.transform, scale: newScale });
    }
    lastPinchDist = dist;
    return;
  }

  // One finger → pan (same as before).
  const dx = e.clientX - lastPos.value.x;
  const dy = e.clientY - lastPos.value.y;
  lastPos.value = { x: e.clientX, y: e.clientY };
  const src = cssToSourceDelta(dx, dy);
  emit("change", props.slot.index, {
    ...props.transform,
    offsetX: props.transform.offsetX + src.x,
    offsetY: props.transform.offsetY + src.y,
  });
}

function onPointerUp(e: PointerEvent) {
  pointers.value.delete(e.pointerId);
  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  if (pointers.value.size < 2) lastPinchDist = 0;
  if (pointers.value.size === 1) {
    const [p] = [...pointers.value.values()];
    if (p) lastPos.value = { x: p.x, y: p.y };
  }
}

function onZoom(e: Event) {
  const target = e.target as HTMLInputElement;
  const pct = Number(target.value) / 100;
  const scale = 1 + pct * (maxScale.value - 1);
  emit("change", props.slot.index, {
    ...props.transform,
    scale,
  });
}

function onPick() {
  emit("pick", props.slot.index);
}
</script>

<template>
  <div
    class="relative h-full w-full overflow-hidden rounded-lg border-2 transition-colors"
    :class="active ? 'border-brand-500' : 'border-transparent'"
  >
    <!-- Filled: canvas preview (WYSIWYG with baker), draggable to pan -->
    <canvas
      v-if="source"
      ref="canvasRef"
      class="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />

    <!-- Empty: tap to pick -->
    <button
      v-else
      type="button"
      class="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
      @click="onPick"
    >
      <span class="text-4xl leading-none">+</span>
      <span class="text-xs">Add photo</span>
    </button>

    <!-- Remove button (sibling, not child, of the drag surface) -->
    <button
      v-if="source"
      class="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-lg font-semibold text-white hover:bg-black/80"
      type="button"
      aria-label="Remove photo"
      @click="emit('remove', slot.index)"
    >
      ✕
    </button>

    <!--
      Zoom slider (sibling of drag surface; stops pointer propagation).
      Kept as a fine-tune control alongside pinch-to-zoom. Track + thumb are
      sized up so the thumb is a comfortable touch target on mobile.
    -->
    <div
      v-if="source"
      class="absolute inset-x-2 bottom-2 z-10 flex items-center gap-2 rounded bg-black/50 px-2 py-1.5"
    >
      <span class="text-[10px] tabular-nums text-neutral-300">−</span>
      <input
        type="range"
        min="0"
        max="100"
        :value="zoomPct"
        class="dc-zoom-slider h-6 flex-1"
        @input="onZoom"
        @pointerdown.stop
      />
      <span class="text-[10px] tabular-nums text-neutral-300">+</span>
    </div>
  </div>
</template>
