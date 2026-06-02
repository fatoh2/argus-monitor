import { test, expect } from '@playwright/test';

test.describe('Alert Rules Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Register a user
    await page.goto('/register');
    await page.getByTestId('register-email').fill(`alert-test-${Date.now()}@example.com`);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-confirm-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/\/dashboard/);

    // Add a wallet first (alert rules need a wallet)
    await page.getByTestId('wallet-address-input').fill('AlertRuleWallet123');
    await page.getByTestId('wallet-chain-select').selectOption('SOLANA');
    await page.getByTestId('add-wallet-submit').click();
    await expect(page.getByText('AlertRuleWallet123')).toBeVisible();
  });

  test('should create a balance_low alert rule', async ({ page }) => {
    // Select the wallet and create rule
    await page.getByTestId('alert-rule-wallet-select').selectOption({ index: 1 });
    await page.getByTestId('alert-rule-type-select').selectOption('balance_low');
    await page.getByTestId('alert-rule-threshold-input').fill('1000000000');
    await page.getByTestId('add-alert-rule-submit').click();

    // Verify rule appears in the list
    await expect(page.getByTestId('no-alert-rules')).not.toBeVisible();
    await expect(page.getByText('balance low')).toBeVisible();
    await expect(page.getByText('Threshold: 1000000000')).toBeVisible();
  });

  test('should create a balance_high alert rule without threshold', async ({ page }) => {
    await page.getByTestId('alert-rule-wallet-select').selectOption({ index: 1 });
    await page.getByTestId('alert-rule-type-select').selectOption('balance_high');
    await page.getByTestId('add-alert-rule-submit').click();

    await expect(page.getByText('balance high')).toBeVisible();
  });

  test('should create a transaction alert rule', async ({ page }) => {
    await page.getByTestId('alert-rule-wallet-select').selectOption({ index: 1 });
    await page.getByTestId('alert-rule-type-select').selectOption('transaction_from');
    await page.getByTestId('add-alert-rule-submit').click();

    await expect(page.getByText('transaction from')).toBeVisible();
  });

  test('should display multiple alert rules in the list', async ({ page }) => {
    // Create first rule
    await page.getByTestId('alert-rule-wallet-select').selectOption({ index: 1 });
    await page.getByTestId('alert-rule-type-select').selectOption('balance_low');
    await page.getByTestId('add-alert-rule-submit').click();
    await expect(page.getByText('balance low')).toBeVisible();

    // Create second rule
    await page.getByTestId('alert-rule-wallet-select').selectOption({ index: 1 });
    await page.getByTestId('alert-rule-type-select').selectOption('balance_high');
    await page.getByTestId('add-alert-rule-submit').click();
    await expect(page.getByText('balance high')).toBeVisible();

    // Verify both rules are in the list
    const rulesSection = page.getByTestId('alert-rules-section');
    await expect(rulesSection.getByText('balance low')).toBeVisible();
    await expect(rulesSection.getByText('balance high')).toBeVisible();
  });

  test('should show empty state when no alert rules', async ({ page }) => {
    await expect(page.getByTestId('no-alert-rules')).toBeVisible();
  });
});
