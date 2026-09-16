import type { NextFunction, Request, Response } from "express";
import { redisClient } from "../../infrastructure/config/redis.config.js";
import { env } from "../../infrastructure/config/env.config.js";

const WINDOW_SECONDS = Math.round((env.RATE_LIMIT_WINDOW_MS || 60000) / 1000);
const MAX_ATTEMPTS = env.AUTH_RATE_LIMIT_MAX || 60;

const inMemoryBuckets = new Map<string, { count: number; resetAt: number }>();

/** Rate limiter per IP for auth routes. */
export async function authRateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const key = `rate_limit:auth:${ip}`;

  try {
    if (redisClient.status === "ready") {
      const current = await redisClient.incr(key);
      if (current === 1) {
        await redisClient.expire(key, WINDOW_SECONDS);
      }
      if (current > MAX_ATTEMPTS) {
        res.status(429).json({
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "تجاوزت الحد المسموح من المحاولات. يرجى الانتظار دقيقة.",
          },
        });
        return;
      }
      next();
      return;
    }
  } catch {
    // Redis unavailable, fallback to memory
  }

  const now = Date.now();
  const bucket = inMemoryBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    inMemoryBuckets.set(ip, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 });
    next();
    return;
  }

  bucket.count += 1;
  if (bucket.count > MAX_ATTEMPTS) {
    res.status(429).json({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "تجاوزت الحد المسموح من المحاولات. يرجى الانتظار دقيقة.",
      },
    });
    return;
  }

  next();
}
