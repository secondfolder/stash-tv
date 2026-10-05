/**
 * Opening a queue from Stash's scene page in the feed: Stash TV opened with Stash's queue params shows the queue as the
 * temporary channel, and a temporary filter can be limited to hand-picked scenes.
 *
 * @see docs/channels.md § "Opening Stash's queue"
 * @see docs/media-loading.md § "Starting at an item"
 */

import { afterEach, describe, expect, it } from "vitest";
import { act, waitFor } from "@testing-library/react";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { ListFilterModel } from "stash-ui/dist/src/models/list-filter/filter";
import { SceneQueue } from "stash-ui/dist/src/models/sceneQueue";
import { savedTvConfig } from "./helpers/harness";
import { bootWithTvConfig, currentSlide, feedDoesNotShow, feedShows, sceneIdOf, slides, tvConfig } from "./helpers/feed";
import { setupChannelSettingsTest, ALPHA_SCENE, alphaChannel } from "./helpers/channel-settings";

const integration = setupChannelSettingsTest();

const startWithAlphaChannel = (config: Awaited<ReturnType<typeof tvConfig>>) => {
  config.set("channels", [alphaChannel]);
  config.set("lastViewedChannelId", "alpha");
};

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("Opening Stash's queue", () => {
  it("shows a queue played from a scene list, then forgets it", async () => {
    // A queue of the scenes tagged Delta, as Stash's scene page puts it in its URL: "Ember Evening" and "Horizon Hush"
    const list = new ListFilterModel(GQL.FilterMode.Scenes);
    list.configureFromQueryString(
      '?sortby=title&c=("type":"tags","modifier":"INCLUDES_ALL","value":("items":[("id":"tag-delta","label":"Delta")],"excluded":[],"depth":0))'
    );
    window.history.replaceState(null, "", SceneQueue.fromListFilterModel(list).makeLink("scene-5", { sceneIndex: 0, start: 5 }));

    const app = await bootWithTvConfig(startWithAlphaChannel, "Ember Evening");
    await feedShows(app, "Horizon Hush");
    await feedDoesNotShow(app, ALPHA_SCENE);

    const config = await tvConfig();
    expect(config.channels.at(-1)?.sources[0]).toMatchObject({ type: "temporary-filter", filter: { name: "Queue" } });
    // The queue's params are taken off the URL, so reloading shows the startup channel. Others are left alone.
    expect(window.location.search).toBe("?t=5");
    expect(savedTvConfig(integration).channels).toEqual([alphaChannel]);
    expect(savedTvConfig(integration).lastViewedChannelId).toBe("alpha");

    await app.unmount();
  });

  it("starts at the scene Stash was playing, past the feed's first page", async () => {
    // Every scene by title: "Grotto Glow" (scene-7) is 7th, past the feed's first page of 5
    const list = new ListFilterModel(GQL.FilterMode.Scenes);
    list.configureFromQueryString("?sortby=title");
    window.history.replaceState(null, "", SceneQueue.fromListFilterModel(list).makeLink("scene-7", { sceneIndex: 6 }) + "&scene=scene-7");

    const app = await bootWithTvConfig(startWithAlphaChannel, "Grotto Glow");
    await waitFor(() => expect(sceneIdOf(currentSlide(app))).toBe("scene-7"));
    // The queue's earlier scenes are still there to go back to
    expect(slides(app).map(sceneIdOf)).toContain("scene-6");
    expect(window.location.search).toBe("");

    await app.unmount();
  });

  it("shows only the scenes a temporary filter is limited to", async () => {
    const app = await bootWithTvConfig(startWithAlphaChannel, ALPHA_SCENE);
    const { showTemporaryFilter } = await import("../../src/hooks/useMediaItemFilters");

    act(() => showTemporaryFilter({ mode: GQL.FilterMode.Scenes, name: "Queue", scene_ids: ["scene-5", "scene-8"] }));

    await feedShows(app, "Ember Evening");
    await feedShows(app, "Horizon Hush");
    await feedDoesNotShow(app, ALPHA_SCENE);

    await app.unmount();
  });
});
