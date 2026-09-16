import { Router } from "express";
import { z } from "zod";
import { AdminLoginUseCase } from "../../application/use-cases/admin-auth.use-cases.js";
import { AuthError } from "../../domain/errors/auth.errors.js";

const adminLoginSchema = z
  .object({
    email: z.string().trim().email("البريد الإلكتروني غير صحيح / Invalid email").optional(),
    identifier: z.string().trim().optional(),
    password: z.string().min(1, "كلمة المرور مطلوبة / Password is required"),
  })
  .refine((data) => Boolean(data.email || data.identifier), {
    message: "البريد الإلكتروني مطلوب / Email is required",
    path: ["email"],
  });

/** Mounts administrative authentication routes under /api/v1/admin/auth */
export function createAdminAuthRouter(adminLogin: AdminLoginUseCase): Router {
  const router = Router();

  /** Authenticate an administrator and return an access token with role: admin */
  router.post("/login", async (req, res) => {
    const parsed = adminLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "بيانات الدخول غير صالحة",
          issues: parsed.error.issues,
        },
      });
      return;
    }

    const email = (parsed.data.email || parsed.data.identifier)!.trim();

    try {
      const result = await adminLogin.execute({
        email,
        password: parsed.data.password,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      if (error instanceof AuthError) {
        res.status(error.statusCode).json({
          success: false,
          error: { code: error.code, message: error.message },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error.message || "حدث خطأ غير متوقع في الخادم",
        },
      });
    }
  });

  return router;
}
