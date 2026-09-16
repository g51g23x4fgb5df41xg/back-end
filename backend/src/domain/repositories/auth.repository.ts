/** Contract for durable user and refresh-session persistence. */
export interface AuthUser {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  fullName: string;
  passwordHash: string | null;
  role: "customer" | "admin" | "super_admin" | "support";
  isActive: boolean;
}

/** Contract used by authentication use cases. */
export interface AuthRepository {
  findUserByIdentifier(identifier: string): Promise<AuthUser | null>;
  findUserById(id: string): Promise<AuthUser | null>;
  createUser(input: {
    fullName: string;
    email?: string;
    phoneNumber?: string;
    passwordHash: string;
  }): Promise<AuthUser>;
  createRefreshSession(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<string>;
  rotateRefreshSession(input: {
    sessionId: string;
    tokenHash: string;
    newTokenHash: string;
    newExpiresAt: Date;
  }): Promise<{ userId: string; newSessionId: string; replayDetected: boolean }>;
  revokeRefreshSession(sessionId: string): Promise<void>;
  revokeAllUserSessions(userId: string): Promise<void>;
}
