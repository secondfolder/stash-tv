import { test as base, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// By path rather than as "mock-stash": Playwright only compiles TypeScript outside node_modules
import { canRunRealStash, startRealStash, stashGql, type RealStash } from "../../../mock-stash/src/real-stash";
import type { StashVersion } from "../../../mock-stash/src/stash-versions";
import { PLUGIN_NAMESPACE } from "../../../tv-ui/src/constants";

/**
 * Fixtures for testing the built plugin inside a real Stash: each worker starts the real Stash of its project's version
 * (see playwright.config.ts) with `dist/` installed as the plugin.
 *
 * @see docs/testing-mock-stash.md § "The plugin in a real Stash"
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIST = path.resolve(here, "../../dist");

/** Where Stash serves the app, from the plugin's assets */
export const APP_PATH = `/plugin/${PLUGIN_NAMESPACE}/assets/app/`;

/** Console errors and failed requests that aren't the plugin's doing, so don't fail a test */
const EXPECTED_CONSOLE_ERRORS = [
  // Headless Chromium refuses the screen wake lock videos ask for
  /Failed to obtain Screen Wake Lock/,
  // A failed request is also logged, without its URL: they're checked by URL below
  /Failed to load resource/,
];
const EXPECTED_FAILED_REQUESTS = [
  // The scan doesn't generate the sprites and thumbnails a scene's player asks for
  /\/scene\/[^/]+_thumbs\.vtt$/,
  /\/scene\/[^/]+_sprite\.jpg$/,
];

export type PluginTestOptions = { stashVersion: StashVersion };

type WorkerFixtures = PluginTestOptions & {
  /** The real Stash, set up, scanned and with the plugin installed */
  stash: RealStash;
};

type TestFixtures = {
  /** Fails the test on errors in any of its pages (Stash's or the app's), other than the expected ones above */
  pageErrors: void;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  stashVersion: ["develop", { option: true, scope: "worker" }],

  stash: [async ({ stashVersion }, use) => {
    if (!existsSync(path.join(PLUGIN_DIST, `${PLUGIN_NAMESPACE}.yml`))) {
      throw new Error(`The plugin isn't built (no ${PLUGIN_DIST}): run \`yarn build\` first`);
    }
    const stash = await startRealStash(stashVersion, { plugins: { [PLUGIN_NAMESPACE]: PLUGIN_DIST } });
    // A new Stash shows its release notes over every page until they're seen
    await stashGql(stash, `mutation { configureUISetting(key: "lastNoteSeen", value: 99999999) }`);
    await use(stash);
    await stash.stop();
  }, { scope: "worker", timeout: 300_000 }],

  baseURL: async ({ stash }, use) => {
    await use(stash.url);
  },

  pageErrors: [async ({ context }, use) => {
    const errors: string[] = [];
    const watch = (page: Page) => {
      page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        if (EXPECTED_CONSOLE_ERRORS.some((expected) => expected.test(message.text()))) return;
        errors.push(`${page.url()}: console error: ${message.text()}`);
      });
      page.on("response", (response) => {
        if (response.status() < 400) return;
        if (EXPECTED_FAILED_REQUESTS.some((expected) => expected.test(new URL(response.url()).pathname))) return;
        errors.push(`${page.url()}: ${response.status()} for ${response.url()}`);
      });
    };
    context.pages().forEach(watch);
    context.on("page", watch);
    await use();
    expect(errors, "errors in the pages").toEqual([]);
  }, { auto: true }],
});

/**
 * Skips the file's tests without Docker, unless `REQUIRE_DOCKER` is set (as CI does), when they fail instead. Call at
 * the top of a test file.
 */
export function skipWithoutDocker() {
  test.beforeAll(async () => {
    test.skip(!(await canRunRealStash()), "Docker isn't available to start a real Stash");
  });
}

export { expect };
