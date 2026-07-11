import { Router } from "express";
import { prisma } from "../../db.js";
import { ApiError } from "../../lib/image.js";
import { toCompositeQueueDTO } from "../../lib/dto.js";
import { asyncHandler } from "../../middleware/validate.js";

export const adminQueueRouter = Router();

/** GET /api/admin/queue/:wallId — pending composites for moderation. */
adminQueueRouter.get(
  "/:wallId",
  asyncHandler(async (req, res) => {
    // Make sure the wall exists and return 404 cleanly if not.
    const wall = await prisma.wall.findUnique({ where: { id: req.params.wallId } });
    if (!wall) throw new ApiError(404, "Wall not found");

    const rows = await prisma.composite.findMany({
      where: { wallId: wall.id, status: "PENDING" },
      orderBy: { createdAt: "asc" }, // oldest first = queue order
    });
    res.json(rows.map(toCompositeQueueDTO));
  }),
);
