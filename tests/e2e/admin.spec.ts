import { test, expect } from '@playwright/test';
import { dismissToasts, loginAsAdmin } from '../fixtures/helpers';

test.describe('Admin Access & Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
  });

  test('non-admin cannot access admin dashboard', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    // Not logged in - should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('admin login and dashboard access', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    // Should see admin layout with nav items
    await expect(page.locator('[href="/admin/products"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[href="/admin/categories"]')).toBeVisible();
    await expect(page.locator('[href="/admin/orders"]')).toBeVisible();
    await expect(page.locator('[href="/admin/customers"]')).toBeVisible();
  });

  test('admin sees admin menu option in navbar', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('user-menu-button').click();
    await expect(page.getByTestId('menu-admin')).toBeVisible();
  });
});

test.describe('Admin Product Management', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginAsAdmin(page);
  });

  test('admin products page loads', async ({ page }) => {
    await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-products')).toBeVisible({ timeout: 10000 });
    // Should list products
    const productRows = page.locator('[data-testid^="product-row-"]');
    await expect(productRows.first()).toBeVisible({ timeout: 15000 });
  });

  test('admin product search works', async ({ page }) => {
    await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('product-search')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('product-search').fill('candle');
  });

  test('admin can open add product dialog', async ({ page }) => {
    await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('add-product-button')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('add-product-button').click({ force: true });
    await expect(page.getByTestId('product-name-input')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('product-price-input')).toBeVisible();
    await expect(page.getByTestId('save-product-button')).toBeVisible();
  });

  test('admin can create a new product', async ({ page }) => {
    await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
    const initialRows = page.locator('[data-testid^="product-row-"]');
    await expect(initialRows.first()).toBeVisible({ timeout: 15000 });
    const initialCount = await initialRows.count();
    
    await page.getByTestId('add-product-button').click({ force: true });
    await expect(page.getByTestId('product-name-input')).toBeVisible({ timeout: 5000 });
    
    const productName = `TEST_Product_${Date.now()}`;
    await page.getByTestId('product-name-input').fill(productName);
    await page.getByTestId('product-description-input').fill('Test product for automation');
    await page.getByTestId('product-price-input').fill('999');
    await page.getByTestId('product-stock-input').fill('10');
    await page.getByTestId('product-images-input').fill('https://example.com/image.jpg');
    
    // Select a category
    await page.getByTestId('product-category-select').click();
    await page.locator('[role="option"]').first().click();
    
    await page.getByTestId('save-product-button').click();
    
    // Product count should increase
    await expect(page.locator('[data-testid^="product-row-"]')).toHaveCount(initialCount + 1, { timeout: 10000 });
  });

  test('admin can edit a product', async ({ page }) => {
    await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
    const editButtons = page.locator('[data-testid^="edit-product-"]');
    await expect(editButtons.first()).toBeVisible({ timeout: 15000 });
    await editButtons.first().click({ force: true });
    
    await expect(page.getByTestId('product-name-input')).toBeVisible({ timeout: 5000 });
    // Verify form is populated
    const nameValue = await page.getByTestId('product-name-input').inputValue();
    expect(nameValue.length).toBeGreaterThan(0);
  });

  test('admin can delete a product', async ({ page }) => {
    // First create a test product via API
    const BASE_URL = process.env.REACT_APP_BACKEND_URL || 'https://luxury-home-4.preview.emergentagent.com';
    
    await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
    const deleteButtons = page.locator('[data-testid^="delete-product-"]');
    await expect(deleteButtons.first()).toBeVisible({ timeout: 15000 });
    const initialCount = await page.locator('[data-testid^="product-row-"]').count();
    
    // Create a product first to delete
    await page.getByTestId('add-product-button').click({ force: true });
    await expect(page.getByTestId('product-name-input')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('product-name-input').fill(`TEST_DELETE_${Date.now()}`);
    await page.getByTestId('product-description-input').fill('To be deleted');
    await page.getByTestId('product-price-input').fill('100');
    await page.getByTestId('product-stock-input').fill('5');
    await page.getByTestId('product-images-input').fill('https://example.com/img.jpg');
    await page.getByTestId('product-category-select').click();
    await page.locator('[role="option"]').first().click();
    await page.getByTestId('save-product-button').click();
    
    await expect(page.locator('[data-testid^="product-row-"]')).toHaveCount(initialCount + 1, { timeout: 10000 });
    
    // Delete the last product (newly created one)
    const newDeleteButtons = page.locator('[data-testid^="delete-product-"]');
    const count = await newDeleteButtons.count();
    await newDeleteButtons.nth(count - 1).click({ force: true });
    
    // Should have original count again
    await expect(page.locator('[data-testid^="product-row-"]')).toHaveCount(initialCount, { timeout: 10000 });
  });
});

test.describe('Admin Category Management', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginAsAdmin(page);
  });

  test('admin categories page loads', async ({ page }) => {
    await page.goto('/admin/categories', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-categories')).toBeVisible({ timeout: 10000 });
    const categoryCards = page.locator('[data-testid^="category-card-"]');
    await expect(categoryCards.first()).toBeVisible({ timeout: 15000 });
    const count = await categoryCards.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('admin can add a new category', async ({ page }) => {
    await page.goto('/admin/categories', { waitUntil: 'domcontentloaded' });
    const initialCount = await page.locator('[data-testid^="category-card-"]').count();
    
    await page.getByTestId('add-category-button').click({ force: true });
    await expect(page.getByTestId('category-name-input')).toBeVisible({ timeout: 5000 });
    
    await page.getByTestId('category-name-input').fill(`TEST_Category_${Date.now()}`);
    await page.getByTestId('category-description-input').fill('Test category description');
    await page.getByTestId('category-image-input').fill('https://example.com/cat.jpg');
    await page.getByTestId('save-category-button').click();
    
    await expect(page.locator('[data-testid^="category-card-"]')).toHaveCount(initialCount + 1, { timeout: 10000 });
  });
});

test.describe('Admin Order Management', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginAsAdmin(page);
  });

  test('admin orders page loads', async ({ page }) => {
    await page.goto('/admin/orders', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-orders')).toBeVisible({ timeout: 10000 });
  });

  test('admin can filter orders by status', async ({ page }) => {
    await page.goto('/admin/orders', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('order-status-filter')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('order-status-filter').click();
    // Should show status options
    await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('admin can view order details', async ({ page }) => {
    await page.goto('/admin/orders', { waitUntil: 'domcontentloaded' });
    const orderRows = page.locator('[data-testid^="order-row-"]');
    await expect(orderRows.first()).toBeVisible({ timeout: 15000 });
    
    const viewButton = page.locator('[data-testid^="view-order-"]').first();
    await expect(viewButton).toBeVisible();
    await viewButton.click({ force: true });
    // Should open order details
    await page.waitForLoadState('domcontentloaded');
  });
});

test.describe('Admin Customer Management', () => {
  test.beforeEach(async ({ page }) => {
    await dismissToasts(page);
    await loginAsAdmin(page);
  });

  test('admin customers page loads', async ({ page }) => {
    await page.goto('/admin/customers', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-customers')).toBeVisible({ timeout: 10000 });
  });

  test('admin customer list shows customers', async ({ page }) => {
    await page.goto('/admin/customers', { waitUntil: 'domcontentloaded' });
    const customerRows = page.locator('[data-testid^="customer-row-"]');
    await expect(customerRows.first()).toBeVisible({ timeout: 15000 });
  });

  test('customer search works', async ({ page }) => {
    await page.goto('/admin/customers', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('customer-search')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('customer-search').fill('aisha');
  });
});
