import type { PasswordService, TokenService } from "../dtos/auth.dto.js";
import type { AdminAuthRepository } from "../../domain/repositories/admin-auth.repository.js";
import { InvalidCredentialsError } from "../../domain/errors/auth.errors.js";

/** Reusable interface aliases matching the clean architecture specification. */
export type IPasswordHasher = PasswordService;
export type ITokenService = TokenService;

export interface AdminLoginInput {
  email: string;
  password: string;
}

export interface AdminAuthResponse {
  accessToken: string;
  admin: {
    id: string;
    email: string;
    role: string;
  };
  user: {
    id: string;
    email: string;
    role: string;
  };
}

/** Authenticates administrators and issues JWTs with role "admin". */
export class AdminLoginUseCase {
  public constructor(
    private readonly repository: AdminAuthRepository,
    private readonly passwords: IPasswordHasher,
    private readonly tokens: ITokenService
  ) {}

  public async execute(input: AdminLoginInput): Promise<AdminAuthResponse> {
    const admin = await this.repository.findByEmail(input.email);
    if (!admin || !admin.passwordHash) {
      throw new InvalidCredentialsError();
    }

    const isValid = await this.passwords.verify(input.password, admin.passwordHash);
    if (!isValid) {
      throw new InvalidCredentialsError();
    }

    const role = admin.role || "admin";
    const accessToken = this.tokens.createAccessToken({
      sub: admin.id,
      role,
    });

    const adminData = {
      id: admin.id,
      email: admin.email,
      role,
    };

    return {
      accessToken,
      admin: adminData,
      user: adminData,
    };
  }

  public async login(input: AdminLoginInput): Promise<AdminAuthResponse> {
    return this.execute(input);
  }
}
