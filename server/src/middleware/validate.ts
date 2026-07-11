import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodSchema } from "zod";

/** Wrap async route handlers so rejected promises hit the error handler. */
type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Validate req.body against a zod schema; 400 on failure. */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request body",
        issues: zodIssues(parsed.error),
      });
      return;
    }
    res.locals.body = parsed.data;
    next();
  };
}

/** Typed accessor for the validated body set by validateBody. */
export function bodyOf<T>(res: Response): T {
  return res.locals.body as T;
}

function zodIssues(err: ZodError): { path: string; message: string }[] {
  return err.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
}
