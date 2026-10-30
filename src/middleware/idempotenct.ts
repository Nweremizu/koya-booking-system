import { createHash } from "node:crypto";
import { Request, Response, NextFunction } from "express";
import { LRUCache } from "lru-cache";

interface CachedResponse {
  status: number;
  body: unknown;
  hasBody: boolean;
  contentType?: string;
}

interface CacheEntry {
  requestHash: string;
  response: CachedResponse;
}

interface PendingRequest {
  requestHash: string;
  done: Promise<CachedResponse | null>;
}

const cache = new LRUCache<string, CacheEntry>({
  max: 10000,
  ttl: 1000 * 60 * 60 * 5,
});

// Tracks requests currently being processed.
const inFlight = new Map<string, PendingRequest>();

export const clearIdempotencyCache = () => cache.clear();

// Normalize JSON so property order doesn't affect comparison.
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;

    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((key) => [key, normalize(obj[key])]),
    );
  }

  return value;
}

function hashBody(body: unknown): string {
  const normalized = JSON.stringify(normalize(body ?? null));

  return createHash("sha256").update(normalized).digest("hex");
}

function replayResponse(res: Response, cached: CachedResponse) {
  res.status(cached.status);

  if (cached.contentType) {
    res.setHeader("Content-Type", cached.contentType);
  }

  if (!cached.hasBody) {
    return res.end();
  }

  return res.send(cached.body);
}

export const idempotentMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const key = req.get("Idempotency-Key");

  // Header is optional.
  if (!key) {
    next();
    return;
  }

  const requestHash = hashBody(req.body);

  // Scope to the endpoint.
  // For authenticated APIs, also include the user/tenant ID.
  const cacheKey = `${req.method}:${req.originalUrl}:${key}`;

  // 1. Check completed requests.
  const cached = cache.get(cacheKey);

  if (cached) {
    if (cached.requestHash !== requestHash) {
      res.status(422).json({
        error: "Idempotency key reused with a different body",
      });
      return;
    }

    replayResponse(res, cached.response);
    return;
  }

  // 2. Check requests still being processed.
  const pending = inFlight.get(cacheKey);

  if (pending) {
    if (pending.requestHash !== requestHash) {
      res.status(422).json({
        error: "Idempotency key reused with a different body",
      });
      return;
    }

    // Wait for the original request instead of creating
    // another booking.
    void pending.done.then((response) => {
      if (res.headersSent || res.destroyed) return;

      if (!response) {
        res.status(503).json({
          error: "Original request did not complete. Please retry.",
        });
        return;
      }

      replayResponse(res, response);
    });

    return;
  }

  // 3. Register this request as in progress BEFORE next().
  let resolveDone!: (result: CachedResponse | null) => void;

  const done = new Promise<CachedResponse | null>((resolve) => {
    resolveDone = resolve;
  });

  inFlight.set(cacheKey, { requestHash, done });

  let responseBody: unknown;
  let hasBody = false;
  let settled = false;

  function settle(result: CachedResponse | null) {
    if (settled) return;
    settled = true;

    // Rate limits and server errors are transient: a retry with the same key should run again.
    if (result && result.status !== 429 && result.status < 500) {
      cache.set(cacheKey, {
        requestHash,
        response: result,
      });
    }

    inFlight.delete(cacheKey);
    resolveDone(result);
  }

  // Capture the original response.
  // Express res.json() ultimately uses res.send().
  const originalSend = res.send.bind(res);

  res.send = function (body: unknown) {
    responseBody = body;
    hasBody = true;

    return originalSend(body);
  } as typeof res.send;

  // Cache only after the response finishes.
  res.once("finish", () => {
    const contentType = res.getHeader("Content-Type");

    settle({
      status: res.statusCode,
      body: responseBody,
      hasBody,
      contentType: typeof contentType === "string" ? contentType : undefined,
    });
  });

  // Release waiting requests if the response aborts.
  res.once("close", () => {
    if (!res.writableFinished) {
      settle(null);
    }
  });

  // 4. Execute the booking handler only once.
  next();
};
