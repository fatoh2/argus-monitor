/**
 * Lint-style test: ensure no log call references a secret environment variable.
 *
 * This test scans all source files for patterns like:
 *   logger.log(process.env.API_KEY)
 *   console.log(process.env.SECRET)
 *
 * If this test fails, a developer is accidentally logging a secret.
 */

import * as fs from 'fs';
import * as path from 'path';

const APPS_DIR = path.resolve(__dirname, '../../../../..');

// Env var name patterns that indicate a secret
const SECRET_ENV_PATTERNS = [
  /KEY/i,
  /SECRET/i,
  /TOKEN/i,
  /PASSWORD/i,
  /PASSWD/i,
  /PRIVATE/i,
  /MNEMONIC/i,
  /SEED/i,
];

// Files to exclude from scanning
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /dist/,
  /\.git/,
  /__tests__\/log-secrets-lint\.spec\.ts$/,
];

function shouldExclude(filePath: string): boolean {
  return EXCLUDE_PATTERNS.some((p) => p.test(filePath));
}

function isSecretEnvVar(varName: string): boolean {
  return SECRET_ENV_PATTERNS.some((p) => p.test(varName));
}

describe('Log secret lint', () => {
  it('should not have any log call referencing a secret env var', () => {
    const violations: string[] = [];

    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (shouldExclude(fullPath)) continue;

        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Check if this line has a log call
            const isLogCall = /\b(console\.log|logger\.\w+|Logger\.\w+)\s*\(/.test(line);
            if (!isLogCall) continue;

            // Check if the log call references process.env.*SECRET*
            const envRefs = line.match(/process\.env\.(\w+)/g);
            if (envRefs) {
              for (const ref of envRefs) {
                const varName = ref.replace('process.env.', '');
                if (isSecretEnvVar(varName)) {
                  violations.push(
                    fullPath + ':' + (i + 1) + ': ' + line.trim(),
                  );
                }
              }
            }
          }
        }
      }
    }

    scanDir(APPS_DIR);

    if (violations.length > 0) {
      fail(
        'Found ' + violations.length + ' log call(s) referencing secret env vars:\n' +
        violations.join('\n') + '\n\n' +
        'Use the redact() helper to mask secrets before logging.',
      );
    }
  });
});
