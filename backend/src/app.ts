import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./infrastructure/config/env.config.js";
import { pgPool } from "./infrastructure/config/database.config.js";
import { BcryptPasswordService, JwtTokenService } from "./infrastructure/services/auth-token.service.js";
import { RedisRefreshTokenStore } from "./infrastructure/services/refresh-token.store.js";
import { CatalogCacheService } from "./infrastructure/services/catalog-cache.service.js";
import { PgAuthRepository } from "./infrastructure/database/auth.repository.pg.js";
import { PgAdminAuthRepository } from "./infrastructure/database/admin-auth.repository.pg.js";
import { PgCatalogRepository } from "./infrastructure/database/catalog.repository.pg.js";
import { PgCommerceRepository } from "./infrastructure/database/commerce.repository.pg.js";
import { AuthUseCases } from "./application/use-cases/auth.use-cases.js";
import { AdminLoginUseCase } from "./application/use-cases/admin-auth.use-cases.js";
import { CatalogUseCases } from "./application/use-cases/catalog.use-cases.js";
import { CommerceUseCases } from "./application/use-cases/commerce.use-cases.js";
import { createAuthRouter } from "./presentation/routes/auth.routes.js";
import { createAdminAuthRouter } from "./presentation/routes/admin-auth.routes.js";
import { createCatalogRouter } from "./presentation/routes/catalog.routes.js";
import { createCommerceRouter } from "./presentation/routes/commerce.routes.js";

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.CORS_ALLOWED_ORIGINS.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Dependency Injection Composition
  const authRepository = new PgAuthRepository(pgPool);
  const adminAuthRepository = new PgAdminAuthRepository(pgPool);
  const catalogRepository = new PgCatalogRepository(pgPool);
  const commerceRepository = new PgCommerceRepository(pgPool);

  const passwordService = new BcryptPasswordService();
  const tokenService = new JwtTokenService();
  const refreshStore = new RedisRefreshTokenStore();
  const catalogCache = new CatalogCacheService();

  const authUseCases = new AuthUseCases(authRepository, passwordService, tokenService, refreshStore);
  const adminLoginUseCase = new AdminLoginUseCase(adminAuthRepository, passwordService, tokenService);
  const catalogUseCases = new CatalogUseCases(catalogRepository, catalogCache);
  const commerceUseCases = new CommerceUseCases(commerceRepository);

  // Health check
  app.get("/api/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "reflect-fashion-backend",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      databaseConfigured: Boolean(env.DATABASE_URL),
    });
  });

  // API v1 Routes
  app.use("/api/v1/auth", createAuthRouter(authUseCases));
  app.use("/api/v1/admin/auth", createAdminAuthRouter(adminLoginUseCase));
  app.use("/api/v1", createCatalogRouter(catalogUseCases));
  app.use("/api/v1", createCommerceRouter(commerceUseCases));

  return app;
}
