import { Router, type Request, type Response } from "express";
import { prisma } from "../db.js";
import { ApiError } from "../lib/image.js";
import { sse } from "../lib/sse.js";
import { toCompositePublicDTO, toWallDTO } from "../lib/dto.js";
import { asyncHandler } from "../middleware/validate.js";

export const wallsRouter = Router();

/** GET /api/walls/:slug — public wall config (used by submission + wall). */
wallsRouter.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const wall = await prisma.wall.findUnique({ where: { slug: req.params.slug } });
    if (!wall) throw new ApiError(404, "Wall not found");
    res.json(toWallDTO(wall));
  }),
);

/** GET /api/walls/:slug/feed — approved composites, newest-first. */
wallsRouter.get(
  "/:slug/feed",
  asyncHandler(async (req, res) => {
    const wall = await prisma.wall.findUnique({ where: { slug: req.params.slug } });
    if (!wall) throw new ApiError(404, "Wall not found");

    const rows = await prisma.composite.findMany({
      where: { wallId: wall.id, status: "APPROVED" },
      orderBy: { reviewedAt: "desc" },
    });
    res.json(rows.map(toCompositePublicDTO));
  }),
);

/**
 * GET /api/walls/:slug/stream — SSE push channel for the wall.
 *
 * The wall client opens an EventSource to this endpoint. It only receives
 * events (hello on connect; composite:approved on admin action). The initial
 * feed is fetched separately via /feed so SSE stays purely for *new* events.
 */
wallsRouter.get("/:slug/stream", (req: Request, res: Response) => {
  // We need to confirm the wall exists before holding the connection open.
  prisma.wall
    .findUnique({ where: { slug: req.params.slug } })
    .then((wall) => {
      if (!wall) {
        res.status(404).json({ error: "Wall not found" });
        return;
      }
      const unsubscribe = sse.add(wall.slug, res);
      req.on("close", unsubscribe);
    })
    .catch(() => {
      // Unexpected DB error — surface as 500 and end the response.
      if (!res.headersSent) res.status(500).json({ error: "Stream init failed" });
    });
});
