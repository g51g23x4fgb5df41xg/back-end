/** Credentials accepted by customer registration. */
export interface RegisterInput {
  fullName: string;
  email?: string;
  phoneNumber?: string;
  password: string;
}

/** Credentials accepted by customer login. */
export interface LoginInput {
  identifier: string;
  password: string;
}

/** Public authentication response; refresh tokens never leave the HttpOnly cookie. */
export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    fullName: string;
    email: string | null;
    phoneNumber: string | null;
    role: string;
  };
}

/** Abstraction over JWT signing so application logic remains framework-independent. */
export interface TokenService {
  createAccessToken(payload: { sub: string; role: string }): string;
  createRefreshToken(payload: { sub: string; sessionId: string; role: string }): string;
  verifyRefreshToken(token: string): { sub: string; sessionId: string; role: string };
}

/** Abstraction over password hashing. */
export interface PasswordService {
  hash(value: string): Promise<string>;
  verify(value: string, hash: string): Promise<boolean>;
}

/** Abstraction over a Redis-backed refresh-token index. */
export interface RefreshTokenStore {
  save(sessionId: string, userId: string, ttlSeconds: number): Promise<void>;
  consume(sessionId: string): Promise<string | null>;
  delete(sessionId: string): Promise<void>;
  revokeAll(userId: string): Promise<void>;
}
