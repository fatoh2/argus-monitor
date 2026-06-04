import { defineConfig, devices } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../..');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Use npx --no-install to resolve vite from local node_modules/.bin/
    // without downloading from the registry. This works with npm workspace
    // hoisting where vite is installed at the workspace root.
    // cwd is set to the workspace root so npx can find vite in root node_modules/.bin/.
    command: 'VITE_E2E_TEST=true npx --no-install vite --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    cwd: rootDir,
    timeout: 30000,
  },
});
