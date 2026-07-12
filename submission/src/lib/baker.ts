import { OUTPUT_DIMS, canvasToBlob } from "./image.js";

/**
 * Per-slot crop state set by the zoom/pan UI. The source image is drawn into
 * the slot's rect on the bake canvas according to this transform.
 *
 * Conceptually: scale=1 means the image just COVERS the slot at its natural
 * cover-fit. Higher scale = zoomed in (cropped tighter). Offset pans in SOURCE
 * pixels relative to that centered cover-fit position.
 */
export interface SlotTransform {
  /** 1.0 = cover-fit baseline. >1 = zoomed in. */
  scale: number;
  /** Pan offset in source pixels, relative to cover-fit center. */
  offsetX: number;
  offsetY: number;
}

export interface PreparedSource {
  url: string;
  width: number;
  height: number;
}

export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * THE single source of truth for how a source image maps into a slot.
 *
 * Used by BOTH:
 *  - bakeComposite() at full output resolution (1080px)
 *  - PhotoSlot's <canvas> preview at whatever CSS size the slot renders at
 *
 * Passing the same (img, slotRect, transform, canvasDims) into this function
 * guarantees what-you-see-is-what-you-get: the preview is a scaled-down
 * version of exactly what the baker will produce. Fixes the WYSIWYG mismatch
 * where the CSS-transform preview drifted from the drawImage bake math.
 *
 * Coordinate spaces:
 *  - slotRect: normalized (0..1) within a canvas of canvasDims
 *  - transform.offsetX/Y: SOURCE pixels
 *  - canvasDims: the target canvas dimensions in device pixels
 */
export function drawSlot(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  slotRect: NormalizedRect,
  transform: SlotTransform,
  canvasDims: { w: number; h: number },
  /**
   * If true (default), clip the draw to the slot rect — used by the baker and
   * by previews that want the slot to read as a self-contained cell. If false,
   * the image is drawn unclipped (can extend beyond the slot rect) — used by
   * the crop editor's dimmed "full photo" layer, which needs to show the parts
   * being cropped away outside the frame.
   */
  clip = true,
) {
  const rectX = slotRect.x * canvasDims.w;
  const rectY = slotRect.y * canvasDims.h;
  const rectW = slotRect.w * canvasDims.w;
  const rectH = slotRect.h * canvasDims.h;

  const srcW = "naturalWidth" in img ? img.naturalWidth : img.width;
  const srcH = "naturalHeight" in img ? img.naturalHeight : img.height;

  // Cover-fit: scale so the image fully covers the slot.
  const coverScale = Math.max(rectW / srcW, rectH / srcH);
  const drawScale = coverScale * transform.scale;
  const drawW = srcW * drawScale;
  const drawH = srcH * drawScale;

  // Center the image on the slot, then apply pan offset (in source px, scaled).
  const dx = rectX + (rectW - drawW) / 2 + transform.offsetX * drawScale;
  const dy = rectY + (rectH - drawH) / 2 + transform.offsetY * drawScale;

  ctx.save();
  if (clip) {
    ctx.beginPath();
    ctx.rect(rectX, rectY, rectW, rectH);
    ctx.clip();
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();
}

/**
 * Bake a composite: render N source images into a single canvas matching the
 * template's slot rectangles, then export as a JPEG (PRD §6.1.5).
 *
 * Uses drawSlot() — the SAME function the preview uses — so the baked output
 * matches the on-screen preview exactly.
 */
export async function bakeComposite(opts: {
  ratio: keyof typeof OUTPUT_DIMS;
  slots: NormalizedRect[];
  sources: (PreparedSource | null)[];
  transforms: SlotTransform[];
  jpegQuality?: number;
}): Promise<Blob> {
  const { w: outW, h: outH } = OUTPUT_DIMS[opts.ratio];
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  // Black background so any unfilled slot isn't transparent in the JPEG.
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, outW, outH);

  const images = await Promise.all(
    opts.sources.map((s) => (s ? loadHtmlImage(s.url) : null)),
  );

  for (let i = 0; i < opts.slots.length; i++) {
    const img = images[i];
    if (!img) continue;
    drawSlot(ctx, img, opts.slots[i]!, opts.transforms[i] ?? { scale: 1, offsetX: 0, offsetY: 0 }, { w: outW, h: outH });
  }

  return canvasToBlob(canvas, "image/jpeg", opts.jpegQuality ?? 0.85);
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}
