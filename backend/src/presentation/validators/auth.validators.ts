import { z } from "zod";

/** Validate customer registration and reject weak passwords. */
export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "الاسم الكامل مطلوب (على الأقل حرفين)"),
    email: z.string().email("صيغة البريد الإلكتروني غير صحيحة").optional().or(z.literal("")),
    phoneNumber: z.string().trim().min(7, "رقم الهاتف غير صحيح").optional().or(z.literal("")),
    password: z.string().min(6, "كلمة المرور يجب أن تتكون من 6 أحرف على الأقل").max(128),
  })
  .refine((value) => Boolean(value.email || value.phoneNumber), {
    message: "يرجى تقديم البريد الإلكتروني أو رقم الهاتف",
  });

/** Validate login credentials. */
export const loginSchema = z.object({
  identifier: z.string().trim().min(3, "يرجى إدخال البريد الإلكتروني أو رقم الهاتف"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

/** Cookie name intentionally avoids exposing token semantics to clients. */
export const REFRESH_COOKIE_NAME = "__Host-reflect_refresh";

/** Validate refresh token format from cookie */
export const refreshTokenCookieSchema = z.string().min(1, "رمز التحديث مفقود");

/** Return cookie options for refresh tokens. */
export function refreshCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax";
  path: "/";
  maxAge: number;
} {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
}
