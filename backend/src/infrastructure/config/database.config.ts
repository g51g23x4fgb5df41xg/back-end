/**
 * =============================================================================
 * database.config.ts — الاتصال بقاعدة بيانات PostgreSQL
 * =============================================================================
 */

import { Pool, type PoolClient } from "pg";
import { env } from "./env.config.js";
import { logger } from "../../shared/utils/logger.js";

export const pgPool = new Pool({
  connectionString: env.DATABASE_URL || undefined,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: env.DATABASE_POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
});

pgPool.on("error", (error) => {
  logger.error({ err: error }, "❌ خطأ غير متوقع في PostgreSQL connection pool");
});

export async function checkDatabaseConnection(): Promise<boolean> {
  if (!env.DATABASE_URL) {
    logger.warn(
      "⚠️ DATABASE_URL غير محدد في متغيرات البيئة. يرجى إضافته في إعدادات AI Studio لتفعيل الاتصال المباشر بـ PostgreSQL."
    );
    return false;
  }
  let client: PoolClient | undefined;
  try {
    client = await pgPool.connect();
    await client.query("SELECT 1");
    return true;
  } catch (error) {
    logger.error({ err: error }, "❌ فشل فحص الاتصال بقاعدة البيانات PostgreSQL");
    return false;
  } finally {
    client?.release();
  }
}

export async function closeDatabaseConnection(): Promise<void> {
  if (env.DATABASE_URL) {
    try {
      await pgPool.end();
      logger.info("🔌 تم إغلاق الاتصال بقاعدة PostgreSQL بنجاح");
    } catch (err) {
      logger.warn({ err }, "Notice closing pgPool");
    }
  }
}
