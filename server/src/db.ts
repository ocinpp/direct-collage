import { PrismaClient } from "@prisma/client";

/**
 * Single shared PrismaClient. In dev, reuse across tsx reloads to avoid
 * leaking connections on every file change.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Enable SQLite WAL mode for concurrent reads during writes (PRD §8.2).
 * Idempotent — running twice is harmless.
 *
 * NB: `PRAGMA journal_mode=WAL` returns a row (the new journal mode), so it
 * must use $queryRawUnsafe, not $executeRawUnsafe (which rejects result rows).
 */
export async function enableWal(): Promise<void> {
  await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
}
