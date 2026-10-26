# ADR-0006: Better Auth for customer authentication

Status: accepted

Better Auth (Drizzle adapter) provides email/password, passkeys, TOTP 2FA, Google/Apple sign-in and the Expo
plugin (cookie in SecureStore). Mounted at `/api/auth`; sessions are cookies on the API origin (shared parent
domain in production via crossSubDomainCookies). Staff use a separate realm (ADR-0008).
