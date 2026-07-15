/**
 * Span assignment for the scrolling grid wall mode.
 *
 * Only TWO span types (hero 2×2 and normal 1×1) — both preserve the wall's
 * aspect ratio, so no distortion regardless of the configured ratio.
 *
 * Hero at every 7th position (period 7, coprime with 3 and 5 column counts):
 *   At 5 cols: heroes at cols 0,2,4,1,3,0... (spirals through all columns)
 *   At 3 cols: heroes at cols 0,1,2,0... (visits every column)
 */

export type CellSpan = "hero" | "normal";

const SPAN_CLASSES: Record<CellSpan, string> = {
  hero: "col-span-2 row-span-2",
  normal: "",
};

export function spanForIndex(index: number): CellSpan {
  return index % 7 === 0 ? "hero" : "normal";
}

export function spanClassForIndex(index: number): string {
  return SPAN_CLASSES[spanForIndex(index)];
}

/**
 * Duplicate the item array for the seamless auto-scroll loop.
 *
 * The scroll translates content upward; when offset reaches one full copy's
 * height, we snap back to 0. Since copy 2 is identical to copy 1, the snap
 * is invisible. We do NOT pad with reused items (that caused duplicates when
 * the count changed). The loop point may have a sub-row misalignment (since
 * the span pattern period 7 doesn't evenly divide most item counts), but at
 * scroll speed this is imperceptible.
 */
export function padForLoop<T>(items: T[]): T[] {
  if (items.length === 0) return [];
  return [...items, ...items];
}
