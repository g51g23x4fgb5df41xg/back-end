import type { AuthResponse, LoginInput, PasswordService, RefreshTokenStore, RegisterInput, TokenService } from "../dtos/auth.dto.js";
import type { AuthRepository, AuthUser } from "../../domain/repositories/auth.repository.js";
import { InvalidCredentialsError, RefreshTokenReplayError } from "../../domain/errors/auth.errors.js";
import { hashRefreshToken } from "../../infrastructure/services/auth-token.service.js";

const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Coordinates registration, login, refresh-token rotation, and logout. */
export class AuthUseCases {
  public constructor(
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly refreshStore: RefreshTokenStore
  ) {}

  /** Register a customer and issue an access token plus a refresh cookie value. */
  public async register(
    input: RegisterInput
  ): Promise<{ response: AuthResponse; refreshToken: string; sessionId: string }> {
    const user = await this.repository.createUser({
      ...input,
      passwordHash: await this.passwords.hash(input.password),
    });
    return this.issue(user);
  }

  /** Authenticate a customer with a non-enumerating public error. */
  public async login(
    input: LoginInput
  ): Promise<{ response: AuthResponse; refreshToken: string; sessionId: string }> {
    const user = await this.repository.findUserByIdentifier(input.identifier);
    if (!user?.isActive || !user.passwordHash || !(await this.passwords.verify(input.password, user.passwordHash))) {
      throw new InvalidCredentialsError();
    }
    return this.issue(user);
  }

  /** Rotate a refresh token once; replay revokes every session for the user. */
  public async refresh(
    rawRefreshToken: string
  ): Promise<{ response: AuthResponse; refreshToken: string; sessionId: string }> {
    let claims: { sub: string; sessionId: string; role: string };
    try {
      claims = this.tokens.verifyRefreshToken(rawRefreshToken);
    } catch {
      throw new InvalidCredentialsError();
    }

    const nextSessionId = cryptoRandomUuid();
    const nextRawToken = this.tokens.createRefreshToken({
      sub: claims.sub,
      sessionId: nextSessionId,
      role: claims.role,
    });

    const rotation = await this.repository.rotateRefreshSession({
      sessionId: claims.sessionId,
      tokenHash: hashRefreshToken(rawRefreshToken),
      newTokenHash: hashRefreshToken(nextRawToken),
      newExpiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
    });

    if (rotation.replayDetected) {
      await this.refreshStore.revokeAll(rotation.userId || claims.sub);
      await this.repository.revokeAllUserSessions(rotation.userId || claims.sub);
      throw new RefreshTokenReplayError();
    }

    await this.refreshStore.delete(claims.sessionId);
    await this.refreshStore.save(rotation.newSessionId, rotation.userId, REFRESH_TTL_SECONDS);

    const user = await this.repository.findUserById(claims.sub);
    if (!user) throw new InvalidCredentialsError();

    return {
      response: {
        accessToken: this.tokens.createAccessToken({ sub: user.id, role: user.role }),
        user: publicUser(user),
      },
      refreshToken: nextRawToken,
      sessionId: rotation.newSessionId,
    };
  }

  /** Revoke the current refresh session and remove its Redis reference. */
  public async logout(sessionId: string): Promise<void> {
    await this.repository.revokeRefreshSession(sessionId);
    await this.refreshStore.delete(sessionId);
  }

  private async issue(
    user: AuthUser
  ): Promise<{ response: AuthResponse; refreshToken: string; sessionId: string }> {
    const sessionId = cryptoRandomUuid();
    const raw = this.tokens.createRefreshToken({ sub: user.id, sessionId, role: user.role });
    await this.repository.createRefreshSession({
      userId: user.id,
      tokenHash: hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
    });
    await this.refreshStore.save(sessionId, user.id, REFRESH_TTL_SECONDS);
    return {
      response: {
        accessToken: this.tokens.createAccessToken({ sub: user.id, role: user.role }),
        user: publicUser(user),
      },
      refreshToken: raw,
      sessionId,
    };
  }
}

function cryptoRandomUuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function publicUser(user: AuthUser): AuthResponse["user"] {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    role: user.role,
  };
}
