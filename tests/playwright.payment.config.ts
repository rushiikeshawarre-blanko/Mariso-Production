import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Dedicated configuration: never inherit the remote default in playwright.config.ts.
const baseURL = process.env.PAYMENT_TEST_BASE_URL || 'http://127.0.0.1:3000';
const target = new URL(baseURL);
if (
  target.protocol !== 'http:' ||
  target.hostname !== '127.0.0.1' ||
  target.username || target.password || target.pathname !== '/' ||
  target.search || target.hash
) {
  throw new Error('Payment browser tests require an http://127.0.0.1:<port> origin');
}

export default defineConfig({
  testDir: './payment_browser',
  testMatch: '**/*.spec.ts',
  outputDir: path.join(tmpdir(), 'mariso-payment-browser-results'),
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: target.origin,
    serviceWorkers: 'block',
    trace: 'off',
    screenshot: 'off',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
