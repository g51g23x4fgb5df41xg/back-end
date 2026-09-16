import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { env } from "../config/env.config.js";
import type { PasswordService, TokenService } from "../../application/dtos/auth.dto.js";

/** Hashes and verifies passwords with bcrypt. */
export class BcryptPasswordService implements PasswordService {
  /** Hash a password using a work factor. */
  public hash(value: string): Promise<string> {
    return bcrypt.hash(value, 12);
  }

  /** Compare a plaintext password against a bcrypt digest. */
  public verify(value: string, hash: string): Promise<boolean> {
    return bcrypt.compare(value, hash);
  }
}

/** Signs short-lived access tokens and long-lived rotating refresh tokens. */
export class JwtTokenService implements TokenService {
  /** Create a short-lived access token. */
  public createAccessToken(payload: { sub: string; role: string }): string {
    return jwt.sign(
      { ...payload, jti: crypto.randomUUID(), type: "access" },
      env.JWT_ACCESS_SECRET,
      { expiresIn: (env.JWT_EXPIRES_IN || "15m") as any, issuer: env.JWT_ISSUER }
    );
  }

  /** Create a long-lived refresh token bound to one persisted session row. */
  public createRefreshToken(payload: { sub: string; sessionId: string; role: string }): string {
    const days = env.REFRESH_TOKEN_EXPIRES_IN_DAYS || 30;
    return jwt.sign(
      { ...payload, jti: crypto.randomUUID(), type: "refresh" },
      env.JWT_REFRESH_SECRET,
      { expiresIn: `${days}d` as any, issuer: env.JWT_ISSUER }
    );
  }

  /** Verify a refresh token and reject tokens signed for another purpose. */
  public verifyRefreshToken(token: string): { sub: string; sessionId: string; role: string } {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: env.JWT_ISSUER }) as any;
    if (
      typeof decoded === "string" ||
      decoded.type !== "refresh" ||
      typeof decoded.sub !== "string" ||
      typeof decoded.sessionId !== "string"
    ) {
      throw new Error("Invalid refresh token claims");
    }
    return { sub: decoded.sub, sessionId: decoded.sessionId, role: decoded.role || "customer" };
  }
}

/** Return a stable SHA-256 digest; raw refresh tokens are never stored. */
export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
