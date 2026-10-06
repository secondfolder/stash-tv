/**
 * Plugins Stash's ScenePlayer adds that Stash TV's players go without, as they'd work against the feed.
 *
 * @see docs/video-player.md § "Known Stash ScenePlayer Quirks & Our Workarounds"
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import videojs from "video.js";
import { bootApp, setupIntegrationTest, type BootedApp } from "./helpers/harness";
import { slides } from "./helpers/feed";

setupIntegrationTest();

/** Wait until every rendered slide's player is ready, which is when Stash's plugins set themselves up */
async function allPlayersReady(app: BootedApp) {
  let playerIds: string[] = [];
  await waitFor(() => {
    playerIds = [...app.rendered.container.querySelectorAll("video-js")].map((element) => element.id);
    expect(playerIds.length).toBeGreaterThan(0);
    expect(playerIds.length).toBe(slides(app).length);
  });
  await Promise.all(
    playerIds.map((id) => new Promise<void>((resolve) => videojs.getPlayer(id)?.ready(() => resolve())))
  );
}

/**
 * The browser's media session handlers (media keys, and the play/pause/next/previous controls the OS shows) are
 * global, so every rendered slide's player taking them over as it became ready would leave them driving whichever
 * loaded last.
 *
 * @see docs/video-player.md § "Picture-in-picture"
 */
describe("Media session", () => {
  const setActionHandler = vi.fn();

  beforeEach(() => {
    setActionHandler.mockClear();
    // jsdom has no media session
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: { setActionHandler, metadata: null, playbackState: "none" },
    });
    vi.stubGlobal("MediaMetadata", class {
      constructor(init: MediaMetadataInit) {
        Object.assign(this, init);
      }
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, "mediaSession");
    vi.unstubAllGlobals();
  });

  it("gets no handlers from the feed's players outside picture-in-picture", async () => {
    const app = await bootApp();

    await allPlayersReady(app);

    expect(setActionHandler).not.toHaveBeenCalled();
    await app.unmount();
  });
});

/** Its button toggles Stash's own autoplay setting, saving it to Stash's config, but Stash TV has its own */
describe("Autostart button", () => {
  it("isn't shown on the feed's players", async () => {
    const app = await bootApp();

    await allPlayersReady(app);

    expect(app.rendered.container.querySelector(".vjs-autostart-button")).toBeNull();
    await app.unmount();
  });
});
