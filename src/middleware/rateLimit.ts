import { Request, Response, NextFunction } from "express";

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

// ponytail: in-memory sliding window, single process only; move to Redis if you run more than one instance.
const attempts = new Map<string, number[]>();

export const clearRateLimits = () => attempts.clear();

// Runs before validation so failed attempts count too.
export const rateLimitByEmail = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const raw = req.body?.email;
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";

  // Nothing to key on; validation will reject the request.
  if (!email) {
    next();
    return;
  }

  const now = Date.now();
  const recent = (attempts.get(email) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_ATTEMPTS) {
    attempts.set(email, recent);
    const waitMs = recent[0] + WINDOW_MS - now;
    res.set("Retry-After", String(Math.max(1, Math.ceil(waitMs / 1000))));
    res.status(429).json({ error: "too many booking attempts, try again later" });
    return;
  }

  recent.push(now);
  attempts.set(email, recent);
  next();
};
