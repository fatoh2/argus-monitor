# Security

## JWT Authentication Hardening

Argus Monitor implements a robust JWT authentication system with enhanced security measures:

- **Short-lived Access Tokens (15 minutes):** Access tokens are short-lived (15 minutes) to minimize the window of opportunity for token compromise. These tokens are sent via the `Authorization: Bearer` header for authenticating requests to protected API endpoints.

- **Long-lived Refresh Tokens (7 days):** Refresh tokens are long-lived (7 days) and are used to obtain new access tokens without requiring the user to re-authenticate. Each refresh token includes a unique JWT ID (`jti`) for revocation support. The refresh token is stored as an **httpOnly cookie** (`refresh_token`) to prevent client-side JavaScript access, mitigating XSS attacks.

- **HTTP-Only Cookie Configuration:** The refresh token cookie is configured with:
  - `httpOnly: true` — not accessible via JavaScript
  - `secure: true` in production — HTTPS only
  - `sameSite: 'strict'` — CSRF protection
  - `path: '/api/auth'` — scoped to auth endpoints
  - `maxAge: 7 days` — matches refresh token TTL

- **Refresh Token Revocation:** Refresh tokens can be explicitly revoked via the `/logout` endpoint. The `RevokedToken` database model tracks revoked refresh tokens by their JWT ID (`jti`), ensuring that even if a refresh token is compromised, it cannot be used to mint new access tokens after revocation. Expired revoked tokens can be cleaned up periodically using the `expiresAt` index.

- **Token Flow:**
  1. **Login/Register:** Upon successful login or registration, the server issues a new access token (returned in response body) and a new refresh token (set as httpOnly cookie).
  2. **API Requests:** Subsequent API requests include the access token via `Authorization: Bearer <token>` header, validated by the `JwtAuthGuard`.
  3. **Token Refresh:** When an access token expires, the client calls `POST /api/auth/refresh`. The server reads the `refresh_token` cookie, validates it (checking expiration and revocation status via `jti`), and issues a new access + refresh token pair.
  4. **Logout:** The `POST /api/auth/logout` endpoint revokes the current refresh token by storing its `jti` in the `RevokedToken` table and clears the `refresh_token` cookie.

- **Cookie Parser Middleware:** The `cookie-parser` middleware is registered globally in `main.ts` to enable reading cookies from incoming requests.

- **JWT Secret Safety:** The `AllExceptionsFilter` ensures JWT secrets are never leaked in production error responses. Production responses return only `{statusCode, message}` — no stack traces, timestamp, or path.

This architecture provides a strong defense against common web vulnerabilities:
- **XSS:** Refresh tokens are httpOnly — not accessible via JavaScript
- **CSRF:** `sameSite: 'strict'` prevents cross-site request forgery
- **Token theft:** Short-lived access tokens limit exposure; refresh tokens can be revoked server-side
- **Replay attacks:** Each refresh token has a unique `jti` — revocation prevents replay


## Prisma Error Handling

All repository methods in the API service wrap Prisma calls with `try/catch` using the shared `handlePrismaError()` utility at `apps/api-service/src/common/prisma-error.handler.ts`. This provides defense-in-depth against information leakage through database errors:

| Prisma Error Code | Meaning | HTTP Response | Security Benefit |
|---|---|---|---|
| `P2002` | Unique constraint violation | `409 Conflict` — `"Resource already exists."` | Prevents enumeration attacks (no detail on which field conflicted) |
| `P2025` | Record not found | `404 Not Found` — `"Resource not found."` | Consistent error messages prevent resource enumeration |
| `P2003` | Foreign key violation | `400 Bad Request` — `"Invalid foreign key."` | Generic message doesn't reveal schema details |
| Other | Unexpected Prisma error | `500 Internal Server Error` — `"Internal server error"` | Full error logged server-side only; never exposed to client |

**Services using `handlePrismaError()`:** `WalletsService`, `ChainsService`, `AuthService`, `AlertRulesService` — all CRUD methods.

This complements the global `AllExceptionsFilter` by catching Prisma errors at the service layer before they reach the filter, ensuring consistent, safe error responses even if the filter's Prisma handling were bypassed.

**Source:** `apps/api-service/src/common/prisma-error.handler.ts`

## Secret Redaction

Argus Monitor enforces a strict **no secrets in logs** policy to prevent accidental exposure of credentials, tokens, or PII through application logs.

### Redaction Utility (`redact.ts`)

The `redact()` utility at `apps/api-service/src/common/logger/redact.ts` provides reusable functions for masking sensitive data:

| Function | Purpose |
|----------|---------|
| `redact(obj)` | Recursively masks sensitive fields (passwords, tokens, API keys, PII, wallet private keys, mnemonics) in any object. Returns a new object — does not mutate the original. |
| `redactUrl(url)` | Strips API keys and tokens from URL query parameters |
| `safeStringify(obj)` | JSON.stringify with automatic redaction of sensitive fields |
| `containsEnvSecretRef(str)` | Detects `process.env.*KEY*` references in strings |

**Sensitive fields detected** (case-insensitive matching):
- Authentication: `password`, `passwd`, `secret`, `token`, `accesstoken`, `refreshtoken`, `jwt`, `jti`, `apikey`, `api_key`, `privatekey`, `secretkey`
- PII: `email`, `phone`, `ssn`, `creditcard`, `cvv`
- Blockchain: `mnemonic`, `seedphrase`, `walletprivatekey`, `passwordhash`

### Where Redaction Is Applied

1. **Solana Consumer** — Wallet addresses in logs are partially redacted (first 4 + last 4 characters preserved) for traceability without exposing full addresses.

2. **All Service Bootstrap Logs** — All six services now use NestJS `Logger` (structured, level-aware) instead of `console.log`, ensuring consistent log formatting and level filtering.

### Automated Enforcement

A lint-style test (`apps/api-service/src/common/__tests__/log-secrets-lint.spec.ts`) scans all `.ts` and `.tsx` source files for log calls that reference secret environment variables. It detects patterns like:

```typescript
// These will FAIL the lint test:
logger.log(process.env.API_KEY)
console.log(process.env.SECRET_TOKEN)

// Use the redact() helper instead:
logger.log(redact({ apiKey: process.env.API_KEY }))
```

The test checks for env var names matching: `KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `PASSWD`, `PRIVATE`, `MNEMONIC`, `SEED`. If a violation is found, the test fails with the exact file path and line number.

### Best Practices

- Always use `redact()` before logging objects that may contain user input or configuration values
- Use `safeStringify()` instead of `JSON.stringify()` when serializing objects for logs
- Use `redactUrl()` when logging URLs that may contain query parameters with API keys
- Never use `console.log()` — always use NestJS `Logger` for structured, level-aware logging

## Additional Security Measures

### HTTP Security Headers

The API service uses the `helmet` middleware to set secure HTTP headers:

- **Content-Security-Policy** — restricts resource loading
- **Strict-Transport-Security** — enforces HTTPS
- **X-Frame-Options** — prevents clickjacking
- **X-Content-Type-Options** — prevents MIME sniffing
- And other security headers

### CORS

CORS is configured with strict allowed origins via the `ALLOWED_ORIGINS` environment variable:

- In production: must be explicitly set to your frontend domain(s), comma-separated
- In development: defaults to `*` (all origins allowed)
- Credentials are enabled (`credentials: true`) to support cookie-based auth

### Rate Limiting

All public endpoints are rate-limited to prevent abuse:

- Global: 100 requests per 60 seconds per IP
- Auth endpoints: 10 requests per 60 seconds per IP (mitigates brute-force attacks)
- Health endpoint: exempt from rate limiting

Auth rate limiting is validated by an integration test (`apps/api-service/src/auth/__tests__/auth.controller.spec.ts`) that uses supertest to hit the full NestJS HTTP pipeline. The test makes 10 successful requests through the controller, then asserts the 11th returns HTTP 429 with a `retry-after` header. The test module configures a global limit of 100 to prove the controller-level `@Throttle({ default: { limit: 10, ttl: 60_000 } })` decorator is what enforces the 10-request cap — not the module-level config.

### Global Exception Filter

- Production responses return only `{statusCode, message}` — no stack traces, timestamp, or path
- Development responses include `timestamp`, `path`, and `stack` for debugging
- Prisma errors mapped to proper HTTP status codes (`P2002` → 409, `P2025` → 404, `P2003` → 400, others → 500)
- All errors logged with HTTP status and request URL
- Extends `BaseExceptionFilter` from `@nestjs/core`, registered via `HttpAdapterHost`
