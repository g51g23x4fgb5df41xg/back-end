import { Router } from "express";
import type { AuthUseCases } from "../../application/use-cases/auth.use-cases.js";
import { authRateLimit } from "../middlewares/auth-rate-limit.middleware.js";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/access-auth.middleware.js";
import {
  loginSchema,
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
  refreshTokenCookieSchema,
  registerSchema,
} from "../validators/auth.validators.js";
import { AuthError } from "../../domain/errors/auth.errors.js";

export function createAuthRouter(useCases: AuthUseCases): Router {
  const router = Router();

  /** Register customer */
  router.post("/register", authRateLimit, async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message || "بيانات التسجيل غير صالحة",
          details: parsed.error.issues,
        },
      });
      return;
    }

    try {
      const result = await useCases.register(parsed.data);
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions());
      res.status(201).json({ success: true, data: result.response });
    } catch (error: any) {
      if (error?.code === "23505") {
        res.status(409).json({
          success: false,
          error: {
            code: "USER_ALREADY_EXISTS",
            message: "البريد الإلكتروني أو رقم الهاتف مستخدم بالفعل",
          },
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: { code: "SERVER_ERROR", message: error.message || "حدث خطأ غير متوقع أثناء التسجيل" },
      });
    }
  });

  /** Login customer */
  router.post("/login", authRateLimit, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "بيانات تسجيل الدخول غير صالحة" },
      });
      return;
    }

    try {
      const result = await useCases.login(parsed.data);
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions());
      res.status(200).json({ success: true, data: result.response });
    } catch (error) {
      if (error instanceof AuthError) {
        res.status(error.statusCode).json({
          success: false,
          error: { code: error.code, message: error.message },
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: { code: "SERVER_ERROR", message: "تعذر تسجيل الدخول، يرجى المحاولة لاحقاً" },
      });
    }
  });

  /** Rotate refresh token (strictly from secure HttpOnly cookie, rejecting request body) */
  router.post("/refresh", async (req, res) => {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    const parsedToken = refreshTokenCookieSchema.safeParse(rawToken);
    if (!parsedToken.success) {
      res.status(401).json({
        success: false,
        error: { code: "REFRESH_TOKEN_REQUIRED", message: "رمز التحديث مفقود" },
      });
      return;
    }

    try {
      const result = await useCases.refresh(parsedToken.data);
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions());
      res.status(200).json({ success: true, data: result.response });
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
      if (error instanceof AuthError) {
        res.status(error.statusCode).json({
          success: false,
          error: { code: error.code, message: error.message },
        });
        return;
      }
      res.status(401).json({
        success: false,
        error: { code: "SESSION_EXPIRED", message: "انتهت الجلسة، يرجى إعادة تسجيل الدخول" },
      });
    }
  });

  /** Logout */
  router.post("/logout", async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
    if (token && typeof token === "string") {
      try {
        const decoded = (req as any).user?.sessionId || token;
        await useCases.logout(decoded);
      } catch {
        // ignore
      }
    }
    res.status(200).json({ success: true, message: "تم تسجيل الخروج بنجاح" });
  });

  /** Get current authenticated user profile */
  router.get("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
    res.status(200).json({
      success: true,
      data: {
        userId: req.user?.id,
        role: req.user?.role,
      },
    });
  });

  return router;
}
