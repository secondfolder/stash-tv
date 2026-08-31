import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration for stash-tv
 *
 * Tests run against the dev server with STASH_PROXY=true for same-origin API access.
 * The mock-stash server must be running on port 4000 before running E2E tests.
 */

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false, // Run sequentially to avoid port conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to avoid port conflicts
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8888',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Videos autoplay muted in Chrome
        launchOptions: {
          args: [
            '--autoplay-policy=no-user-gesture-required',
            '--mute-audio',
          ],
        },
      },
    },
  ],
});
