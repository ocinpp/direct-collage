import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { env } from "./env.js";
import { prisma, enableWal } from "./db.js";
import { requireAdmin } from "./middleware/auth.js";
import { ApiError } from "./lib/image.js";
import { sse } from "./lib/sse.js";
import { UPLOAD_DIR } from "./lib/storage-instance.js";
import { authRouter } from "./routes/auth.js";
import { submitRouter } from "./routes/submit.js";
import { wallsRouter } from "./routes/walls.js";
import { adminWallsRouter } from "./routes/admin/walls.js";
import { adminQueueRouter } from "./routes/admin/queue.js";
import { adminCompositesRouter } from "./routes/admin/composites.js";
import { adminAnalyticsRouter } from "./routes/admin/analytics.js";

async function main() {
  await enableWal();

  const app = express();

  // Trust the first hop (so req.secure / req.protocol work behind a proxy).
  app.set("trust proxy", 1);

  app.use(
    cors({
      // Frontend origins (submission / admin / wall dev servers + embed hosts).
      origin: true, // reflect Origin — fine for credentialed requests in dev
      credentials: true, // admin JWT cookie
    }),
  );
  app.use(express.json());
  app.use(cookieParser());

  // Serve baked composites publicly (the wall fetches these as <img src>).
  app.use("/uploads", express.static(UPLOAD_DIR));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, sseClients: sse.totalClients });
  });

  // --- Public routes ---
  app.use("/api/auth", authRouter);
  app.use("/api/submit", submitRouter);
  app.use("/api/walls", wallsRouter);

  // --- Admin routes (JWT-gated) ---
  app.use("/api/admin/walls", requireAdmin, adminWallsRouter);
  app.use("/api/admin/queue", requireAdmin, adminQueueRouter);
  app.use("/api/admin/composites", requireAdmin, adminCompositesRouter);
  app.use("/api/admin/analytics", requireAdmin, adminAnalyticsRouter);

  // --- 404 for unknown /api routes ---
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // --- Central error handler ---
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof ApiError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      // Multer limit errors (e.g. file too large).
      if (typeof err === "object" && err !== null && "code" in err) {
        if ((err as { code: string }).code === "LIMIT_FILE_SIZE") {
          res
            .status(413)
            .json({ error: `File exceeds ${env.maxUploadBytes} bytes` });
          return;
        }
      }
      console.error("[unhandled]", err);
      res.status(500).json({ error: "Internal server error" });
    },
  );

  app.listen(env.port, () => {
    console.log(`DirectCollage server on http://localhost:${env.port}`);
    console.log(`  uploads dir : ${UPLOAD_DIR}`);
  });
}

main().catch((e) => {
  console.error("Failed to start server:", e);
  process.exit(1);
});

// Close Prisma cleanly on shutdown.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
