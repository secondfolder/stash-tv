import { test as base, expect, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MOCK_STASH_TENANT_COOKIE, MOCK_STASH_TENANT_HEADER } from 'mock-stash/src/tenant';

/**
 * Playwright's `test` with the fixtures every e2e test uses. Import `test` and `expect` from here rather than from
 * `@playwright/test`.
 *
 * - Each worker has mock-stash state of its own (a tenant: see `mock-stash/src/tenant.ts`), so tests can run in
 *   parallel though they change what's on the server. The page names it in a cookie (which also reaches mock-stash for
 *   the media it serves the page directly), and the `request` fixture in a header.
 * - `jsCoverage`: collects the browser's JS coverage of the app's source when `E2E_COVERAGE_DIR` is set, writing each
 *   test's raw V8 coverage to that directory as JSON.
 */
export const test = base.extend<{ jsCoverage: void }>({
  context: async ({ context, baseURL }, use, testInfo) => {
    const { hostname } = new URL(baseURL ?? 'http://127.0.0.1');
    await context.addCookies([{ name: MOCK_STASH_TENANT_COOKIE, value: tenant(testInfo), domain: hostname, path: '/' }]);
    await use(context);
  },
  request: async ({ playwright, baseURL }, use, testInfo) => {
    const request = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { [MOCK_STASH_TENANT_HEADER]: tenant(testInfo) },
    });
    await use(request);
    await request.dispose();
  },
  jsCoverage: [
    async ({ page }, use, testInfo) => {
      const directory = process.env.E2E_COVERAGE_DIR;
      if (!directory) return use();
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
      await use();
      // The dev server serves the app's source from its root, and dependencies from /node_modules/ or /@fs/
      const coverage = (await page.coverage.stopJSCoverage()).filter((entry) => {
        const { origin, pathname } = new URL(entry.url);
        return origin === new URL(page.url()).origin && /\.tsx?$/.test(pathname) && !/^\/(@|node_modules\/)/.test(pathname);
      });
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, `${testInfo.testId}-${testInfo.retry}.json`), JSON.stringify(coverage));
    },
    { auto: true },
  ],
});
export { expect };

/**
 * The worker's mock-stash tenant. Named after its slot rather than the worker, so a worker replacing one (e.g. after a
 * failure) carries on with the same state, as a serial run would.
 */
function tenant(testInfo: TestInfo) {
  return `e2e-worker-${testInfo.parallelIndex}`;
}
