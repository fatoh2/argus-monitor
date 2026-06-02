import { redact, containsEnvSecretRef, redactUrl, safeStringify } from '../logger/redact';

describe('redact', () => {
  it('should redact password fields', () => {
    const input = { email: 'test@example.com', password: 'supersecret123' };
    const result = redact(input);
    expect(result.password).toBe('***REDACTED***');
    expect(result.email).toBe('***REDACTED***');
  });

  it('should redact token fields', () => {
    const input = { accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0', refreshToken: 'some-refresh-token' };
    const result = redact(input);
    expect(result.accessToken).toBe('***REDACTED***');
    expect(result.refreshToken).toBe('***REDACTED***');
  });

  it('should redact API keys', () => {
    const input = { apiKey: 'helius-abc123def456', name: 'My App' };
    const result = redact(input);
    expect(result.apiKey).toBe('***REDACTED***');
    expect(result.name).toBe('My App');
  });

  it('should redact wallet private keys', () => {
    const input = { walletPrivateKey: '5KQmPbvGx2j8cPJq8o8z8z8z8z8z8z8z8z8z8z8z8z8z', address: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV' };
    const result = redact(input);
    expect(result.walletPrivateKey).toBe('***REDACTED***');
    // Public blockchain addresses are kept as-is (they're public by nature)
    expect(result.address).toBe('7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV');
  });

  it('should redact nested sensitive fields', () => {
    const input = {
      user: {
        email: 'user@example.com',
        passwordHash: '$2b$12$abcdefg',
        profile: {
          displayName: 'John',
          ssn: '123-45-6789',
        },
      },
    };
    const result = redact(input);
    expect(result.user.email).toBe('***REDACTED***');
    expect(result.user.passwordHash).toBe('***REDACTED***');
    expect(result.user.profile.displayName).toBe('John');
    expect(result.user.profile.ssn).toBe('***REDACTED***');
  });

  it('should handle null and undefined', () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });

  it('should handle arrays', () => {
    const input = [
      { email: 'a@example.com', password: 'secret1' },
      { email: 'b@example.com', password: 'secret2' },
    ];
    const result = redact(input);
    expect(result[0].password).toBe('***REDACTED***');
    expect(result[0].email).toBe('***REDACTED***');
    expect(result[1].password).toBe('***REDACTED***');
    expect(result[1].email).toBe('***REDACTED***');
  });

  it('should handle primitive values', () => {
    expect(redact('hello')).toBe('hello');
    expect(redact(42)).toBe(42);
    expect(redact(true)).toBe(true);
  });

  it('should not mutate the original object', () => {
    const input = { password: 'secret' };
    const result = redact(input);
    expect(result.password).toBe('***REDACTED***');
    expect(input.password).toBe('secret');
  });

  it('should handle case-insensitive field matching', () => {
    const input = { PASSWORD: 'secret', ApiKey: 'key123', REFRESH_TOKEN: 'token' };
    const result = redact(input);
    expect(result.PASSWORD).toBe('***REDACTED***');
    expect(result.ApiKey).toBe('***REDACTED***');
    expect(result.REFRESH_TOKEN).toBe('***REDACTED***');
  });

  it('should handle objects with circular references gracefully', () => {
    const input: any = { name: 'test', password: 'secret' };
    input.self = input;
    // Should not throw
    expect(() => redact(input)).not.toThrow();
    const result = redact(input);
    expect(result.password).toBe('***REDACTED***');
  });
});

describe('containsEnvSecretRef', () => {
  it('should detect process.env.*KEY* references', () => {
    expect(containsEnvSecretRef('process.env.API_KEY')).toBe(true);
    expect(containsEnvSecretRef('process.env.SECRET_KEY')).toBe(true);
    expect(containsEnvSecretRef('process.env.JWT_SECRET')).toBe(true);
    expect(containsEnvSecretRef('process.env.ACCESS_TOKEN_SECRET')).toBe(true);
    expect(containsEnvSecretRef('process.env.PRIVATE_KEY')).toBe(true);
  });

  it('should not flag non-secret env vars', () => {
    expect(containsEnvSecretRef('process.env.PORT')).toBe(false);
    expect(containsEnvSecretRef('process.env.NODE_ENV')).toBe(false);
    expect(containsEnvSecretRef('process.env.DATABASE_URL')).toBe(false);
    expect(containsEnvSecretRef('process.env.LOG_LEVEL')).toBe(false);
  });

  it('should handle empty strings', () => {
    expect(containsEnvSecretRef('')).toBe(false);
  });
});

describe('redactUrl', () => {
  it('should redact api-key in URL query params', () => {
    const url = 'https://mainnet.helius-rpc.com/?api-key=abc123def456';
    expect(redactUrl(url)).toBe('https://mainnet.helius-rpc.com/?api-key=***REDACTED***');
  });

  it('should redact token in URL query params', () => {
    const url = 'https://api.example.com/data?token=eyJhbGciOiJIUzI1NiJ9';
    expect(redactUrl(url)).toBe('https://api.example.com/data?token=***REDACTED***');
  });

  it('should handle URLs without sensitive params', () => {
    const url = 'https://api.example.com/health';
    expect(redactUrl(url)).toBe(url);
  });

  it('should handle null/undefined', () => {
    expect(redactUrl('')).toBe('');
  });
});

describe('safeStringify', () => {
  it('should produce valid JSON with redacted fields', () => {
    const obj = { email: 'test@test.com', password: 'secret' };
    const result = safeStringify(obj);
    const parsed = JSON.parse(result);
    expect(parsed.password).toBe('***REDACTED***');
    expect(parsed.email).toBe('***REDACTED***');
  });
});
