import { Page, expect } from '@playwright/test';

const BASE_URL = process.env.REACT_APP_BACKEND_URL || 'https://candle-ecommerce-hub.preview.emergentagent.com';

export async function waitForAppReady(page: Page) {
  await page.waitForLoadState('domcontentloaded');
}

export async function dismissToasts(page: Page) {
  await page.addLocatorHandler(
    page.locator('[data-sonner-toast]').first(),
    async () => {
      const toasts = page.locator('[data-sonner-toast]');
      const count = await toasts.count();
      for (let i = 0; i < count; i++) {
        await toasts.first().click({ timeout: 1000 }).catch(() => {});
      }
    },
    { times: 15, noWaitAfter: true }
  );
}

export async function loginAsAdmin(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="login-email"]', { timeout: 10000 });
  await page.getByTestId('login-email').fill('admin@mariso.com');
  await page.getByTestId('login-password').fill('admin123');
  await page.getByTestId('login-submit').click();
  // Wait for redirect to complete
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
  await page.waitForLoadState('domcontentloaded');
}

export async function loginAsUser(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-email').fill('aisha@test.com');
  await page.getByTestId('login-password').fill('test123');
  await page.getByTestId('login-submit').click();
  await page.waitForLoadState('domcontentloaded');
}

export async function getAuthToken(email: string, password: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  return data.token || '';
}

export async function checkForErrors(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const errorElements = Array.from(
      document.querySelectorAll('.error, [class*="error"], [id*="error"]')
    );
    return errorElements.map(el => el.textContent || '').filter(Boolean);
  });
}
