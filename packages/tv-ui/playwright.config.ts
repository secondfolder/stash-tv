import { defineConfig, devices } from '@playwright/test';
import { resolveE2ePort } from './test/e2e/helpers/ports';

/**
 * Playwright E2E test configuration for stash-tv
 *
 * Tests run against the dev server with STASH_PROXY=true for same-origin API access.
 * Both servers are started (and torn down) by Playwright's `webServer` entries:
 * - mock-stash on port 4000
 * - the tv-ui dev server on port 8888, proxying to mock-stash
 * If either port is taken, the next free one is used instead (see resolveE2ePort).
 */

const mockStashPort = resolveE2ePort('E2E_MOCK_STASH_PORT', 4000, 'mock-stash');
const devServerPort = resolveE2ePort('E2E_DEV_SERVER_PORT', 8888, 'the tv-ui dev server');
const devServerUrl = `http://localhost:${devServerPort}`;

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false, // Run sequentially to avoid port conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to avoid port conflicts
  reporter: 'html',
  use: {
    baseURL: devServerUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  webServer: [
    {
      command: `MOCK_STASH_PORT=${mockStashPort} yarn --cwd ../../packages/mock-stash test:e2e-server`,
      url: `http://localhost:${mockStashPort}/graphql`,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // VITE_APP_PLATFORM_URL keeps the app's API/WS URLs same-origin: without
      // it, stash-ui's getPlatformURL forces port 9999 (Stash's default) in dev.
      // --strictPort: the port was just probed free, so fail rather than drift.
      command:
        `STASH_ADDRESS=http://localhost:${mockStashPort} STASH_PROXY=true DEV_PORT=${devServerPort} VITE_APP_PLATFORM_URL=${devServerUrl} yarn dev --strictPort`,
      url: devServerUrl,
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
