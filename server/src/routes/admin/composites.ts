import { Router } from "express";
import { prisma } from "../../db.js";
import { ApiError } from "../../lib/image.js";
import { sse } from "../../lib/sse.js";
import { toCompositePublicDTO, toCompositeQueueDTO } from "../../lib/dto.js";
import { asyncHandler } from "../../middleware/validate.js";

export const adminCompositesRouter = Router();

/** Load a composite + its wall, or 404. */
async function loadWithWall(id: string) {
  const composite = await prisma.composite.findUnique({
    where: { id },
    include: { wall: true },
  });
  if (!composite) throw new ApiError(404, "Composite not found");
  return composite;
}

/**
 * POST /api/admin/composites/:id/approve
 *
 * Sets status APPROVED and pushes a composite:approved SSE event to the wall.
 * Any status can transition to APPROVED — including REJECTED (re-approve
 * restores the photo to the wall). This gives the admin full control.
 */
adminCompositesRouter.post(
  "/:id/approve",
  asyncHandler(async (req, res) => {
    const c = await loadWithWall(req.params.id);
    const updated = await prisma.composite.update({
      where: { id: c.id },
      data: { status: "APPROVED", reviewedAt: new Date() },
    });

    sse.emitApproved(c.wall.slug, toCompositePublicDTO(updated));
    res.json(toCompositeQueueDTO(updated));
  }),
);

/**
 * POST /api/admin/composites/:id/reject
 *
 * Marks the composite as REJECTED. The file is NOT deleted — it stays on disk
 * so the composite can be re-approved later if the admin changes their mind.
 * Any status can transition to REJECTED, including APPROVED (pulls it from the
 * wall — no SSE event needed since the wall just stops showing it on next feed
 * refresh).
 */
adminCompositesRouter.post(
  "/:id/reject",
  asyncHandler(async (req, res) => {
    const c = await loadWithWall(req.params.id);
    const updated = await prisma.composite.update({
      where: { id: c.id },
      data: { status: "REJECTED", reviewedAt: new Date() },
    });
    res.json(toCompositeQueueDTO(updated));
  }),
);
