/**
 * =============================================================================
 * redis.config.ts — الاتصال بـ Redis
 * =============================================================================
 */

import { Redis } from "ioredis";
import { env } from "./env.config.js";
import { logger } from "../../shared/utils/logger.js";

const redisUrl = env.REDIS_URL || "redis://127.0.0.1:6379";
const isRedisConfigured = Boolean(env.REDIS_URL);

const redisOptions: any = {
  maxRetriesPerRequest: env.REDIS_MAX_RETRIES_PER_REQUEST,
  retryStrategy(attempt: number) {
    if (!isRedisConfigured && attempt > 2) {
      return null; // Stop retrying if REDIS_URL was not explicitly provided
    }
    return Math.min(attempt * 150, 2_000);
  },
  lazyConnect: true,
  enableOfflineQueue: false,
};

if (redisUrl.startsWith("rediss://")) {
  redisOptions.tls = { rejectUnauthorized: false };
}

export const redisClient = new Redis(redisUrl, redisOptions);

if (isRedisConfigured) {
  redisClient.connect().catch((err) => {
    logger.warn({ err: err.message }, "⚠️ تعذر الاتصال الأولي بـ Redis. سيتم العمل بدون كاش مؤقتًا.");
  });
}

redisClient.on("connect", () => {
  logger.info("✅ تم الاتصال بـ Redis بنجاح");
});

redisClient.on("error", (error: Error) => {
  if (isRedisConfigured) {
    logger.warn({ err: error.message }, "⚠️ تنبيه Redis");
  }
});

export async function checkRedisConnection(): Promise<boolean> {
  if (!env.REDIS_URL) {
    return false;
  }
  try {
    const response = await redisClient.ping();
    return response === "PONG";
  } catch {
    return false;
  }
}

export async function closeRedisConnection(): Promise<void> {
  if (isRedisConfigured && redisClient.status === "ready") {
    try {
      await redisClient.quit();
      logger.info("🔌 تم إغلاق الاتصال بـ Redis بنجاح");
    } catch {
      // ignore
    }
  }
}
