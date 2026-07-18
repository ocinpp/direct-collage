import { Router } from "express";
import { prisma } from "../../db.js";
import { ApiError } from "../../lib/image.js";
import { toCompositeQueueDTO } from "../../lib/dto.js";
import { asyncHandler } from "../../middleware/validate.js";
import type { Prisma } from "@prisma/client";

export const adminQueueRouter = Router();

const ALLOWED_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);
const DEFAULT_PAGE_SIZE = 50;

/**
 * GET /api/admin/queue/:wallId?status=PENDING&before=2026-07-18T...&limit=50
 *
 * Cursor-based pagination. Returns a page of composites + a `nextCursor`
 * timestamp for fetching the next page.
 *
 * Ordering:
 *   PENDING    → createdAt ASC (oldest first = queue order)
 *   APPROVED   → reviewedAt DESC (most recently approved first)
 *   REJECTED   → reviewedAt DESC (most recently rejected first)
 *
 * Cursor (`before`): an ISO timestamp. For ASC ordering (PENDING), fetches
 * items with createdAt > cursor (newer than the cursor). For DESC ordering,
 * fetches items with reviewedAt < cursor (older than the cursor).
 *
 * The poll always fetches page 1 (no cursor). "Load more" appends the next
 * page using the returned nextCursor.
 *
 * Response shape: { items: [...], nextCursor: string | null }
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

    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE, 1),
      200,
    );

    const sortField = status === "PENDING" ? "createdAt" : "reviewedAt";
    const ascending = status === "PENDING";
    const orderBy: Prisma.CompositeOrderByWithRelationInput = {
      [sortField]: ascending ? "asc" : "desc",
    };

    // Build the cursor condition: filter items before/after the cursor.
    const where: Prisma.CompositeWhereInput = { wallId: wall.id, status };
    const cursorRaw = typeof req.query.before === "string" ? req.query.before : undefined;
    if (cursorRaw) {
      const cursorDate = new Date(cursorRaw);
      if (!isNaN(cursorDate.getTime())) {
        where[sortField] = ascending
          ? { gt: cursorDate }   // PENDING: items newer than cursor
          : { lt: cursorDate };  // APPROVED/REJECTED: items older than cursor
      }
    }

    // Fetch limit + 1 to check if there's a next page.
    const rows = await prisma.composite.findMany({
      where,
      orderBy,
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const items = page.map(toCompositeQueueDTO);

    // nextCursor = the sort-field value of the last item in THIS page.
    // Only set if hasMore (the +1 item confirmed more exist). This avoids
    // the "stale Load more button" when the cursor lands on a timestamp
    // boundary.
    let nextCursor: string | null = null;
    if (hasMore && page.length > 0) {
      const last = page[page.length - 1]!;
      const lastDate = last[sortField] as Date | null;
      if (lastDate) nextCursor = lastDate.toISOString();
    }

    res.json({ items, nextCursor });
  }),
);
