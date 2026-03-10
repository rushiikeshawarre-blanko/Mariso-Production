import { test, expect } from '@playwright/test';
import { dismissToasts, loginAsAdmin } from '../fixtures/helpers';

const BASE_URL = process.env.REACT_APP_BACKEND_URL || 'https://candle-ecommerce-hub.preview.emergentagent.com';
const PRODUCT_WITH_BOTH = '0f29ccba-48ef-46eb-9c76-0703d6ae9c37'; // Rose Candle Bouquet (has both colors and flavors)

test.describe('Admin Variant Management - Add/Delete', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginAsAdmin(page);
  });

  test('admin can add a new color option to a product', async ({ page }) => {
    await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-products')).toBeVisible({ timeout: 15000 });
    
    // Click edit on product with both variants
    await page.getByTestId(`edit-product-${PRODUCT_WITH_BOTH}`).click({ force: true });
    await expect(page.getByTestId('product-name-input')).toBeVisible({ timeout: 10000 });
    
    // Click on Variants tab
    await page.getByTestId('tab-variants').click();
    
    // Count existing colors before adding
    const dialog = page.locator('[role="dialog"]');
    const colorItems = dialog.locator('.bg-muted\\/50:has(button)');
    const initialCount = await colorItems.count();
    
    // Use unique name with timestamp
    const uniqueColorName = `TEST_Color_${Date.now()}`;
    
    // Fill in new color details
    await page.getByTestId('new-color-name').fill(uniqueColorName);
    await page.getByTestId('new-color-hex').fill('#FFD700');
    await page.getByTestId('new-color-images').fill('https://example.com/test-color.jpg');
    
    // Click Add Color button
    await page.getByTestId('add-color-button').click();
    
    // Verify a new color item was added (count increased by 1)
    await expect(colorItems).toHaveCount(initialCount + 1, { timeout: 5000 });
    
    // Save the product
    await page.getByTestId('save-product-button').click();
    
    // Wait for dialog to close and verify success
    await expect(page.getByTestId('product-name-input')).not.toBeVisible({ timeout: 10000 });
  });

  test('admin can add a new flavor option to a product', async ({ page }) => {
    await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-products')).toBeVisible({ timeout: 15000 });
    
    // Click edit on product with both variants
    await page.getByTestId(`edit-product-${PRODUCT_WITH_BOTH}`).click({ force: true });
    await expect(page.getByTestId('product-name-input')).toBeVisible({ timeout: 10000 });
    
    // Click on Variants tab
    await page.getByTestId('tab-variants').click();
    
    // Count existing items (colors + flavors) before adding
    const dialog = page.locator('[role="dialog"]');
    const allItems = dialog.locator('.bg-muted\\/50:has(button)');
    const initialCount = await allItems.count();
    
    // Use unique name with timestamp
    const uniqueFlavorName = `TEST_Flavor_${Date.now()}`;
    
    // Fill in new flavor details
    await page.getByTestId('new-flavor-name').fill(uniqueFlavorName);
    await page.getByTestId('new-flavor-description').fill('Fresh test scent');
    
    // Click Add Fragrance button
    await page.getByTestId('add-flavor-button').click();
    
    // Verify a new item was added (count increased by 1)
    await expect(allItems).toHaveCount(initialCount + 1, { timeout: 5000 });
    
    // Save the product
    await page.getByTestId('save-product-button').click();
    
    // Wait for dialog to close
    await expect(page.getByTestId('product-name-input')).not.toBeVisible({ timeout: 10000 });
  });

  test('admin can delete a color option from a product', async ({ page }) => {
    await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-products')).toBeVisible({ timeout: 15000 });
    
    // Click edit on product with both variants
    await page.getByTestId(`edit-product-${PRODUCT_WITH_BOTH}`).click({ force: true });
    await expect(page.getByTestId('product-name-input')).toBeVisible({ timeout: 10000 });
    
    // Click on Variants tab
    await page.getByTestId('tab-variants').click();
    
    const dialog = page.locator('[role="dialog"]');
    
    // Find all variant items with delete buttons - look for X icon buttons in variant items
    // Color options are in the div with p-3 bg-muted/50 class and have X button
    const colorItems = dialog.locator('.bg-muted\\/50:has(button)');
    const initialCount = await colorItems.count();
    expect(initialCount).toBeGreaterThan(0);
    
    // Find and click the first X button (delete button) in a color item
    const firstColorItem = colorItems.first();
    await firstColorItem.locator('button').click({ force: true });
    
    // Verify one less color (count decreased)
    await expect(colorItems).toHaveCount(initialCount - 1);
  });

  test('admin can delete a flavor option from a product', async ({ page }) => {
    await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-products')).toBeVisible({ timeout: 15000 });
    
    // Click edit on product with both variants
    await page.getByTestId(`edit-product-${PRODUCT_WITH_BOTH}`).click({ force: true });
    await expect(page.getByTestId('product-name-input')).toBeVisible({ timeout: 10000 });
    
    // Click on Variants tab
    await page.getByTestId('tab-variants').click();
    
    const dialog = page.locator('[role="dialog"]');
    
    // Wait for flavor section to be visible
    await expect(dialog.getByText('Fragrance Options')).toBeVisible();
    
    // Find all variant items with delete buttons
    const allItems = dialog.locator('.bg-muted\\/50:has(button)');
    const initialCount = await allItems.count();
    expect(initialCount).toBeGreaterThan(0);
    
    // Click the last delete button (likely a flavor item)
    await allItems.last().locator('button').click({ force: true });
    
    // Verify count decreased by 1
    await expect(allItems).toHaveCount(initialCount - 1);
  });
});
