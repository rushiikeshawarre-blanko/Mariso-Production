import { test, expect } from '@playwright/test';
import { dismissToasts, loginAsUser } from '../fixtures/helpers';

test.describe('Checkout Flow', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
  });

  test('checkout requires login - redirects to login', async ({ page }) => {
    await page.goto('/checkout', { waitUntil: 'domcontentloaded' });
    // Should redirect to login since not authenticated
    await expect(page).toHaveURL(/\/login/);
  });

  test('checkout page loads with billing form when logged in', async ({ page }) => {
    // Login first
    await loginAsUser(page);
    // Add item to cart
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    const productCard = page.locator('[data-testid^="product-card-"]').first();
    await expect(productCard).toBeVisible({ timeout: 15000 });
    await productCard.click();
    await expect(page.getByTestId('add-to-cart-button')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('add-to-cart-button').click();
    
    // Go to checkout
    await page.goto('/checkout', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('checkout-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('checkout-name')).toBeVisible();
    await expect(page.getByTestId('checkout-phone')).toBeVisible();
    await expect(page.getByTestId('checkout-email')).toBeVisible();
    await expect(page.getByTestId('checkout-address')).toBeVisible();
  });

  test('checkout has payment options', async ({ page }) => {
    await loginAsUser(page);
    // Add item
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    const productCard = page.locator('[data-testid^="product-card-"]').first();
    await expect(productCard).toBeVisible({ timeout: 15000 });
    await productCard.click();
    await expect(page.getByTestId('add-to-cart-button')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('add-to-cart-button').click();
    
    await page.goto('/checkout', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('payment-upi')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('payment-card')).toBeVisible();
    await expect(page.getByTestId('payment-cod')).toBeVisible();
  });

  test('complete checkout flow with mock payment', async ({ page }) => {
    await loginAsUser(page);
    // Add item
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    const productCard = page.locator('[data-testid^="product-card-"]').first();
    await expect(productCard).toBeVisible({ timeout: 15000 });
    await productCard.click();
    await expect(page.getByTestId('add-to-cart-button')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('add-to-cart-button').click();
    
    await page.goto('/checkout', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('checkout-page')).toBeVisible({ timeout: 10000 });
    
    // Fill billing form
    await page.getByTestId('checkout-name').fill('Test User');
    await page.getByTestId('checkout-phone').fill('9876543210');
    await page.getByTestId('checkout-email').fill('aisha@test.com');
    await page.getByTestId('checkout-address').fill('123 Test Street');
    await page.getByTestId('checkout-city').fill('Mumbai');
    await page.getByTestId('checkout-postal').fill('400001');
    
    // Select COD payment
    await page.getByTestId('payment-cod').click();
    
    // Place order
    await page.getByTestId('place-order-button').click({ force: true });
    
    // Should redirect to order success
    await expect(page).toHaveURL(/\/order-success\//, { timeout: 15000 });
  });
});

test.describe('User Account', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
  });

  test('account requires authentication', async ({ page }) => {
    await page.goto('/account', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/);
  });

  test('account page loads after login', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/account', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('account-page')).toBeVisible({ timeout: 10000 });
  });

  test('account orders page loads', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/account/orders', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('account-page')).toBeVisible({ timeout: 10000 });
    // Either shows orders list or empty state
    const ordersList = page.getByTestId('orders-list');
    const noOrders = page.getByTestId('no-orders');
    await expect(ordersList.or(noOrders)).toBeVisible({ timeout: 10000 });
  });

  test('account wishlist page loads', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/account/wishlist', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('account-page')).toBeVisible({ timeout: 10000 });
    // Either shows wishlist or empty state
    const wishlist = page.getByTestId('wishlist-page');
    const emptyWishlist = page.getByTestId('empty-wishlist');
    await expect(wishlist.or(emptyWishlist)).toBeVisible({ timeout: 10000 });
  });

  test('wishlist navigation from navbar menu', async ({ page }) => {
    await loginAsUser(page);
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('user-menu-button').click();
    await page.getByTestId('menu-wishlist').click();
    await expect(page).toHaveURL(/\/account\/wishlist/);
  });
});
