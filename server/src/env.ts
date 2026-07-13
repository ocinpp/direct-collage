import dotenv from "dotenv";
import { resolve } from "node:path";

// Load .env from the server package root (one level up from src/).
dotenv.config({ path: resolve(process.cwd(), ".env") });

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  publicBaseUrl: required("PUBLIC_BASE_URL", "http://localhost:4000"),
  jwtSecret: required("JWT_SECRET", "dev-only-change-me-in-production"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  seedAdminEmail: required("SEED_ADMIN_EMAIL", "admin@demo.local"),
  seedAdminPassword: required("SEED_ADMIN_PASSWORD", "changeme"),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 3 * 1024 * 1024),
  /**
   * Rate limiting on the submit endpoint (PRD §8.3).
   * Defaults: 20 submissions per 60s window per IP — generous enough for an
   * event crowd with retries, tight enough to stop flooding.
   */
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 20),
  /**
   * CORS allowlist (comma-separated origins). With credentials:true the CORS
   * middleware echoes the specific origin back (not *), so this list controls
   * exactly which frontend origins can call the API with cookies.
   *
   * Default covers the three dev servers. For LAN/phone testing, append the
   * LAN-IP variants (e.g. http://192.168.x.x:5173). For production, set the
   * real domain(s).
   */
  corsOrigins: required(
    "CORS_ORIGIN",
    "http://localhost:5173,http://localhost:5174,http://localhost:5175",
  ).split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /**
   * Per-aspect-ratio validation bounds.
   * Width is fixed at 1080 for all ratios; height follows the ratio.
   * A tolerance band lets the client's baked JPEG differ slightly without
   * being rejected — the client canvas may not land on exactly 1080x1080.
   */
  outputWidth: 1080,
  aspectTolerance: 0.03, // ±3% on width/height
};
