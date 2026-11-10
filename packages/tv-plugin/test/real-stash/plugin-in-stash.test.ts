import { stashGql } from "../../../mock-stash/src/real-stash";
import { PLUGIN_NAMESPACE, STASH_QUEUE_SCENE_PARAM } from "../../../tv-ui/src/constants";
import { APP_PATH, expect, skipWithoutDocker, test } from "./fixtures";

/**
 * The built plugin, installed in a real Stash of each version Stash TV is tested against: the part of it that runs in
 * Stash's own UI (packages/tv-plugin/main.tsx), rendered by Stash's own React, and the app it serves.
 *
 * The tests share their Stash and run in order: the first ones check what the plugin does the first time it loads.
 *
 * @see docs/testing-mock-stash.md § "The plugin in a real Stash"
 * @see docs/stash-compatibility.md § "React"
 */

skipWithoutDocker();
test.describe.configure({ mode: "serial" });

/** Stash's scenes, by title (a scanned scene's title is its file's name) */
async function sceneIds(stash: Parameters<typeof stashGql>[0]) {
  const data = await stashGql(stash, `{ findScenes(filter: { per_page: -1, sort: "title" }) { scenes { id } } }`);
  return (data.findScenes as { scenes: { id: string }[] }).scenes.map((scene) => scene.id);
}

test("Stash loads the plugin", async ({ stash }) => {
  const data = await stashGql(stash, `{ plugins { id enabled } }`);
  expect(data.plugins).toContainEqual({ id: PLUGIN_NAMESPACE, enabled: true });
});

test("adds Stash TV to the nav bar the first time it loads, linking to the app", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#StashTVButton a")).toHaveAttribute("href", APP_PATH);
});

test("offers TV among the nav bar's items in Stash's interface settings", async ({ page }) => {
  await page.goto("/settings?tab=interface");
  // Stash's switches aren't labelled: each has an id from its group and item, beside a heading
  const tvSwitch = page.locator("#menu-items-tv");
  await expect(page.locator(".setting", { has: tvSwitch })).toContainText("TV");
  // On: the plugin added it the first time it loaded
  await expect(tvSwitch).toBeChecked();
});

test("shows its settings among Stash's plugin settings, and resets Stash TV's settings", async ({ page, stash }) => {
  await stashGql(stash, `mutation { configurePlugin(plugin_id: "${PLUGIN_NAMESPACE}", input: { initialSetupComplete: true, volume: 0.3 }) }`);

  await page.goto("/settings?tab=plugins");
  const setting = page.locator(".setting", { hasText: "Reset all Stash TV settings" });
  await setting.getByRole("button", { name: "Reset" }).click();

  // Done, it shows a tick
  await expect(setting.getByRole("button", { name: "Reset" }).locator("svg")).toBeVisible();
  const data = await stashGql(stash, `{ configuration { plugins(include: ["${PLUGIN_NAMESPACE}"]) } }`);
  expect((data.configuration as { plugins: Record<string, unknown> }).plugins[PLUGIN_NAMESPACE] ?? {}).toEqual({});
});

test("opens a scene list in Stash TV from its menu, with the list's filter", async ({ page }) => {
  // Descending: Stash leaves a sort's default direction (ascending, for a title) out of its links
  await page.goto("/scenes?sortby=title&sortdir=desc");
  await expect(page.locator(".scene-card").first()).toBeVisible();

  await page.locator("#more-menu").first().click();
  const item = page.locator(".scene-list-operations-dropdown").getByRole("link", { name: "Open in Stash TV" });
  const href = new URL(await item.getAttribute("href") ?? "", page.url());
  expect(href.pathname).toBe(APP_PATH);
  expect(Object.fromEntries(href.searchParams)).toMatchObject({ qsort: "title", qsortd: "desc", qfp: "1" });

  // Choosing it opens the app in a new tab, and closes the menu as Stash's own items do
  const popup = page.waitForEvent("popup");
  await item.click();
  expect(new URL((await popup).url()).pathname).toBe(APP_PATH);
  await expect(item).toBeHidden();
});

test("opens just the scenes selected in a scene list", async ({ page, stash }) => {
  const [first] = await sceneIds(stash);
  await page.goto("/scenes?sortby=title&sortdir=asc");
  await page.locator(".scene-card").first().locator(".card-check").check();

  await page.locator("#more-menu").first().click();
  const item = page.locator(".scene-list-operations-dropdown").getByRole("link", { name: "Open in Stash TV" });
  const href = new URL(await item.getAttribute("href") ?? "", page.url());
  expect(href.searchParams.getAll("qs")).toEqual([first]);
});

test("opens a scene's queue in Stash TV from the scene page, starting at that scene", async ({ page, stash }) => {
  const [, second] = await sceneIds(stash);
  await page.goto(`/scenes/${second}?qfp=1&qsort=title&qsortd=asc`);
  await page.getByRole("tab", { name: "Queue" }).or(page.locator(".nav-link", { hasText: "Queue" })).first().click();

  const popup = page.waitForEvent("popup");
  await page.locator("#queue-viewer").getByRole("button", { name: "Open queue in Stash TV" }).click();
  const url = new URL((await popup).url());
  expect(url.pathname).toBe(APP_PATH);
  expect(Object.fromEntries(url.searchParams)).toMatchObject({ qsort: "title", qsortd: "asc", qfp: "1", [STASH_QUEUE_SCENE_PARAM]: second });
});

test("serves the app, which plays a scene from Stash", async ({ page, stash }) => {
  await page.goto(APP_PATH);
  // Its first-run guide, closed as a user would (a click also lets the browser play the video)
  await page.getByRole("button", { name: "Done" }).click();
  await expect.poll(
    () => page.evaluate(() => [...document.querySelectorAll("video")].some((video) => video.readyState >= 2)),
    { timeout: 30_000 },
  ).toBe(true);
  const playing = await page.evaluate(() => [...document.querySelectorAll("video")].find((video) => video.readyState >= 2)?.currentSrc);
  expect(new URL(playing ?? "").origin).toBe(new URL(stash.url).origin);
});
