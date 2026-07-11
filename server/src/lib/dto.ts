import type { Composite as PrismaComposite, Wall as PrismaWall } from "@prisma/client";
import type {
  CompositePublicDTO,
  CompositeQueueDTO,
  WallPublicDTO,
  CompositeStatus,
  AspectRatio,
  TemplateVariant,
} from "@direct-collage/shared";
import { storage } from "./storage-instance.js";

/** Map a Prisma Wall row to the public DTO. */
export function toWallDTO(w: PrismaWall): WallPublicDTO {
  return {
    id: w.id,
    slug: w.slug,
    name: w.name,
    title: w.title,
    status: w.status as WallPublicDTO["status"],
    aspectRatio: w.aspectRatio as AspectRatio,
    bgColor: w.bgColor,
    headerLogo: w.headerLogo,
  };
}

/** Map a Prisma Composite row to the public (wall feed) DTO. */
export function toCompositePublicDTO(c: PrismaComposite): CompositePublicDTO {
  return {
    id: c.id,
    url: storage.url(c.storageKey),
    templateVariant: c.templateVariant as TemplateVariant,
    width: c.width,
    height: c.height,
    createdAt: c.createdAt.toISOString(),
  };
}

/** Map a Prisma Composite row to the admin queue DTO (includes status etc). */
export function toCompositeQueueDTO(c: PrismaComposite): CompositeQueueDTO {
  return {
    ...toCompositePublicDTO(c),
    wallId: c.wallId,
    status: c.status as CompositeStatus,
    permissionGranted: c.permissionGranted,
    reviewedAt: c.reviewedAt?.toISOString() ?? null,
  };
}
