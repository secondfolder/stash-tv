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
// 127.0.0.1 rather than localhost: Node (which the tests' `request` fixture uses) took ~300ms to connect to `localhost`
// for every request to the dev server, against ~4ms for 127.0.0.1, and tests make a few such requests each to set up.
// The dev server is told to listen there (DEV_HOST below), and the app's API URL is the same origin.
const devServerUrl = `http://127.0.0.1:${devServerPort}`;

export default defineConfig({
  testDir: './test/e2e',
  // Each worker has mock-stash state of its own (see test/e2e/helpers/test.ts), so tests in a file can run in parallel
  // too. The tests wait on videos and animations in real time far more than they use the CPU.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 4,
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
      url: `http://127.0.0.1:${mockStashPort}/graphql`,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // VITE_APP_PLATFORM_URL keeps the app's API/WS URLs same-origin: without
      // it, stash-ui's getPlatformURL forces port 9999 (Stash's default) in dev.
      // --strictPort: the port was just probed free, so fail rather than drift.
      command:
        `STASH_ADDRESS=http://127.0.0.1:${mockStashPort} STASH_PROXY=true DEV_HOST=127.0.0.1 DEV_PORT=${devServerPort} VITE_APP_PLATFORM_URL=${devServerUrl} yarn dev --strictPort`,
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
