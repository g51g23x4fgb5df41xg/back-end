/** Typed error that can safely be mapped to an HTTP response. */
export class AuthError extends Error {
  public constructor(public readonly code: string, message: string, public readonly statusCode = 401) {
    super(message);
    this.name = "AuthError";
  }
}

/** Prevents account enumeration by using the same response for invalid credentials. */
export class InvalidCredentialsError extends AuthError {
  public constructor() {
    super("INVALID_CREDENTIALS", "بيانات الدخول غير صحيحة / Invalid credentials", 401);
  }
}

/** Signals refresh-token replay and triggers global session revocation. */
export class RefreshTokenReplayError extends AuthError {
  public constructor() {
    super("REFRESH_TOKEN_REPLAY", "تم الكشف عن محاولة إعادة استخدام رمز الجلسة / Refresh token reuse detected", 401);
  }
}
