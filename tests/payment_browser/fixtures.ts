import { test as base, expect } from '@playwright/test';

// Payment specs must import this fixture. Mock auth, SDK and API traffic explicitly.
// Browser routing is an accidental-I/O guard, not a sandbox for arbitrary Node code.
export const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    const violations: string[] = [];
    const allowedOrigin = new URL(baseURL!).origin;
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (
        url.origin === allowedOrigin && request.method() === 'GET' &&
        !/^\/api(?:\/|$)/i.test(decodeURIComponent(url.pathname)) &&
        (request.isNavigationRequest() || ['script', 'stylesheet', 'image', 'font'].includes(request.resourceType()))
      ) {
        await route.continue();
      } else {
        violations.push(`${request.method()} ${url.origin}${url.pathname}`);
        await route.abort('blockedbyclient');
      }
    });
    await context.routeWebSocket('**/*', async (socket) => {
      // Prevent both gateway sockets and development proxies. No connection is opened.
      await socket.close();
    });
    await use(context);
    expect(violations, 'Unexpected requests must be fulfilled by a test mock').toEqual([]);
  },
  request: async ({}, use) => {
    throw new Error('Payment browser tests must mock API calls; the request fixture is disabled');
  },
});

export { expect };
