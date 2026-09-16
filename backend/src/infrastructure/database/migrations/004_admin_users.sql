-- =============================================================================
-- 004_admin_users.sql — Admin Users and RBAC
-- =============================================================================

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
