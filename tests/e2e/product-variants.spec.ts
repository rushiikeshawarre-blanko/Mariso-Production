import { test, expect } from '@playwright/test';
import { dismissToasts, loginAsAdmin } from '../fixtures/helpers';

const BASE_URL = process.env.REACT_APP_BACKEND_URL || 'https://candle-ecommerce-hub.preview.emergentagent.com';

// Product IDs with known variant configurations
const PRODUCT_WITH_COLORS = 'ccd58441-eca8-47c3-95ae-da0c7504ac19'; // Sandstone Ripple Coaster Set
const PRODUCT_WITH_FLAVORS = 'b24e7fca-da00-4d63-bc91-31c78e64b17c'; // Vanilla Sandstone Candle
const PRODUCT_WITH_BOTH = '0f29ccba-48ef-46eb-9c76-0703d6ae9c37'; // Rose Candle Bouquet

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

test.describe('Admin Products - Variants Column', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginAsAdmin(page);
  });

  test('admin products table displays variants column with counts', async ({ page }) => {
    await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-products')).toBeVisible({ timeout: 15000 });
    
    // Wait for products to load
    const productRows = page.locator('[data-testid^="product-row-"]');
    await expect(productRows.first()).toBeVisible({ timeout: 10000 });
    
    // Check that Sandstone Ripple Coaster Set shows color count (3 colors)
    const colorOnlyRow = page.getByTestId(`product-row-${PRODUCT_WITH_COLORS}`);
    await expect(colorOnlyRow).toBeVisible();
    // Should show color badge with count 3
    await expect(colorOnlyRow.locator('text=/.*3/')).toBeVisible();
    
    // Check that Vanilla Sandstone Candle shows flavor count (4 flavors)
    const flavorOnlyRow = page.getByTestId(`product-row-${PRODUCT_WITH_FLAVORS}`);
    await expect(flavorOnlyRow).toBeVisible();
    // Should show flavor badge with count 4
    await expect(flavorOnlyRow.locator('text=/.*4/')).toBeVisible();
    
    // Check that Rose Candle Bouquet shows both counts
    const bothRow = page.getByTestId(`product-row-${PRODUCT_WITH_BOTH}`);
    await expect(bothRow).toBeVisible();
  });
});

test.describe('Admin Product Edit - Variants Tab', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginAsAdmin(page);
  });

  test('admin can edit product and see Variants tab with existing colors', async ({ page }) => {
    await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-products')).toBeVisible({ timeout: 15000 });
    
    // Click edit on product with colors
    await page.getByTestId(`edit-product-${PRODUCT_WITH_COLORS}`).click({ force: true });
    await expect(page.getByTestId('product-name-input')).toBeVisible({ timeout: 10000 });
    
    // Click on Variants tab
    await page.getByTestId('tab-variants').click();
    
    // Should see Color Options toggle enabled
    await expect(page.getByTestId('enable-color-options')).toBeChecked();
    
    // Should see existing colors listed within the dialog
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog.getByText('Natural White', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Sandstone', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Charcoal', { exact: true })).toBeVisible();
  });

  test('admin can edit product and see Variants tab with existing flavors', async ({ page }) => {
    await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-products')).toBeVisible({ timeout: 15000 });
    
    // Click edit on product with flavors
    await page.getByTestId(`edit-product-${PRODUCT_WITH_FLAVORS}`).click({ force: true });
    await expect(page.getByTestId('product-name-input')).toBeVisible({ timeout: 10000 });
    
    // Click on Variants tab
    await page.getByTestId('tab-variants').click();
    
    // Should see Fragrance Options toggle enabled
    await expect(page.getByTestId('enable-flavor-options')).toBeChecked();
    
    // Should see existing flavors listed within the dialog
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog.getByText('Vanilla', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Lavender', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Rose', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Oud & Amber', { exact: true })).toBeVisible();
  });
});
