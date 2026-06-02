import { test, expect } from '@playwright/test';

test.describe('Auth Flow', () => {
  test('should register a new user', async ({ page }) => {
    await page.goto('/register');

    await expect(page.getByTestId('register-title')).toBeVisible();

    await page.getByTestId('register-email').fill('test@example.com');
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-confirm-password').fill('password123');
    await page.getByTestId('register-submit').click();

    // Should redirect to dashboard after successful registration
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('dashboard-title')).toBeVisible();
    await expect(page.getByTestId('user-email')).toHaveText('test@example.com');
  });

  test('should login an existing user', async ({ page }) => {
    // First register a user
    await page.goto('/register');
    await page.getByTestId('register-email').fill('login-test@example.com');
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-confirm-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/\/dashboard/);

    // Logout
    await page.getByTestId('logout-button').click();
    await expect(page).toHaveURL(/\/login/);

    // Login again
    await page.getByTestId('login-email').fill('login-test@example.com');
    await page.getByTestId('login-password').fill('password123');
    await page.getByTestId('login-submit').click();

    // Should be on dashboard
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('user-email')).toHaveText('login-test@example.com');
  });

  test('should show error on invalid login', async ({ page }) => {
    await page.goto('/login');

    await page.getByTestId('login-email').fill('wrong@example.com');
    await page.getByTestId('login-password').fill('wrongpassword');
    await page.getByTestId('login-submit').click();

    await expect(page.getByTestId('login-error')).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    // Register and login
    await page.goto('/register');
    await page.getByTestId('register-email').fill('logout-test@example.com');
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-confirm-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/\/dashboard/);

    // Logout
    await page.getByTestId('logout-button').click();

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('login-title')).toBeVisible();
  });

  test('should redirect to login when accessing dashboard without auth', async ({ page }) => {
    // Clear any stored tokens
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
