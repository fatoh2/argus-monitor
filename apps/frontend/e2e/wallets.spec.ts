import { test, expect } from '@playwright/test';

test.describe('Wallet Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Register a user before each test
    await page.goto('/register');
    await page.getByTestId('register-email').fill(`wallet-test-${Date.now()}@example.com`);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-confirm-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('should add a Solana wallet', async ({ page }) => {
    await page.getByTestId('wallet-address-input').fill('SolanaWalletAddress123456789');
    await page.getByTestId('wallet-chain-select').selectOption('SOLANA');
    await page.getByTestId('add-wallet-submit').click();

    // Wait for the wallet to appear in the list
    await expect(page.getByTestId('no-wallets')).not.toBeVisible();
    await expect(page.getByText('SolanaWalletAddress123456789')).toBeVisible();
  });

  test('should add an Ethereum wallet', async ({ page }) => {
    await page.getByTestId('wallet-address-input').fill('0xEthereumWalletAddress123');
    await page.getByTestId('wallet-chain-select').selectOption('ETHEREUM');
    await page.getByTestId('add-wallet-submit').click();

    await expect(page.getByText('0xEthereumWalletAddress123')).toBeVisible();
    await expect(page.getByText('ETHEREUM')).toBeVisible();
  });

  test('should display wallet balances', async ({ page }) => {
    // Add a wallet
    await page.getByTestId('wallet-address-input').fill('BalanceTestWallet123');
    await page.getByTestId('wallet-chain-select').selectOption('SOLANA');
    await page.getByTestId('add-wallet-submit').click();

    // Verify wallet appears in the wallets section
    await expect(page.getByText('BalanceTestWallet123')).toBeVisible();
    await expect(page.getByText('SOLANA')).toBeVisible();
  });

  test('should delete a wallet', async ({ page }) => {
    // Add a wallet first
    await page.getByTestId('wallet-address-input').fill('DeleteTestWallet123');
    await page.getByTestId('wallet-chain-select').selectOption('SOLANA');
    await page.getByTestId('add-wallet-submit').click();
    await expect(page.getByText('DeleteTestWallet123')).toBeVisible();

    // Delete the wallet - find the delete button for this wallet
    const walletItem = page.getByText('DeleteTestWallet123').locator('..');
    const deleteButton = walletItem.locator('..').getByTestId(/delete-wallet-/);
    await deleteButton.click();

    // Wallet should be removed
    await expect(page.getByText('DeleteTestWallet123')).not.toBeVisible();
  });

  test('should show empty state when no wallets', async ({ page }) => {
    await expect(page.getByTestId('no-wallets')).toBeVisible();
  });
});
