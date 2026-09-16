import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../infrastructure/config/env.config.js";

export interface AuthenticatedRequest extends Request {
  user?: { id: string; role: string };
}

/** Reject requests missing a valid Bearer JWT. */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "رمز الوصول مطلوب / Access token required" },
    });
    return;
  }

  const token = header.slice(7).trim();
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: env.JWT_ISSUER }) as any;
    if (decoded.type !== "access" || typeof decoded.sub !== "string") {
      throw new Error("Invalid token type");
    }
    req.user = { id: decoded.sub, role: decoded.role || "customer" };
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: { code: "TOKEN_EXPIRED_OR_INVALID", message: "انتهت صلاحية الجلسة أو الرمز غير صالح" },
    });
  }
}

/** Enforce role access control for admin endpoints. */
export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "لا تملك الصلاحيات الكافية لتنفيذ هذا الإجراء" },
      });
      return;
    }
    next();
  };
}
