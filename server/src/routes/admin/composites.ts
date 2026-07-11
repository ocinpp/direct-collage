import { Router } from "express";
import { prisma } from "../../db.js";
import { ApiError } from "../../lib/image.js";
import { storage } from "../../lib/storage-instance.js";
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
 * Sets status APPROVED (with reviewedAt) and pushes a composite:approved SSE
 * event to every client watching that wall (PRD §5 Phase 3 / §6.3.2).
 */
adminCompositesRouter.post(
  "/:id/approve",
  asyncHandler(async (req, res) => {
    const c = await loadWithWall(req.params.id);
    if (c.status === "REJECTED") {
      throw new ApiError(409, "Cannot approve a rejected composite");
    }
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
 * Soft-delete per PRD §6.2.3: the file is removed from storage, but the row is
 * kept with status=REJECTED so analytics counts stay accurate and the action
 * is auditable. Idempotent on the file deletion.
 */
adminCompositesRouter.post(
  "/:id/reject",
  asyncHandler(async (req, res) => {
    const c = await loadWithWall(req.params.id);
    if (c.status === "APPROVED") {
      throw new ApiError(409, "Cannot reject an approved composite");
    }
    await storage.delete(c.storageKey); // idempotent (no-op if already gone)
    const updated = await prisma.composite.update({
      where: { id: c.id },
      data: { status: "REJECTED", reviewedAt: new Date() },
    });
    res.json(toCompositeQueueDTO(updated));
  }),
);
