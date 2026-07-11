import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { COOKIE_NAME, signAdminToken, type AdminToken } from "../middleware/auth.js";
import { asyncHandler, validateBody, bodyOf } from "../middleware/validate.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = bodyOf<{ email: string; password: string }>(res);

    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const { token, maxAge } = signAdminToken({
      sub: admin.id,
      email: admin.email,
    });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: req.secure || req.protocol === "https",
      sameSite: "lax",
      maxAge,
      path: "/",
    });

    res.json({ email: admin.email });
  }),
);

authRouter.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

/** Returns the current admin identity if the cookie is valid. */
authRouter.get("/me", (req, res) => {
  const raw = req.cookies?.[COOKIE_NAME];
  if (!raw) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const payload = jwt.verify(raw, env.jwtSecret) as AdminToken;
    res.json({ email: payload.email });
  } catch {
    res.status(401).json({ error: "Not authenticated" });
  }
});
