import loadImage from "blueimp-load-image";

/**
 * Output dimensions per aspect ratio (must match the server's validator).
 * The slot in the bake canvas uses these.
 */
export const OUTPUT_DIMS = {
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
  "9:16": { w: 1080, h: 1920 },
} as const;

/**
 * Load a user-selected photo, apply EXIF orientation, and downsample to a
 * working resolution. This is the PRD §6.1.2 pre-processing step — it runs
 * BEFORE the photo enters the crop UI, so:
 *
 *  1. The user sees the photo correctly oriented (drawImage ignores EXIF).
 *  2. We avoid holding 5 × 40MP decoded images in memory on mobile, which
 *     would crash the tab (notably iOS Safari).
 *
 * The cap is the larger of (a) the output canvas dimension × the 1.2×
 * oversample headroom, or (b) a safe absolute max. Anything larger than that
 * is wasted memory because the bake canvas can't use the extra pixels anyway.
 */
export interface PreparedImage {
  /** Object URL for the normalized image — revoke when done. */
  url: string;
  width: number;
  height: number;
}

/**
 * How large the prepared source should be relative to the slot it fills.
 *
 * The PRD §6.1.4 zoom-limit formula caps zoom at ~1.2× past native 1:1
 * (source px per slot px). For that to give the user meaningful zoom range,
 * the prepared source must be several times the slot size — otherwise the
 * source is barely larger than the slot and zoom tops out near 1×.
 *
 * A factor of 4× gives a zoom slider range of ~4.8× past cover-fit for a
 * square-in-square fit, which feels right (zoom from "whole photo" to ~20%
 * of it). We still keep an absolute ceiling so 5× 40MP photos don't OOM iOS.
 */
const SLOT_SCALE_FACTOR = 4;
const ABSOLUTE_MAX_EDGE = 3000; // ceiling to keep peak memory sane on mobile

export async function prepareImage(
  file: File,
  maxSlotEdge: number,
): Promise<PreparedImage> {
  const cap = Math.min(
    Math.round(maxSlotEdge * SLOT_SCALE_FACTOR),
    ABSOLUTE_MAX_EDGE,
  );

  // blueimp-load-image: parse EXIF, orient, and optionally downscale.
  const result = await loadImage(file, {
    orientation: true, // apply EXIF orientation
    maxWidth: cap,
    maxHeight: cap,
    canvas: true, // return a <canvas>, not an <img>
    cover: false, // preserve aspect ratio when downscaling
    imageSmoothingQuality: "high",
  });

  const canvas = result.image as HTMLCanvasElement;
  if (!canvas || canvas.width === 0 || canvas.height === 0) {
    throw new Error("Could not decode image");
  }

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);

  return {
    url: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
  };
}

/** Largest output edge any single slot could occupy, for a given template/ratio. */
export function maxSlotEdge(
  templateSlots: { x: number; y: number; w: number; h: number }[],
  ratio: keyof typeof OUTPUT_DIMS,
): number {
  const { w, h } = OUTPUT_DIMS[ratio];
  let max = 0;
  for (const s of templateSlots) {
    const slotW = Math.round(s.w * w);
    const slotH = Math.round(s.h * h);
    max = Math.max(max, slotW, slotH);
  }
  return max;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/jpeg",
  quality = 0.85,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      type,
      quality,
    );
  });
}
