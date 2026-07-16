/**
 * Core domain types shared across server + all frontends.
 * No runtime code here — these are consumed as TS types only.
 */

/** Output aspect ratio for composites on a wall. Per-wall configurable. */
export type AspectRatio = "1:1" | "4:5" | "9:16";

/** Wall lifecycle status. */
export type WallStatus = "ACTIVE" | "PAUSED";

/**
 * Wall display mode — how approved composites are rendered on the media wall.
 * Admin-configurable per wall (PRD §6.3.4 / display modes extension).
 */
export type DisplayMode =
  | "scrolling-grid"
  | "fullscreen-showcase"
  | "rotating-hero-bento"
  | "scattered-polaroids"
  | "flip-card-wave";

/** Human-readable labels for each display mode (for admin selectors). */
export const DISPLAY_MODE_LABELS: Record<DisplayMode, string> = {
  "scrolling-grid": "Scrolling Grid",
  "fullscreen-showcase": "Fullscreen Showcase",
  "rotating-hero-bento": "Rotating Hero Bento",
  "scattered-polaroids": "Scattered Polaroids",
  "flip-card-wave": "Flip Card Wave",
};

/** Composite moderation status. */
export type CompositeStatus = "PENDING" | "APPROVED" | "REJECTED";

/**
 * Template variant identifiers.
 * Format: `<family>-<variant>`. Solo and Quad have a single layout and use
 * the bare family name. See shared/src/templates.ts for geometry.
 *
 *   solo              — 1 image, full frame
 *   triad-topbig      — 3 images: 1 large top + 2 below (default)
 *   triad-row         — 3 images: 1 large left + 2 side-by-side right
 *   triad-columns     — 3 images: 3 identical columns
 *   quad              — 4 images: 2x2 uniform
 *   pentagon-topbig   — 5 images: 1 large top + 2x2 below (default)
 *   pentagon-row      — 5 images: 1 large left + 4 side-by-side right
 */
export type TemplateVariant =
  | "solo"
  | "triad-topbig"
  | "triad-row"
  | "triad-columns"
  | "quad"
  | "pentagon-topbig"
  | "pentagon-row";

/** A single slot inside a template (normalized 0..1 coordinates). */
export interface TemplateSlot {
  /** Unique index within the template, matches the upload slot order. */
  index: number;
  /** Normalized x position of the slot's top-left corner (0..1). */
  x: number;
  /** Normalized y position of the slot's top-left corner (0..1). */
  y: number;
  /** Normalized width (0..1) of the slot. */
  w: number;
  /** Normalized height (0..1) of the slot. */
  h: number;
}

/** Static definition of a template variant. */
export interface TemplateDef {
  variant: TemplateVariant;
  /** Human-readable label, e.g. "Triad — Top-Big". */
  label: string;
  /** Template family for grouping in the picker. */
  family: "Solo" | "Triad" | "Quad" | "Pentagon";
  /** Number of photo slots. */
  slots: number;
  /** Is this the default variant for its family? */
  default: boolean;
  /** Slot rectangles in normalized coordinates (0..1). */
  rect: TemplateSlot[];
}

// ---------------------------------------------------------------------------
// API shapes (request/response). Kept here so client + server agree.
// ---------------------------------------------------------------------------

/** Public Wall config returned by GET /api/walls/:slug. */
export interface WallPublicDTO {
  id: string;
  slug: string;
  name: string;
  /** User-facing display title shown at the top of the wall. May be null. */
  title: string | null;
  status: WallStatus;
  aspectRatio: AspectRatio;
  bgColor: string | null;
  headerLogo: string | null;
  /** Auto-scroll speed in px/sec (null = default). */
  scrollSpeed: number | null;
  /** How approved composites are displayed on the media wall. */
  displayMode: DisplayMode;
}

/** Composite as returned to the wall feed / SSE event. */
export interface CompositePublicDTO {
  id: string;
  /** Absolute or relative URL to the baked JPEG. */
  url: string;
  templateVariant: TemplateVariant;
  /** Server-validated pixel dimensions. */
  width: number;
  height: number;
  createdAt: string;
}

/** Composite as shown in the admin moderation queue. */
export interface CompositeQueueDTO extends CompositePublicDTO {
  wallId: string;
  status: CompositeStatus;
  permissionGranted: boolean;
  reviewedAt: string | null;
}

/** Per-wall basic counts for the analytics view. */
export interface WallAnalyticsDTO {
  wallId: string;
  total: number;
  approved: number;
  rejected: number;
  pending: number;
}

/** Payload shape for the submit request (multipart on the wire). */
export interface SubmitPayload {
  wallSlug: string;
  templateVariant: TemplateVariant;
  permissionGranted: boolean;
  // composite_image is sent as a multipart file, not in the JSON body.
}

/** SSE event names pushed from server -> wall client. */
export const SSE_EVENTS = {
  HELLO: "hello",
  COMPOSITE_APPROVED: "composite:approved",
} as const;
