import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalStorageAdapter, type StorageAdapter } from "./storage.js";

// Anchor uploads/ to the server package dir regardless of the process cwd,
// so it always lands at <repo>/server/uploads (matches .gitignore).
const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Singleton StorageAdapter instance.
 *
 * Files land in server/uploads/ (gitignored), served statically by Express
 * under /uploads. Swap to S3 by replacing LocalStorageAdapter here — no route
 * changes required (PRD §8.2 / §8.4).
 */
export const UPLOAD_DIR = resolve(serverRoot, "uploads");

export const storage: StorageAdapter = new LocalStorageAdapter(UPLOAD_DIR);
