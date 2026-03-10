import { test, expect } from '@playwright/test';
import { dismissToasts, loginAsAdmin } from '../fixtures/helpers';

const BASE_URL = process.env.REACT_APP_BACKEND_URL || 'https://candle-ecommerce-hub.preview.emergentagent.com';

// Current product IDs with known variant configurations
const PRODUCT_WITH_COLORS = 'b187b202-8994-446c-9187-523c9739050c'; // Sandstone Ripple Coaster Set (3 colors)
const PRODUCT_WITH_FLAVORS = '180014db-c137-4e0c-a2de-a54b939f6efd'; // Vanilla Sandstone Candle (4 flavors)
const PRODUCT_WITH_BOTH = '07370897-912d-48d0-8d54-5152fc3ebd0c'; // Rose Candle Bouquet (3 colors x 3 fragrances)

test.describe('Product Page - Color Variants', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
  });

  test('product with color options displays color variants section', async ({ page }) => {
    await page.goto(`/product/${PRODUCT_WITH_COLORS}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('product-page')).toBeVisible({ timeout: 10000 });
    
    // Should show color variants section
    await expect(page.getByTestId('color-variants')).toBeVisible();
    
    // Should display color name "Natural White" (first color is selected by default)
    await expect(page.getByText('Color: Natural White')).toBeVisible();
    
    // Should show color buttons
    await expect(page.getByTestId('color-natural-white')).toBeVisible();
    await expect(page.getByTestId('color-sandstone')).toBeVisible();
    await expect(page.getByTestId('color-charcoal')).toBeVisible();
  });

  test('clicking color variant updates the displayed color name', async ({ page }) => {
    await page.goto(`/product/${PRODUCT_WITH_COLORS}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('product-page')).toBeVisible({ timeout: 10000 });
    
    // Initial color should be Natural White
    await expect(page.getByText('Color: Natural White')).toBeVisible();
    
    // Click on Sandstone color
    await page.getByTestId('color-sandstone').click();
    
    // Color name should update
    await expect(page.getByText('Color: Sandstone')).toBeVisible();
    
    // Click on Charcoal color
    await page.getByTestId('color-charcoal').click();
    await expect(page.getByText('Color: Charcoal')).toBeVisible();
  });

  test('color variant selection changes product gallery images', async ({ page }) => {
    await page.goto(`/product/${PRODUCT_WITH_COLORS}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('product-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('product-image-gallery')).toBeVisible();
    
    // Get the initial main image src
    const mainImage = page.getByTestId('gallery-main-image');
    await expect(mainImage).toBeVisible();
    const initialSrc = await mainImage.getAttribute('src');
    
    // Click on Sandstone color (which has different images)
    await page.getByTestId('color-sandstone').click();
    
    // Wait for image to change - the src should be different
    await expect(mainImage).toHaveAttribute('src', /images\.unsplash\.com/);
    const newSrc = await mainImage.getAttribute('src');
    
    // Images should be different (colors have different image sets)
    expect(newSrc).not.toBe(initialSrc);
  });
});

test.describe('Product Page - Flavor Variants', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
  });

  test('product with flavor options displays flavor variants section', async ({ page }) => {
    await page.goto(`/product/${PRODUCT_WITH_FLAVORS}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('product-page')).toBeVisible({ timeout: 10000 });
    
    // Should show flavor variants section
    await expect(page.getByTestId('flavor-variants')).toBeVisible();
    
    // Should display fragrance name "Vanilla" (first flavor is selected by default)
    await expect(page.getByText('Fragrance: Vanilla')).toBeVisible();
    
    // Should show flavor buttons
    await expect(page.getByTestId('flavor-vanilla')).toBeVisible();
    await expect(page.getByTestId('flavor-lavender')).toBeVisible();
    await expect(page.getByTestId('flavor-rose')).toBeVisible();
    await expect(page.getByTestId('flavor-oud-&-amber')).toBeVisible();
  });

  test('clicking flavor variant updates the displayed flavor name and description', async ({ page }) => {
    await page.goto(`/product/${PRODUCT_WITH_FLAVORS}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('product-page')).toBeVisible({ timeout: 10000 });
    
    // Initial flavor should be Vanilla
    await expect(page.getByText('Fragrance: Vanilla')).toBeVisible();
    await expect(page.getByText('Warm and comforting vanilla')).toBeVisible();
    
    // Click on Lavender flavor
    await page.getByTestId('flavor-lavender').click();
    
    // Flavor name and description should update
    await expect(page.getByText('Fragrance: Lavender')).toBeVisible();
    await expect(page.getByText('Calming lavender fields')).toBeVisible();
    
    // Click on Rose flavor
    await page.getByTestId('flavor-rose').click();
    await expect(page.getByText('Fragrance: Rose')).toBeVisible();
  });
});

test.describe('Product Page - Variant Combination Stock', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
  });

  test('product displays variant combination stock (not base stock)', async ({ page }) => {
    await page.goto(`/product/${PRODUCT_WITH_BOTH}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('product-page')).toBeVisible({ timeout: 10000 });
    
    // Default selection is White + Rose with stock=10
    await expect(page.getByTestId('stock-status')).toBeVisible();
    await expect(page.getByTestId('product-stock-available')).toContainText('In Stock');
    await expect(page.getByTestId('product-stock-available')).toContainText('10 available');
  });

  test('stock changes when selecting different color+fragrance combination', async ({ page }) => {
    await page.goto(`/product/${PRODUCT_WITH_BOTH}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('product-page')).toBeVisible({ timeout: 10000 });
    
    // Default White + Rose has 10 stock
    await expect(page.getByTestId('product-stock-available')).toContainText('10 available');
    
    // Change to White + Jasmine (stock=8)
    await page.getByTestId('flavor-jasmine').click();
    await expect(page.getByTestId('product-stock-available')).toContainText('8 available');
    
    // Change to Blush Pink + Rose (stock=12)
    await page.getByTestId('color-blush-pink').click();
    await page.getByTestId('flavor-rose').click();
    await expect(page.getByTestId('product-stock-available')).toContainText('12 available');
  });

  test('shows Out of Stock for combination with 0 stock', async ({ page }) => {
    await page.goto(`/product/${PRODUCT_WITH_BOTH}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('product-page')).toBeVisible({ timeout: 10000 });
    
    // Select Blush Pink + Peony combination (stock=0)
    await page.getByTestId('color-blush-pink').click();
    await page.getByTestId('flavor-peony').click();
    
    // Should show out of stock message
    await expect(page.getByTestId('product-out-of-stock')).toBeVisible();
    await expect(page.getByTestId('product-out-of-stock')).toContainText('Out of Stock');
    await expect(page.getByTestId('product-out-of-stock')).toContainText('Blush Pink + Peony');
  });

  test('Add to Cart button is disabled when out of stock', async ({ page }) => {
    await page.goto(`/product/${PRODUCT_WITH_BOTH}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('product-page')).toBeVisible({ timeout: 10000 });
    
    // Select out of stock combination: Lavender + Jasmine (stock=0)
    await page.getByTestId('color-lavender').click();
    await page.getByTestId('flavor-jasmine').click();
    
    // Add to Cart button should be disabled
    const addToCartBtn = page.getByTestId('add-to-cart-button');
    await expect(addToCartBtn).toBeDisabled();
    await expect(addToCartBtn).toContainText('Out of Stock');
    
    // Buy Now button should also be disabled
    const buyNowBtn = page.getByTestId('buy-now-button');
    await expect(buyNowBtn).toBeDisabled();
  });

  test('can switch from out of stock to in stock combination', async ({ page }) => {
    await page.goto(`/product/${PRODUCT_WITH_BOTH}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('product-page')).toBeVisible({ timeout: 10000 });
    
    // Select out of stock combination first
    await page.getByTestId('color-blush-pink').click();
    await page.getByTestId('flavor-peony').click();
    await expect(page.getByTestId('product-out-of-stock')).toBeVisible();
    
    // Now switch to in-stock combination
    await page.getByTestId('flavor-rose').click();
    await expect(page.getByTestId('product-stock-available')).toBeVisible();
    await expect(page.getByTestId('product-stock-available')).toContainText('12 available');
    
    // Add to Cart should now be enabled
    await expect(page.getByTestId('add-to-cart-button')).toBeEnabled();
  });

  test('low stock warning shows when stock is 5 or below', async ({ page }) => {
    await page.goto(`/product/${PRODUCT_WITH_BOTH}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('product-page')).toBeVisible({ timeout: 10000 });
    
    // Select Lavender + Rose combination (stock=4) - low stock
    await page.getByTestId('color-lavender').click();
    await page.getByTestId('flavor-rose').click();
    
    // Should show low stock warning
    await expect(page.getByTestId('product-stock-low')).toBeVisible();
    await expect(page.getByTestId('product-stock-low')).toContainText('Only 4 left');
  });
});

test.describe('Product Page - Both Variants', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
  });

  test('product with both options displays both color and flavor variants', async ({ page }) => {
    await page.goto(`/product/${PRODUCT_WITH_BOTH}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('product-page')).toBeVisible({ timeout: 10000 });
    
    // Should show both variant sections
    await expect(page.getByTestId('color-variants')).toBeVisible();
    await expect(page.getByTestId('flavor-variants')).toBeVisible();
    
    // Should display default selections
    await expect(page.getByText('Color: White')).toBeVisible();
    await expect(page.getByText('Fragrance: Rose')).toBeVisible();
  });

  test('can select both color and flavor variants independently', async ({ page }) => {
    await page.goto(`/product/${PRODUCT_WITH_BOTH}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('product-page')).toBeVisible({ timeout: 10000 });
    
    // Select different color
    await page.getByTestId('color-blush-pink').click();
    await expect(page.getByText('Color: Blush Pink')).toBeVisible();
    
    // Select different flavor
    await page.getByTestId('flavor-jasmine').click();
    await expect(page.getByText('Fragrance: Jasmine')).toBeVisible();
    
    // Both selections should be maintained
    await expect(page.getByText('Color: Blush Pink')).toBeVisible();
    await expect(page.getByText('Fragrance: Jasmine')).toBeVisible();
  });
});
