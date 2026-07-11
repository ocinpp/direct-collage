import { Router } from "express";
import { prisma } from "../../db.js";
import { ApiError } from "../../lib/image.js";
import { asyncHandler } from "../../middleware/validate.js";
import type { WallAnalyticsDTO } from "@direct-collage/shared";

export const adminAnalyticsRouter = Router();

/** GET /api/admin/analytics/:wallId — per-wall counts (PRD §6.2.4). */
adminAnalyticsRouter.get(
  "/:wallId",
  asyncHandler(async (req, res) => {
    const wall = await prisma.wall.findUnique({ where: { id: req.params.wallId } });
    if (!wall) throw new ApiError(404, "Wall not found");

    // Group by status in one query; faster than 4 separate counts.
    const grouped = await prisma.composite.groupBy({
      by: ["status"],
      where: { wallId: wall.id },
      _count: { _all: true },
    });

    const counts: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const g of grouped) counts[g.status] = g._count._all;

    const dto: WallAnalyticsDTO = {
      wallId: wall.id,
      total: counts.PENDING + counts.APPROVED + counts.REJECTED,
      approved: counts.APPROVED,
      rejected: counts.REJECTED,
      pending: counts.PENDING,
    };
    res.json(dto);
  }),
);
