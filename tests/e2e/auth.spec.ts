import { test, expect } from '@playwright/test';
import { dismissToasts } from '../fixtures/helpers';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
  });

  test('login page loads with tabs', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('login-page')).toBeVisible();
    await expect(page.getByTestId('tab-password')).toBeVisible();
    await expect(page.getByTestId('tab-otp')).toBeVisible();
  });

  test('user login with email and password', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email').fill('aisha@test.com');
    await page.getByTestId('login-password').fill('test123');
    await page.getByTestId('login-submit').click();
    // Should redirect to home after login
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/?$/);
  });

  test('admin login and sees admin menu', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email').fill('admin@mariso.com');
    await page.getByTestId('login-password').fill('admin123');
    await page.getByTestId('login-submit').click();
    await page.waitForLoadState('domcontentloaded');
    // Should see user menu after login
    await expect(page.getByTestId('user-menu-button')).toBeVisible();
  });

  test('invalid login shows error toast', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email').fill('wrong@example.com');
    await page.getByTestId('login-password').fill('wrongpass');
    await page.getByTestId('login-submit').click();
    // Should show error (stays on login page)
    await expect(page).toHaveURL(/\/login/);
  });

  test('OTP tab shows OTP login form', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('tab-otp').click();
    await expect(page.getByTestId('otp-email')).toBeVisible();
    await expect(page.getByTestId('request-otp')).toBeVisible();
  });

  test('OTP request sends OTP', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('tab-otp').click();
    await page.getByTestId('otp-email').fill('aisha@test.com');
    await page.getByTestId('request-otp').click();
    // Should show OTP input after sending
    await expect(page.getByTestId('verify-otp')).toBeVisible({ timeout: 10000 });
  });

  test('register page loads', async ({ page }) => {
    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('register-page')).toBeVisible();
    await expect(page.getByTestId('register-name')).toBeVisible();
    await expect(page.getByTestId('register-email')).toBeVisible();
    await expect(page.getByTestId('register-password')).toBeVisible();
  });

  test('new user registration', async ({ page }) => {
    const uniqueEmail = `testuser_${Date.now()}@example.com`;
    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('register-name').fill('New Test User');
    await page.getByTestId('register-email').fill(uniqueEmail);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    // Should redirect after registration
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/?$/);
  });

  test('logout works', async ({ page }) => {
    // Login first
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-email').fill('aisha@test.com');
    await page.getByTestId('login-password').fill('test123');
    await page.getByTestId('login-submit').click();
    await page.waitForLoadState('domcontentloaded');
    
    // Open user menu and logout
    await page.getByTestId('user-menu-button').click();
    await page.getByTestId('menu-logout').click();
    // Should show login button again
    await expect(page.getByTestId('login-button')).toBeVisible();
  });
});
