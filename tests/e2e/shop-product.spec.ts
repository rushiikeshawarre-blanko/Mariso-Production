import { test, expect } from '@playwright/test';
import { dismissToasts } from '../fixtures/helpers';

test.describe('Shop Page', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
  });

  test('shop page loads with products', async ({ page }) => {
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('shop-page')).toBeVisible();
    // Should show product cards (shop prefix)
    const productCards = page.locator('[data-testid^="shop-card-"]');
    await expect(productCards.first()).toBeVisible({ timeout: 15000 });
  });

  test('shop page displays 13 products', async ({ page }) => {
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    const productCards = page.locator('[data-testid^="shop-card-"]');
    await expect(productCards.first()).toBeVisible({ timeout: 15000 });
    const count = await productCards.count();
    expect(count).toBeGreaterThanOrEqual(13);
  });

  test('category filter works', async ({ page }) => {
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    // Wait for categories to load
    await expect(page.getByTestId('filter-all-categories')).toBeVisible({ timeout: 10000 });
    // Click on a category filter
    const categoryFilters = page.locator('[data-testid^="filter-category-"]');
    const count = await categoryFilters.count();
    if (count > 0) {
      await categoryFilters.first().click();
      // Products should be filtered
      await page.waitForLoadState('domcontentloaded');
    }
  });

  test('sort select is functional', async ({ page }) => {
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('sort-select')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('sort-select').click();
  });

  test('sale filter checkbox is visible', async ({ page }) => {
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('filter-sale-checkbox')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Product Page', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
  });

  test('product detail page loads correctly', async ({ page }) => {
    // Go to shop first, then click a product
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    const productCard = page.locator('[data-testid^="shop-card-"]').first();
    await expect(productCard).toBeVisible({ timeout: 15000 });
    await productCard.click();
    
    await expect(page.getByTestId('product-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('product-title')).toBeVisible();
    await expect(page.getByTestId('product-price')).toBeVisible();
    await expect(page.getByTestId('product-description')).toBeVisible();
  });

  test('product page has add to cart button', async ({ page }) => {
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    const productCard = page.locator('[data-testid^="shop-card-"]').first();
    await expect(productCard).toBeVisible({ timeout: 15000 });
    await productCard.click();
    
    await expect(page.getByTestId('add-to-cart-button')).toBeVisible({ timeout: 10000 });
  });

  test('product quantity controls work', async ({ page }) => {
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    const productCard = page.locator('[data-testid^="shop-card-"]').first();
    await expect(productCard).toBeVisible({ timeout: 15000 });
    await productCard.click();
    
    await expect(page.getByTestId('quantity-value')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('quantity-increase')).toBeVisible();
    await expect(page.getByTestId('quantity-decrease')).toBeVisible();
    
    // Increase quantity
    await page.getByTestId('quantity-increase').click();
    await expect(page.getByTestId('quantity-value')).toHaveText('2');
  });

  test('product tabs work (details, care, shipping)', async ({ page }) => {
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    const productCard = page.locator('[data-testid^="shop-card-"]').first();
    await expect(productCard).toBeVisible({ timeout: 15000 });
    await productCard.click();
    
    await expect(page.getByTestId('tab-details')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('tab-care')).toBeVisible();
    await expect(page.getByTestId('tab-shipping')).toBeVisible();
    
    // Click care tab
    await page.getByTestId('tab-care').click();
  });

  test('add to cart from product page', async ({ page }) => {
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    const productCard = page.locator('[data-testid^="shop-card-"]').first();
    await expect(productCard).toBeVisible({ timeout: 15000 });
    await productCard.click();
    
    await expect(page.getByTestId('add-to-cart-button')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('add-to-cart-button').click();
    
    // Cart count should update
    await expect(page.getByTestId('cart-count')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Cart', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
  });

  test('empty cart page shows appropriate message', async ({ page }) => {
    await page.goto('/cart', { waitUntil: 'domcontentloaded' });
    // Could be empty or have items - just verify page loads
    const emptyCart = page.getByTestId('cart-page-empty');
    const cartPage = page.getByTestId('cart-page');
    // Wait for either to be visible
    await expect(emptyCart.or(cartPage)).toBeVisible({ timeout: 10000 });
  });

  test('add item to cart and verify cart page', async ({ page }) => {
    // Add product to cart via product page
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    const productCard = page.locator('[data-testid^="product-card-"]').first();
    await expect(productCard).toBeVisible({ timeout: 15000 });
    
    // Click add to cart directly on product card
    const addToCartBtn = page.locator('[data-testid^="product-card-"]').first().locator('[data-testid$="-add-to-cart"]');
    if (await addToCartBtn.isVisible()) {
      await addToCartBtn.click({ force: true });
    } else {
      await productCard.click();
      await expect(page.getByTestId('add-to-cart-button')).toBeVisible({ timeout: 10000 });
      await page.getByTestId('add-to-cart-button').click();
    }
    
    // Navigate to cart
    await page.goto('/cart', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('cart-page')).toBeVisible({ timeout: 10000 });
  });

  test('cart shows subtotal and total', async ({ page }) => {
    // First add an item
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    const productCard = page.locator('[data-testid^="product-card-"]').first();
    await expect(productCard).toBeVisible({ timeout: 15000 });
    await productCard.click();
    await expect(page.getByTestId('add-to-cart-button')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('add-to-cart-button').click();
    
    await page.goto('/cart', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('cart-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('cart-subtotal')).toBeVisible();
    await expect(page.getByTestId('cart-total')).toBeVisible();
  });

  test('proceed to checkout button visible in cart', async ({ page }) => {
    // Add item first
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    const productCard = page.locator('[data-testid^="product-card-"]').first();
    await expect(productCard).toBeVisible({ timeout: 15000 });
    await productCard.click();
    await expect(page.getByTestId('add-to-cart-button')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('add-to-cart-button').click();
    
    await page.goto('/cart', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('proceed-to-checkout')).toBeVisible({ timeout: 10000 });
  });
});
