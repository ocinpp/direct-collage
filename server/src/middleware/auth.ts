import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

/** Shape of the JWT payload we sign for admin sessions. */
export interface AdminToken {
  sub: string; // Admin.id
  email: string;
}

declare module "express-serve-static-core" {
  interface Request {
    admin?: AdminToken;
  }
}

export const COOKIE_NAME = "dc_admin";

/** Sign a JWT and return the cookie value + expiry (seconds) for Set-Cookie. */
export function signAdminToken(admin: AdminToken): {
  token: string;
  maxAge: number;
} {
  const token = jwt.sign(admin, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as unknown as number,
  });
  // Decode exp from the token rather than re-parsing env strings like "7d".
  const decoded = jwt.decode(token) as { exp: number } | null;
  const maxAge = decoded?.exp ? decoded.exp * 1000 - Date.now() : 7 * 86400_000;
  return { token, maxAge };
}

/** Express middleware: require a valid admin JWT cookie. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const raw = req.cookies?.[COOKIE_NAME];
  if (!raw) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const payload = jwt.verify(raw, env.jwtSecret) as AdminToken;
    req.admin = { sub: payload.sub, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}
