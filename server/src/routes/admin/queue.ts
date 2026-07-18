import { Router } from "express";
import { prisma } from "../../db.js";
import { ApiError } from "../../lib/image.js";
import { toCompositeQueueDTO } from "../../lib/dto.js";
import { asyncHandler } from "../../middleware/validate.js";
import type { Prisma } from "@prisma/client";

export const adminQueueRouter = Router();

const ALLOWED_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);

/**
 * GET /api/admin/queue/:wallId?status=PENDING|APPROVED|REJECTED
 *
 * Returns composites for the wall filtered by status. Default: PENDING.
 * Ordering: PENDING = oldest first (queue order); APPROVED/REJECTED = most
 * recently reviewed first.
 */
adminQueueRouter.get(
  "/:wallId",
  asyncHandler(async (req, res) => {
    const wall = await prisma.wall.findUnique({ where: { id: req.params.wallId } });
    if (!wall) throw new ApiError(404, "Wall not found");

    const status = typeof req.query.status === "string" ? req.query.status : "PENDING";
    if (!ALLOWED_STATUSES.has(status)) {
      throw new ApiError(400, `Invalid status. Allowed: ${[...ALLOWED_STATUSES].join(", ")}`);
    }

    const orderBy: Prisma.CompositeOrderByWithRelationInput =
      status === "PENDING" ? { createdAt: "asc" } : { reviewedAt: "desc" };

    const rows = await prisma.composite.findMany({
      where: { wallId: wall.id, status },
      orderBy,
    });
    res.json(rows.map(toCompositeQueueDTO));
  }),
);
