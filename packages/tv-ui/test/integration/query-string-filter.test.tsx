/**
 * Linking into the feed from another plugin: Stash TV opened with a filter in Stash's own filter query-string format
 * shows it as the temporary channel, kept on the URL so reloading shows it again.
 *
 * @see docs/channels.md § "Opening with a filter from another plugin"
 */

import { afterEach, describe, expect, it } from "vitest";
import { savedTvConfig } from "./helpers/harness";
import { bootWithTvConfig, feedDoesNotShow, feedShows, tvConfig } from "./helpers/feed";
import { setupChannelSettingsTest, ALPHA_SCENE, alphaChannel } from "./helpers/channel-settings";

const integration = setupChannelSettingsTest();

const startWithAlphaChannel = (config: Awaited<ReturnType<typeof tvConfig>>) => {
  config.set("channels", [alphaChannel]);
  config.set("lastViewedChannelId", "alpha");
};

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("Opening with a filter from another plugin", () => {
  it("shows a filter from the page's query string, keeping it on the URL", async () => {
    // Every scene tagged Delta, as another plugin would link to it in Stash's own filter query-string format
    window.history.replaceState(
      null,
      "",
      '/?t=5&sortby=title&c=("type":"tags","modifier":"INCLUDES_ALL","value":("items":[("id":"tag-delta","label":"Delta")],"excluded":[],"depth":0))'
    );

    const app = await bootWithTvConfig(startWithAlphaChannel, "Ember Evening");
    await feedShows(app, "Horizon Hush");
    await feedDoesNotShow(app, ALPHA_SCENE);

    const config = await tvConfig();
    expect(config.channels.at(-1)?.sources[0]).toMatchObject({ type: "temporary-filter", filter: { name: "From URL" } });
    // Unlike Stash's own queue, the filter's params stay on the URL (along with others, like "t"), so reloading
    // shows it again
    const params = new URLSearchParams(window.location.search);
    expect(params.get("t")).toBe("5");
    expect(params.get("sortby")).toBe("title");
    expect(params.has("c")).toBe(true);
    expect(savedTvConfig(integration).channels).toEqual([alphaChannel]);
    expect(savedTvConfig(integration).lastViewedChannelId).toBe("alpha");

    await app.unmount();
  });

  it("ignores the query string when it has none of Stash's filter params", async () => {
    window.history.replaceState(null, "", "/?t=5&autoplay=true");

    const app = await bootWithTvConfig(startWithAlphaChannel, ALPHA_SCENE);

    const config = await tvConfig();
    expect(config.lastViewedChannelId).toBe("alpha");
    expect(window.location.search).toBe("?t=5&autoplay=true");

    await app.unmount();
  });
});
