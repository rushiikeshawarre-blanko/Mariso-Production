import { test, expect } from '@playwright/test';
import { waitForAppReady, dismissToasts } from '../fixtures/helpers';

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
  });

  test('homepage loads with hero section', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('hero-section')).toBeVisible();
    await expect(page.getByTestId('hero-shop-candles')).toBeVisible();
    await expect(page.getByTestId('hero-shop-homewares')).toBeVisible();
  });

  test('featured products section loads', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('featured-section')).toBeVisible();
    await expect(page.getByTestId('view-all-featured')).toBeVisible();
  });

  test('categories section displays categories', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('categories-section')).toBeVisible();
    // Should have at least one category card
    const categoryCards = page.locator('[data-testid^="category-card-"]');
    await expect(categoryCards.first()).toBeVisible();
  });

  test('bestsellers section loads', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('bestsellers-section')).toBeVisible();
  });

  test('newsletter section is visible', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('newsletter-section')).toBeVisible();
    await expect(page.getByTestId('newsletter-email-home')).toBeVisible();
  });

  test('navbar is visible with correct links', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('navbar')).toBeVisible();
    await expect(page.getByTestId('navbar-logo')).toBeVisible();
    await expect(page.getByTestId('cart-button')).toBeVisible();
  });

  test('hero CTA navigates to shop', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('hero-shop-candles').click();
    await expect(page).toHaveURL(/\/shop/);
  });
});

test.describe('Navigation', () => {
  test('navigates to shop page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('nav-link-shop').click();
    await expect(page).toHaveURL(/\/shop/);
  });

  test('navigates to cart page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('cart-button').click();
    await expect(page).toHaveURL(/\/cart/);
  });

  test('login button navigates to login page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('login-button').click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('register link is present on login page', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('go-to-register')).toBeVisible();
  });
});
