import { getLogger } from "@logtape/logtape";

const logger = getLogger(["stash-tv", "reloadFromServer"]);

/**
 * Reloads the app, first making the browser fetch the page from Stash again so the reload (and the next launch from
 * the home screen, which opens the manifest's start URL) doesn't get the old version from the browser's cache.
 *
 * @see docs/app-updates.md
 */
export async function reloadFromServer() {
  const startUrl = new URL(".", window.location.href).href;
  const pageUrls = new Set([window.location.href.split("#")[0], startUrl]);
  try {
    await Promise.all(
      [...pageUrls].map(url => fetch(url, { cache: "reload", credentials: "include" }))
    );
  } catch (error) {
    logger.warn("Couldn't refresh the cached page before reloading: {error}", { error });
  }
  window.location.reload();
}
