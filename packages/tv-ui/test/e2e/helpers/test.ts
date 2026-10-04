import { test as base, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Playwright's `test` with the fixtures every e2e test uses. Import `test` and `expect` from here rather than from
 * `@playwright/test`.
 *
 * - `jsCoverage`: collects the browser's JS coverage of the app's source when `E2E_COVERAGE_DIR` is set, writing each
 *   test's raw V8 coverage to that directory as JSON.
 */
export const test = base.extend<{ jsCoverage: void }>({
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
