import sharp from "sharp";
import type { AspectRatio } from "@direct-collage/shared";
import { env } from "../env.js";

export interface ImageMeta {
  width: number;
  height: number;
  /** "jpeg" | "png" | ... — sharp's detected format. */
  format: string;
}

/** Expected output dimensions for a wall's configured aspect ratio. */
export function expectedDimsFor(ratio: AspectRatio): {
  width: number;
  height: number;
} {
  switch (ratio) {
    case "1:1":
      return { width: 1080, height: 1080 };
    case "4:5":
      return { width: 1080, height: 1350 };
    case "9:16":
      return { width: 1080, height: 1920 };
  }
}

/**
 * Decode + validate an uploaded buffer (PRD §8.3: don't trust the client).
 *
 * Checks:
 *  - Decodable as a real image (rejects renamed arbitrary files).
 *  - MIME is JPEG.
 *  - Dimensions within the tolerance band for the wall's aspect ratio.
 *
 * Throws ApiError (4xx) on any failure.
 */
export async function validateComposite(
  buf: Buffer,
  ratio: AspectRatio,
): Promise<ImageMeta> {
  if (buf.byteLength > env.maxUploadBytes) {
    throw badUpload(`File exceeds ${env.maxUploadBytes} bytes`);
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(buf).metadata();
  } catch {
    throw badUpload("File is not a decodable image");
  }

  if (meta.format !== "jpeg") {
    throw badUpload(`Expected JPEG, got ${meta.format ?? "unknown"}`);
  }
  if (!meta.width || !meta.height) {
    throw badUpload("Image has no decodable dimensions");
  }

  const expected = expectedDimsFor(ratio);
  const tol = env.aspectTolerance;
  const minW = expected.width * (1 - tol);
  const maxW = expected.width * (1 + tol);
  const minH = expected.height * (1 - tol);
  const maxH = expected.height * (1 + tol);

  if (meta.width < minW || meta.width > maxW) {
    throw badUpload(
      `Width ${meta.width} outside allowed band ${Math.round(minW)}–${Math.round(maxW)} for ${ratio}`,
    );
  }
  if (meta.height < minH || meta.height > maxH) {
    throw badUpload(
      `Height ${meta.height} outside allowed band ${Math.round(minH)}–${Math.round(maxH)} for ${ratio}`,
    );
  }

  return { width: meta.width, height: meta.height, format: meta.format };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function badUpload(message: string): ApiError {
  return new ApiError(422, message);
}
