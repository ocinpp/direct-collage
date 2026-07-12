import { computed, ref, type Ref } from "vue";
import type { AspectRatio, TemplateSlot } from "@direct-collage/shared";
import { OUTPUT_DIMS, type PreparedImage } from "../lib/image.js";
import type { SlotTransform } from "../lib/baker.js";

/**
 * Shared crop/zoom/pan logic for a single slot.
 *
 * Extracted from PhotoSlot so the full-screen SlotEditor and any future
 * preview can share the exact same gesture handling and clamp math without
 * duplicating the PRD §6.1.4 zoom-limit logic or the pan-cover clamping.
 *
 * State (pointers, last position) is internal; the caller passes the current
 * `transform` (owned by the store) and receives `onChange` callbacks with the
 * new clamped transform.
 */
export function useCropZoom(opts: {
  slot: Ref<TemplateSlot>;
  source: Ref<PreparedImage | null>;
  transform: Ref<SlotTransform>;
  ratio: Ref<AspectRatio>;
  canvasRef: Ref<HTMLCanvasElement | null>;
  onChange: (t: SlotTransform) => void;
  /**
   * The output-pixel dimension the canvas CSS box represents, along its width.
   * Used to convert CSS drag deltas into source-pixel pan offsets.
   *
   * - Grid thumbnail: the canvas represents the SLOT's output area, so pass
   *   slotOutW (= slot.w * OUTPUT_DIMS[ratio].w).
   * - Full-screen editor: the square canvas represents the WHOLE output canvas
   *   (e.g. 1080 for a 1:1 wall), so pass OUTPUT_DIMS[ratio].w regardless of
   *   the slot's own width. Otherwise narrow-stripe slots get a tiny x-factor
   *   and horizontal pan crawls.
   */
  canvasOutputWidth: Ref<number>;
}) {
  const { slot, source, transform, ratio, canvasRef, onChange } = opts;

  function slotOutDims() {
    const { w: outW, h: outH } = OUTPUT_DIMS[ratio.value];
    return { slotOutW: slot.value.w * outW, slotOutH: slot.value.h * outH };
  }

  /**
   * Max zoom scale (cover-relative), per PRD §6.1.4.
   * See PhotoSlot.vue's original doc for the full derivation.
   */
  const maxScale = computed(() => {
    if (!source.value) return 1;
    const { slotOutW, slotOutH } = slotOutDims();
    const absMax =
      Math.min(source.value.width / slotOutW, source.value.height / slotOutH) * 1.2;
    const coverScale = Math.max(
      slotOutW / source.value.width,
      slotOutH / source.value.height,
    );
    return Math.max(1.05, absMax / coverScale);
  });

  const zoomPct = computed(() =>
    Math.round(((transform.value.scale - 1) / (maxScale.value - 1 || 1)) * 100),
  );

  /** Clamp pan so the image always fully covers the slot (no black edges). */
  function clampOffset(t: SlotTransform): SlotTransform {
    if (!source.value) return t;
    const { slotOutW, slotOutH } = slotOutDims();
    const coverScale = Math.max(
      slotOutW / source.value.width,
      slotOutH / source.value.height,
    );
    const drawScale = coverScale * t.scale;
    const drawW = source.value.width * drawScale;
    const drawH = source.value.height * drawScale;
    const maxX = drawW > slotOutW ? (drawW - slotOutW) / (2 * drawScale) : 0;
    const maxY = drawH > slotOutH ? (drawH - slotOutH) / (2 * drawScale) : 0;
    return {
      ...t,
      offsetX: Math.max(-maxX, Math.min(maxX, t.offsetX)),
      offsetY: Math.max(-maxY, Math.min(maxY, t.offsetY)),
    };
  }

  function clampScale(s: number) {
    return Math.min(maxScale.value, Math.max(1, s));
  }

  /**
   * Convert a CSS-pixel drag delta into SOURCE-pixel offset units so the image
   * tracks the finger ~1:1 on screen (× PAN_FRICTION for feel).
   *
   * The image is drawn at a single uniform drawScale (source px → output px),
   * so panning must feel IDENTICAL in both directions. Earlier this computed
   * separate sx/sy factors from slotOutW/slotOutH, which made horizontal pan
   * crawl on narrow-stripe slots (slotOutW tiny → sx tiny). Now we use ONE
   * isotropic factor derived from the canvas's actual CSS width and the output
   * dimension it represents (canvasOutputWidth).
   */
  const PAN_FRICTION = 0.85;
  function cssToSourceDelta(dxCss: number, dyCss: number) {
    const canvas = canvasRef.value;
    if (!canvas || !source.value) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const { slotOutW, slotOutH } = slotOutDims();
    const coverScale = Math.max(
      slotOutW / source.value.width,
      slotOutH / source.value.height,
    );
    const drawScale = coverScale * transform.value.scale;
    // output px per CSS px — isotropic. canvasOutputWidth tells us how many
    // output px the canvas's CSS width represents.
    const outPerCss = opts.canvasOutputWidth.value / rect.width;
    // source px per CSS px = outputPerCss / drawScale.
    const s = (outPerCss / drawScale) * PAN_FRICTION;
    return { x: dxCss * s, y: dyCss * s };
  }

  // --- Pointer state: 1 finger pans, 2 fingers pinch-zoom ---
  const pointers = ref<Map<number, { x: number; y: number }>>(new Map());
  const lastPos = ref({ x: 0, y: 0 });
  let lastPinchDist = 0;

  function pinchDistance() {
    const [a, b] = [...pointers.value.values()];
    if (!a || !b) return 0;
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function onPointerDown(e: PointerEvent) {
    if (!source.value) return;
    pointers.value.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.value.size === 2) {
      lastPinchDist = pinchDistance();
    } else if (pointers.value.size === 1) {
      lastPos.value = { x: e.clientX, y: e.clientY };
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!source.value) return;
    if (!pointers.value.has(e.pointerId)) return;
    pointers.value.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.value.size >= 2) {
      const dist = pinchDistance();
      if (lastPinchDist > 0) {
        const factor = dist / lastPinchDist;
        const newScale = clampScale(transform.value.scale * factor);
        onChange(clampOffset({ ...transform.value, scale: newScale }));
      }
      lastPinchDist = dist;
      return;
    }

    const dx = e.clientX - lastPos.value.x;
    const dy = e.clientY - lastPos.value.y;
    lastPos.value = { x: e.clientX, y: e.clientY };
    const src = cssToSourceDelta(dx, dy);
    onChange(
      clampOffset({
        ...transform.value,
        offsetX: transform.value.offsetX + src.x,
        offsetY: transform.value.offsetY + src.y,
      }),
    );
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

  /** Zoom slider change handler. */
  function onZoomInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const pct = Number(target.value) / 100;
    const scale = 1 + pct * (maxScale.value - 1);
    onChange(clampOffset({ ...transform.value, scale }));
  }

  return {
    maxScale,
    zoomPct,
    clampOffset,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onZoomInput,
  };
}
