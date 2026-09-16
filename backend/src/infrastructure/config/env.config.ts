/**
 * =============================================================================
 * env.config.ts — إعدادات متغيرات البيئة (Environment Variables)
 * =============================================================================
 */

import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.JWT_ACCESS_SECRET && process.env.JWT_SECRET) {
  process.env.JWT_ACCESS_SECRET = process.env.JWT_SECRET;
}
if (!process.env.JWT_REFRESH_SECRET && process.env.JWT_SECRET) {
  process.env.JWT_REFRESH_SECRET = process.env.JWT_SECRET;
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  // PostgreSQL
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .transform((val) => val.trim()),
  DATABASE_SSL: z.coerce.boolean().default(true),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  DATABASE_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  DATABASE_POOL_CONNECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5_000),

  // Redis
  REDIS_URL: z
    .string()
    .min(1, "REDIS_URL is required")
    .transform((val) => val.trim()),
  REDIS_MAX_RETRIES_PER_REQUEST: z.coerce.number().int().nonnegative().default(2),

  // JWT
  JWT_SECRET: z.string().min(32).optional(),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default(process.env.JWT_EXPIRES_IN || "15m"),
  REFRESH_TOKEN_EXPIRES_IN_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(30),
  JWT_ISSUER: z.string().default("reflect-fashion-api"),

  // CORS
  CORS_ORIGIN: z.string().default(process.env.CORS_ORIGIN || "*"),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default(process.env.CORS_ORIGIN || "*")
    .transform((value) => value.split(",").map((origin) => origin.trim())),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ خطأ فادح: فشل التحقق من متغيرات البيئة الأساسية (Fatal environment validation error):");
  console.error(parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsedEnv.data;

export type Env = typeof env;
