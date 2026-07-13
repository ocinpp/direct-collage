import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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
      // Allowlist of frontend origins (submission / admin / wall + embeds).
      // With credentials:true, we must echo the specific origin (not *), so
      // this function gates which origins can call the API with cookies.
      // The list comes from the CORS_ORIGIN env var (comma-separated).
      origin: (origin, cb) => {
        // Allow same-origin / no-Origin requests (curl, server-to-server, the
        // Vite dev proxy which makes same-origin calls). Browsers always send
        // Origin on cross-origin requests; if absent, it's not a browser CORS
        // request, so allow it.
        if (!origin) return cb(null, true);
        if (env.corsOrigins.includes(origin)) return cb(null, true);
        return cb(null, false); // reject — no ACAO header sent
      },
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

  // --- Production: serve the built frontend bundles (same-origin strategy) ---
  // In dev the Vite proxy handles /api + /uploads. In production there's no
  // proxy, so the simplest path is to serve all three frontends from this
  // server on :4000. Then VITE_API_URL="" (same-origin) works and no separate
  // static host is needed. Each app is mounted at a sub-path with a matching
  // Vite `base` so asset URLs resolve correctly.
  //
  // This is a no-op in dev — the dist/ dirs don't exist unless `npm run build`
  // has been run.
  // serverRoot = the monorepo root (repo/), since this runs from server/dist/.
  // Frontend dist dirs are at repo/submission/dist, repo/admin/dist, etc.
  const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const frontends: Array<{ dir: string; route: string; label: string }> = [
    { dir: resolve(serverRoot, "submission/dist"), route: "/submit", label: "submission" },
    { dir: resolve(serverRoot, "admin/dist"), route: "/admin-ui", label: "admin" },
    { dir: resolve(serverRoot, "wall/dist"), route: "/wall-ui", label: "wall" },
  ];
  for (const fe of frontends) {
    if (!existsSync(fe.dir)) continue;
    // Serve static assets from the dist dir.
    app.use(fe.route, express.static(fe.dir));
    // SPA fallback: any non-asset GET under the route returns index.html, so
    // client-side routing (e.g. /submit/demo, /wall-ui/demo) survives refresh.
    app.get(`${fe.route}/*`, (_req, res) => {
      res.sendFile(resolve(fe.dir, "index.html"));
    });
    console.log(`  ${fe.label.padEnd(10)} : http://localhost:${env.port}${fe.route}`);
  }

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
