import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.js";
import { ApiError } from "../../lib/image.js";
import { toWallDTO } from "../../lib/dto.js";
import { asyncHandler, validateBody, bodyOf } from "../../middleware/validate.js";
import type { AspectRatio, WallStatus } from "@direct-collage/shared";

export const adminWallsRouter = Router();

const createSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase, digits, or hyphens"),
  name: z.string().min(1).max(80),
  title: z.string().max(120).nullable().optional(),
  aspectRatio: z.enum(["1:1", "4:5", "9:16"]).default("1:1"),
});

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  title: z.string().max(120).nullable().optional(),
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  aspectRatio: z.enum(["1:1", "4:5", "9:16"]).optional(),
  bgColor: z.string().nullable().optional(),
  textColor: z.string().nullable().optional(),
  headerLogo: z.string().nullable().optional(),
  scrollSpeed: z.number().int().min(0).max(300).nullable().optional(),
  maxPhotos: z.number().int().min(10).max(1000).nullable().optional(),
  displayMode: z
    .enum([
      "scrolling-grid",
      "fullscreen-showcase",
      "rotating-hero-bento",
      "scattered-polaroids",
      "flip-card-wave",
    ])
    .optional(),
});

adminWallsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const walls = await prisma.wall.findMany({ orderBy: { createdAt: "desc" } });
    res.json(walls.map(toWallDTO));
  }),
);

adminWallsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const wall = await prisma.wall.findUnique({ where: { id: req.params.id } });
    if (!wall) throw new ApiError(404, "Wall not found");
    res.json(toWallDTO(wall));
  }),
);

adminWallsRouter.post(
  "/",
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const body = bodyOf<z.infer<typeof createSchema>>(res);
    const wall = await prisma.wall.create({
      data: {
        slug: body.slug,
        name: body.name,
        title: body.title ?? null,
        aspectRatio: body.aspectRatio as AspectRatio,
      },
    });
    res.status(201).json(toWallDTO(wall));
  }),
);

adminWallsRouter.patch(
  "/:id",
  validateBody(patchSchema),
  asyncHandler(async (req, res) => {
    const body = bodyOf<z.infer<typeof patchSchema>>(res);
    const wall = await prisma.wall.update({
      where: { id: req.params.id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.title !== undefined && { title: body.title }),
        ...(body.status !== undefined && { status: body.status as WallStatus }),
        ...(body.aspectRatio !== undefined && { aspectRatio: body.aspectRatio as AspectRatio }),
        ...(body.bgColor !== undefined && { bgColor: body.bgColor }),
        ...(body.textColor !== undefined && { textColor: body.textColor }),
        ...(body.headerLogo !== undefined && { headerLogo: body.headerLogo }),
        ...(body.scrollSpeed !== undefined && { scrollSpeed: body.scrollSpeed }),
        ...(body.maxPhotos !== undefined && { maxPhotos: body.maxPhotos }),
        ...(body.displayMode !== undefined && { displayMode: body.displayMode }),
      },
    });
    res.json(toWallDTO(wall));
  }),
);

adminWallsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.wall.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);
