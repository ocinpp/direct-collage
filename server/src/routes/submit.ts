import { Router } from "express";
import multer from "multer";
import { prisma } from "../db.js";
import { storage } from "../lib/storage-instance.js";
import { validateComposite, ApiError } from "../lib/image.js";
import { toCompositeQueueDTO } from "../lib/dto.js";
import { asyncHandler } from "../middleware/validate.js";
import { env } from "../env.js";
import type { TemplateVariant } from "@direct-collage/shared";
import { TEMPLATES, ENABLED_TEMPLATES } from "@direct-collage/shared";

export const submitRouter = Router();

// In-memory multer (we validate before persisting; buffer is small, ≤3MB).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    // Loose MIME check; sharp re-verifies the actual decoded format.
    // Accept both JPEG MIME variants — the client always bakes to JPEG, so
    // WebP/PNG/etc source photos arrive here already converted.
    if (file.mimetype === "image/jpeg" || file.mimetype === "image/jpg") {
      cb(null, true);
    } else {
      cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
    }
  },
});

/**
 * POST /api/submit/:wallSlug
 * Multipart: composite_image (JPEG) + permission_granted + template_variant.
 *
 * The client bakes the composite; the server does NOT trust it and re-validates
 * format, dimensions, and aspect ratio via sharp (PRD §8.3).
 */
submitRouter.post(
  "/:wallSlug",
  upload.single("composite_image"),
  asyncHandler(async (req, res) => {
    const { wallSlug } = req.params;
    const file = req.file;
    if (!file) throw new ApiError(400, "Missing composite_image file");

    const permissionGranted = req.body.permission_granted === "true";
    if (!permissionGranted) {
      throw new ApiError(400, "Permission to display is required");
    }

    const templateVariant = req.body.template_variant as TemplateVariant;
    // Defense-in-depth: the client gate (ENABLED_TEMPLATES) hides disabled
    // variants from the picker, but a hand-crafted request could submit one.
    // Reject here so the gate is authoritative server-side too.
    if (!ENABLED_TEMPLATES.includes(templateVariant)) {
      throw new ApiError(400, `Unknown or disabled template_variant: ${templateVariant}`);
    }

    const wall = await prisma.wall.findUnique({ where: { slug: wallSlug } });
    if (!wall) throw new ApiError(404, "Wall not found");
    if (wall.status !== "ACTIVE") {
      throw new ApiError(409, "This wall is not accepting submissions right now");
    }

    const meta = await validateComposite(file.buffer, wall.aspectRatio as "1:1" | "4:5" | "9:16");

    const key = await storage.save(file.buffer, "jpg");
    const composite = await prisma.composite.create({
      data: {
        wallId: wall.id,
        storageKey: key,
        templateVariant,
        permissionGranted: true,
        width: meta.width,
        height: meta.height,
        status: "PENDING",
      },
    });

    res.status(201).json(toCompositeQueueDTO(composite));
  }),
);
