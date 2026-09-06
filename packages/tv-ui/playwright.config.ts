import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration for stash-tv
 *
 * Tests run against the dev server with STASH_PROXY=true for same-origin API access.
 * Both servers are managed by Playwright's `webServer` entries:
 * - mock-stash on port 4000 (reused if already running)
 * - the tv-ui dev server on port 8888, proxying to mock-stash
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

  webServer: [
    {
      command: 'yarn --cwd ../../packages/mock-stash test:e2e-server',
      url: 'http://localhost:4000/graphql',
      reuseExistingServer: true,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // VITE_APP_PLATFORM_URL keeps the app's API/WS URLs same-origin: without
      // it, stash-ui's getPlatformURL forces port 9999 (Stash's default) in dev.
      command:
        'STASH_ADDRESS=http://localhost:4000 STASH_PROXY=true DEV_PORT=8888 VITE_APP_PLATFORM_URL=http://localhost:8888 yarn dev',
      url: 'http://localhost:8888',
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe',
      timeout: 120_000,
    },
  ],

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
