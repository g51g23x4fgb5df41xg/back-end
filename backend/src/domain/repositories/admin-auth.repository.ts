/** Contract for administrator entity. */
export interface AdminUser {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  createdAt?: Date | string;
}

/** Contract for administrator repository persistence. */
export interface AdminAuthRepository {
  findByEmail(email: string): Promise<AdminUser | null>;
  findById?(id: string): Promise<AdminUser | null>;
}
