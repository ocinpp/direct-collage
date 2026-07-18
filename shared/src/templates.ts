/**
 * Template geometry definitions.
 *
 * Each slot is a normalized rectangle {x, y, w, h} in 0..1 space, where the
 * full canvas is 1.0 x 1.0. The baker multiplies by the actual output pixel
 * dimensions (derived from the wall's aspect ratio) at render time.
 *
 * Slot geometry is aspect-ratio-agnostic by design: a slot defined as
 * {x:0, y:0, w:0.5, h:0.5} always covers the top-left quadrant regardless of
 * whether the canvas is 1080x1080 (1:1) or 1080x1350 (4:5). This keeps the
 * per-wall aspect-ratio setting independent of template layout.
 *
 * Source: PRD v2.6 §7 template table.
 */
import type { TemplateDef, TemplateVariant } from "./types.js";

function slot(index: number, x: number, y: number, w: number, h: number) {
  return { index, x, y, w, h };
}

export const TEMPLATES: Record<TemplateVariant, TemplateDef> = {
  // --- Solo: 1 image, full frame ---
  solo: {
    variant: "solo",
    label: "Solo",
    family: "Solo",
    slots: 1,
    default: true,
    rect: [slot(0, 0, 0, 1, 1)],
  },

  // --- Triad / Top-Big (default): 1 large top + 2 below ---
  // Row 1: 1 cell spanning full width, 50% height.
  // Row 2: 2 cells side by side, 50% width each, 50% height.
  "triad-topbig": {
    variant: "triad-topbig",
    label: "Triad — Top-Big",
    family: "Triad",
    slots: 3,
    default: true,
    rect: [
      slot(0, 0, 0, 1, 0.5), // top, full width
      slot(1, 0, 0.5, 0.5, 0.5), // bottom-left
      slot(2, 0.5, 0.5, 0.5, 0.5), // bottom-right
    ],
  },

  // --- Triad / Row: 1 large left + 2 side-by-side right ---
  "triad-row": {
    variant: "triad-row",
    label: "Triad — Row",
    family: "Triad",
    slots: 3,
    default: false,
    rect: [
      slot(0, 0, 0, 0.55, 1), // large, left
      slot(1, 0.55, 0, 0.225, 1), // right-1
      slot(2, 0.775, 0, 0.225, 1), // right-2
    ],
  },

  // --- Triad / Columns: 3 identical columns ---
  "triad-columns": {
    variant: "triad-columns",
    label: "Triad — Columns",
    family: "Triad",
    slots: 3,
    default: false,
    rect: [
      slot(0, 0, 0, 1 / 3, 1),
      slot(1, 1 / 3, 0, 1 / 3, 1),
      slot(2, 2 / 3, 0, 1 / 3, 1),
    ],
  },

  // --- Duo: 2 identical columns side-by-side ---
  "duo": {
    variant: "duo",
    label: "Duo",
    family: "Duo",
    slots: 2,
    default: true,
    rect: [
      slot(0, 0, 0, 0.5, 1),
      slot(1, 0.5, 0, 0.5, 1),
    ],
  },

  // --- Quad: 2x2 uniform grid ---
  quad: {
    variant: "quad",
    label: "Quad",
    family: "Quad",
    slots: 4,
    default: true,
    rect: [
      slot(0, 0, 0, 0.5, 0.5),
      slot(1, 0.5, 0, 0.5, 0.5),
      slot(2, 0, 0.5, 0.5, 0.5),
      slot(3, 0.5, 0.5, 0.5, 0.5),
    ],
  },

  // --- Pentagon / Top-Big (default): 1 large top + 2x2 below ---
  // Row 1: 1 cell spanning full width, 50% height.
  // Row 2 (bottom 50%): a 2x2 grid — 2 columns x 2 rows of 4 cells,
  // each 50% wide x 25% tall.
  "pentagon-topbig": {
    variant: "pentagon-topbig",
    label: "Pentagon — Top-Big",
    family: "Pentagon",
    slots: 5,
    default: true,
    rect: [
      slot(0, 0, 0, 1, 0.5), // top, full width
      slot(1, 0, 0.5, 0.5, 0.25), // bottom row 1, left
      slot(2, 0.5, 0.5, 0.5, 0.25), // bottom row 1, right
      slot(3, 0, 0.75, 0.5, 0.25), // bottom row 2, left
      slot(4, 0.5, 0.75, 0.5, 0.25), // bottom row 2, right
    ],
  },

  // --- Pentagon / Row: 1 large left + 4 side-by-side right ---
  "pentagon-row": {
    variant: "pentagon-row",
    label: "Pentagon — Row",
    family: "Pentagon",
    slots: 5,
    default: false,
    rect: [
      slot(0, 0, 0, 0.4, 1), // large, left
      slot(1, 0.4, 0, 0.15, 1),
      slot(2, 0.55, 0, 0.15, 1),
      slot(3, 0.7, 0, 0.15, 1),
      slot(4, 0.85, 0, 0.15, 1),
    ],
  },
};

/** All variants, in display order. */
export const ALL_TEMPLATES: TemplateDef[] = [
  TEMPLATES.solo,
  TEMPLATES.duo,
  TEMPLATES["triad-topbig"],
  TEMPLATES["triad-row"],
  TEMPLATES["triad-columns"],
  TEMPLATES.quad,
  TEMPLATES["pentagon-topbig"],
  TEMPLATES["pentagon-row"],
];

/** Look up a template by variant id. Throws if unknown (programming error). */
export function getTemplate(variant: TemplateVariant): TemplateDef {
  const t = TEMPLATES[variant];
  if (!t) throw new Error(`Unknown template variant: ${variant}`);
  return t;
}

/**
 * The variants exposed in the submission picker.
 *
 * Phase 2: all 7 variants enabled. Solo, Triad (3 layouts), Quad, Pentagon
 * (2 layouts). Kept as a single export so the gate is in one place — flip
 * entries off here to hide them from the picker and reject server-side.
 */
export const ENABLED_TEMPLATES: TemplateVariant[] = [
  "solo",
  "duo",
  "triad-topbig",
  "triad-row",
  "triad-columns",
  "quad",
  "pentagon-topbig",
  "pentagon-row",
];

/** Templates currently selectable in the submission portal. */
export function getEnabledTemplates(): TemplateDef[] {
  return ENABLED_TEMPLATES.map(getTemplate);
}
