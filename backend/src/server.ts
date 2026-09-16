import { createApp } from "./app.js";
import { env } from "./infrastructure/config/env.config.js";
import { checkDatabaseConnection, closeDatabaseConnection } from "./infrastructure/config/database.config.js";
import { checkRedisConnection, closeRedisConnection } from "./infrastructure/config/redis.config.js";
import { logger } from "./shared/utils/logger.js";

async function start(): Promise<void> {
  const isDbUp = await checkDatabaseConnection();
  if (isDbUp) {
    logger.info("✅ تم التحقق من الاتصال بقاعدة بيانات PostgreSQL بنجاح");
  } else {
    logger.warn("⚠️ تنبيه: لم يتم الاتصال بـ PostgreSQL بعد. يرجى تزويد DATABASE_URL في الإعدادات.");
  }

  const isRedisUp = await checkRedisConnection();
  if (isRedisUp) {
    logger.info("✅ تم التحقق من الاتصال بـ Redis بنجاح");
  } else {
    logger.warn("⚠️ تنبيه: لم يتم الاتصال بـ Redis. سيتم العمل بدون كاش أو بالذاكرة المؤقتة.");
  }

  const app = createApp();
  const server = app.listen(env.PORT, "0.0.0.0", () => {
    logger.info(`🚀 خادم Reflect Fashion Backend يعمل على http://0.0.0.0:${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`إشارة ${signal} مستلمة، جاري إغلاق الخادم بلطف...`);
    server.close(async () => {
      await closeDatabaseConnection();
      await closeRedisConnection();
      logger.info("تم إنهاء جميع الاتصالات.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  logger.error({ err }, "❌ فشل بدء تشغيل الخادم");
});
