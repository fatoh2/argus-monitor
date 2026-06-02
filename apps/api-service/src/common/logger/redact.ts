/**
 * Redact sensitive fields from objects before logging.
 *
 * Masks known secret/PII fields in any object or value.
 * Use this anywhere user objects, request bodies, or config objects are logged.
 */

// Fields that contain secrets or PII — must never appear in logs
// All lowercase for case-insensitive matching
const SENSITIVE_FIELDS = new Set([
  // Authentication secrets
  'password',
  'passwd',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'jwt',
  'jti',
  'apikey',
  'api_key',
  'privatekey',
  'private_key',
  'secretkey',
  'secret_key',
  // PII
  'email',
  'phone',
  'phonenumber',
  'phone_number',
  'ssn',
  'socialsecuritynumber',
  'creditcard',
  'credit_card',
  'cvv',
  // Wallet/blockchain secrets
  'mnemonic',
  'seedphrase',
  'seed_phrase',
  'walletprivatekey',
  'wallet_private_key',
  // Hash fields that could contain secrets
  'passwordhash',
  'password_hash',
]);

const REDACTED_STRING = '***REDACTED***';

/**
 * Recursively redact sensitive fields from an object.
 * Returns a new object — does not mutate the original.
 *
 * @param obj - The value to redact (object, array, or primitive)
 * @param depth - Internal recursion depth tracker (prevents infinite loops)
 */
export function redact<T>(obj: T, depth = 0): T {
  // Prevent infinite recursion on circular references
  if (depth > 10) {
    return obj;
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle primitives — return as-is
  if (typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => redact(item, depth + 1)) as unknown as T;
  }

  // Handle plain objects and class instances
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Normalize key: remove non-alphanumeric chars and lowercase for matching
    const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    if (SENSITIVE_FIELDS.has(normalizedKey)) {
      // Redact the value entirely
      result[key] = REDACTED_STRING;
    } else if (typeof value === 'object' && value !== null) {
      // Recurse into nested objects
      result[key] = redact(value, depth + 1);
    } else {
      // Keep non-sensitive values as-is
      result[key] = value;
    }
  }

  return result as unknown as T;
}

/**
 * Check if a string contains a reference to an environment variable
 * that looks like a secret key.
 */
export function containsEnvSecretRef(str: string): boolean {
  const envKeyPattern = /process\.env\.\w*(KEY|SECRET|TOKEN|PASSWORD|API_KEY|APIKEY|PRIVATE)\w*/i;
  return envKeyPattern.test(str);
}

/**
 * Redact a URL string by stripping query params that look like API keys.
 */
export function redactUrl(url: string): string {
  if (!url) return url;
  return url.replace(/([?&])(api[_-]?key|token|secret|jwt)=[^&]+/gi, '$1$2=***REDACTED***');
}

/**
 * Safely stringify an object for logging, redacting sensitive fields.
 */
export function safeStringify(obj: unknown, space?: number): string {
  return JSON.stringify(redact(obj), null, space);
}
