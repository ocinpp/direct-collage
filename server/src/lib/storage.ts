import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { env } from "../env.js";

/**
 * StorageAdapter — abstracts where composite JPEGs live.
 *
 * MVP uses LocalStorageAdapter (writes to disk under uploads/). The interface
 * is shaped so an S3 adapter can drop in later without touching routes
 * (PRD §8.2 / §8.4: swap is a single adapter implementation).
 */
export interface StorageAdapter {
  /** Persist bytes; returns a storageKey (opaque to callers). */
  save(data: Buffer, ext: string): Promise<string>;
  /** Read bytes back. Throws if missing. */
  read(key: string): Promise<Buffer>;
  /** Remove a stored object. No-op if already gone. */
  delete(key: string): Promise<void>;
  /** Public URL clients can fetch the object from. */
  url(key: string): string;
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly uploadDir: string) {}

  async save(data: Buffer, ext: string): Promise<string> {
    // Deterministic-ish key: timestamp + short hash of contents + random suffix.
    // Avoids collisions and accidental overwrites.
    const hash = createHash("sha1").update(data).digest("hex").slice(0, 12);
    const rand = randomBytes(4).toString("hex");
    const key = `${Date.now()}-${hash}${rand}.${ext}`;
    await mkdir(this.uploadDir, { recursive: true });
    await writeFile(resolve(this.uploadDir, key), data);
    return key;
  }

  async read(key: string): Promise<Buffer> {
    const { readFile } = await import("node:fs/promises");
    return readFile(resolve(this.uploadDir, key));
  }

  async delete(key: string): Promise<void> {
    try {
      await rm(resolve(this.uploadDir, key));
    } catch (err: unknown) {
      // Idempotent: ignore "not found" so reject() can run twice safely.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  url(key: string): string {
    // Served by Express static middleware under /uploads (see index.ts).
    return `${env.publicBaseUrl}/uploads/${key}`;
  }
}

/** Validate a storageKey looks like one we issued (defends path traversal). */
export function isSafeStorageKey(key: string): boolean {
  return /^[0-9a-f]+-[0-9a-f]{12}[0-9a-f]{8}\.jpe?g$/i.test(key);
}

/** Check whether a stored object currently exists. */
export async function exists(storage: StorageAdapter, dir: string, key: string): Promise<boolean> {
  try {
    await stat(resolve(dir, key));
    return true;
  } catch {
    return false;
  }
}
