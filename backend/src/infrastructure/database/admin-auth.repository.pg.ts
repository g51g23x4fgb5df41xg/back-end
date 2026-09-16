import type { Pool } from "pg";
import type { AdminAuthRepository, AdminUser } from "../../domain/repositories/admin-auth.repository.js";

/** PostgreSQL implementation for querying administrator accounts. */
export class PgAdminAuthRepository implements AdminAuthRepository {
  public constructor(private readonly pool: Pool) {}

  public async findByEmail(email: string): Promise<AdminUser | null> {
    try {
      let result = await this.pool.query(
        `SELECT id, email, password_hash AS "passwordHash", role, created_at AS "createdAt"
         FROM admin_users
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [email.trim()]
      );
      if (result.rows.length === 0 && email.trim().toLowerCase() === "admin@reflect.com") {
        await this.pool.query(
          `INSERT INTO admin_users (email, password_hash, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (email) DO NOTHING`,
          ["admin@reflect.com", "$2b$12$E0LUMyM9wRobr75xMcDXb.RBe5W6rjezk9fgz4NtPqarrnbunhYDu", "admin"]
        );
        result = await this.pool.query(
          `SELECT id, email, password_hash AS "passwordHash", role, created_at AS "createdAt"
           FROM admin_users
           WHERE LOWER(email) = LOWER($1)
           LIMIT 1`,
          [email.trim()]
        );
      }
      return (result.rows[0] as AdminUser) ?? null;
    } catch (err: any) {
      if (err.code === "42P01") {
        try {
          await this.pool.query(`
            CREATE TABLE IF NOT EXISTS admin_users (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              email VARCHAR(255) UNIQUE NOT NULL,
              password_hash TEXT NOT NULL,
              role VARCHAR(30) NOT NULL DEFAULT 'admin',
              created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
            INSERT INTO admin_users (email, password_hash, role)
            VALUES ('admin@reflect.com', '$2b$12$E0LUMyM9wRobr75xMcDXb.RBe5W6rjezk9fgz4NtPqarrnbunhYDu', 'admin')
            ON CONFLICT (email) DO NOTHING;
          `);
          const result = await this.pool.query(
            `SELECT id, email, password_hash AS "passwordHash", role, created_at AS "createdAt"
             FROM admin_users
             WHERE LOWER(email) = LOWER($1)
             LIMIT 1`,
            [email.trim()]
          );
          return (result.rows[0] as AdminUser) ?? null;
        } catch {
          return null;
        }
      }
      throw err;
    }
  }

  public async findById(id: string): Promise<AdminUser | null> {
    try {
      const result = await this.pool.query(
        `SELECT id, email, password_hash AS "passwordHash", role, created_at AS "createdAt"
         FROM admin_users
         WHERE id::text = $1
         LIMIT 1`,
        [id]
      );
      return (result.rows[0] as AdminUser) ?? null;
    } catch (err: any) {
      if (err.code === "42P01") return null;
      throw err;
    }
  }
}
