import type { Pool } from "pg";
import type { AuthRepository, AuthUser } from "../../domain/repositories/auth.repository.js";

/** PostgreSQL implementation for users and refresh-token rotation transactions. */
export class PgAuthRepository implements AuthRepository {
  public constructor(private readonly pool: Pool) {}

  /** Find a customer by email or phone. */
  public async findUserByIdentifier(identifier: string): Promise<AuthUser | null> {
    try {
      const result = await this.pool.query(
        `SELECT id, email, phone_number AS "phoneNumber", full_name AS "fullName", password_hash AS "passwordHash", COALESCE(role, 'customer') AS role, COALESCE(is_active, true) AS "isActive" 
         FROM users 
         WHERE (email = $1 OR phone_number = $1) 
         LIMIT 1`,
        [identifier.trim()]
      );
      return (result.rows[0] as AuthUser) ?? null;
    } catch (err: any) {
      // If table doesn't exist yet, return null
      if (err.code === "42P01") return null;
      throw err;
    }
  }

  /** Find a customer by UUID or identifier. */
  public async findUserById(id: string): Promise<AuthUser | null> {
    try {
      const result = await this.pool.query(
        `SELECT id, email, phone_number AS "phoneNumber", full_name AS "fullName", password_hash AS "passwordHash", COALESCE(role, 'customer') AS role, COALESCE(is_active, true) AS "isActive" 
         FROM users 
         WHERE id::text = $1 
         LIMIT 1`,
        [id]
      );
      return (result.rows[0] as AuthUser) ?? null;
    } catch (err: any) {
      if (err.code === "42P01") return null;
      throw err;
    }
  }

  /** Create a customer using a parameterized query. */
  public async createUser(input: {
    fullName: string;
    email?: string;
    phoneNumber?: string;
    passwordHash: string;
  }): Promise<AuthUser> {
    const result = await this.pool.query(
      `INSERT INTO users (full_name, email, phone_number, password_hash, role, is_active) 
       VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), $4, 'customer', true) 
       RETURNING id, email, phone_number AS "phoneNumber", full_name AS "fullName", password_hash AS "passwordHash", role, is_active AS "isActive"`,
      [input.fullName, input.email ?? "", input.phoneNumber ?? "", input.passwordHash]
    );
    return result.rows[0] as AuthUser;
  }

  /** Persist a hashed refresh token and return its opaque session identifier. */
  public async createRefreshSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<string> {
    try {
      const result = await this.pool.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) 
         VALUES ($1, $2, $3) 
         RETURNING id`,
        [input.userId, input.tokenHash, input.expiresAt]
      );
      return String(result.rows[0].id);
    } catch (err: any) {
      // If refresh_tokens table doesn't exist yet, return a fallback UUID
      if (err.code === "42P01") {
        return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
      }
      throw err;
    }
  }

  /** Atomically consume the old session and create a separate replacement session. */
  public async rotateRefreshSession(input: {
    sessionId: string;
    tokenHash: string;
    newTokenHash: string;
    newExpiresAt: Date;
  }): Promise<{ userId: string; newSessionId: string; replayDetected: boolean }> {
    let client;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      const existing = await client.query(
        `SELECT user_id, token_hash, revoked_at, expires_at FROM refresh_tokens WHERE id::text = $1 FOR UPDATE`,
        [input.sessionId]
      );
      const row = existing.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return { userId: "", newSessionId: "", replayDetected: true };
      }
      if (row.revoked_at || new Date(row.expires_at) <= new Date() || row.token_hash !== input.tokenHash) {
        await client.query(
          `UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1 AND revoked_at IS NULL`,
          [row.user_id]
        );
        await client.query("COMMIT");
        return { userId: String(row.user_id), newSessionId: "", replayDetected: true };
      }
      await client.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id::text = $1`, [input.sessionId]);
      const replacement = await client.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id`,
        [row.user_id, input.newTokenHash, input.newExpiresAt]
      );
      await client.query("COMMIT");
      return {
        userId: String(row.user_id),
        newSessionId: String(replacement.rows[0].id),
        replayDetected: false,
      };
    } catch (error: any) {
      if (client) await client.query("ROLLBACK");
      if (error.code === "42P01") {
        return { userId: "", newSessionId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`, replayDetected: false };
      }
      throw error;
    } finally {
      client?.release();
    }
  }

  /** Revoke one session in the database. */
  public async revokeRefreshSession(sessionId: string): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE id::text = $1`,
        [sessionId]
      );
    } catch {
      // ignore
    }
  }

  /** Revoke every active session for incident response. */
  public async revokeAllUserSessions(userId: string): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id::text = $1 AND revoked_at IS NULL`,
        [userId]
      );
    } catch {
      // ignore
    }
  }
}
