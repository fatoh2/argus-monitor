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

- **JWT Secret Safety:** The `AllExceptionsFilter` ensures JWT secrets are never leaked in production error responses. Stack traces are stripped in production mode.

This architecture provides a strong defense against common web vulnerabilities:
- **XSS:** Refresh tokens are httpOnly — not accessible via JavaScript
- **CSRF:** `sameSite: 'strict'` prevents cross-site request forgery
- **Token theft:** Short-lived access tokens limit exposure; refresh tokens can be revoked server-side
- **Replay attacks:** Each refresh token has a unique `jti` — revocation prevents replay

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

### Global Exception Filter

- No stack traces in production responses
- Prisma errors mapped to proper HTTP status codes
- All 5xx errors logged with request context (request ID, user ID, URL)
