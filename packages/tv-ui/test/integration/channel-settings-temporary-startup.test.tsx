/**
 * The temporary channel, and which channel shows on startup.
 *
 * @see docs/channels.md
 */

import { describe, expect, it } from "vitest";
import { act, waitFor, within } from "@testing-library/react";
import { bootApp, savedTvConfig } from "./helpers/harness";
import { chooseSelectOption } from "./helpers/selects";
import { bootWithTvConfig, feedShows, click, tvConfig, feedDoesNotShow } from "./helpers/feed";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import type { ChannelConfig } from "../../src/components/channels/channel-config";
import { setupChannelSettingsTest, startupChannelSelect, ALPHA_SCENE, MARKER, alphaChannel, allMarkersChannel, openChannelSettings, listedChannels, channelItem } from "./helpers/channel-settings";

const integration = setupChannelSettingsTest();

/** @see docs/channels.md § "Temporary channel" */
describe("Temporary channel", () => {
  // "Delta" is on "Ember Evening" and "Horizon Hush" only
  const DELTA_SCENE = "Ember Evening";
  const deltaChannel: ChannelConfig = {
    id: "temporary",
    sources: [{
      type: "temporary-filter",
      filter: {
        mode: GQL.FilterMode.Scenes,
        name: "Tagged Delta",
        object_filter: {
          tags: { modifier: GQL.CriterionModifier.IncludesAll, value: { items: [{ id: "tag-delta", label: "Delta" }], excluded: [], depth: 0 } },
        },
      },
      randomise: false,
    }],
  };

  async function addTemporaryChannel() {
    const config = await tvConfig();
    await act(async () => config.set("channels", channels => [...channels, deltaChannel]));
  }

  it("is listed last, marked temporary, and can't be edited or moved", async () => {
    const app = await bootWithTvConfig((config) => {
      config.set("channels", [alphaChannel, allMarkersChannel]);
      config.set("lastViewedChannelId", "alpha");
    }, ALPHA_SCENE);
    await addTemporaryChannel();
    await openChannelSettings();

    await waitFor(() => expect(listedChannels()).toEqual(["Alpha Scenes", "All markers", "Tagged Delta"]));
    const item = channelItem("Tagged Delta");
    expect(within(item).getByText("Temporary")).toBeInTheDocument();
    expect(within(item).queryByRole("button", { name: "Edit channel" })).not.toBeInTheDocument();
    expect(item.querySelector(".drag-handle")).toHaveClass("disable");

    await app.unmount();
  });

  it("shows its filter's media, without becoming the last viewed channel or being saved", async () => {
    const app = await bootWithTvConfig((config) => {
      config.set("channels", [alphaChannel]);
      config.set("lastViewedChannelId", "alpha");
    }, ALPHA_SCENE);
    await addTemporaryChannel();
    await openChannelSettings();

    click(within(channelItem("Tagged Delta")).getByRole("button", { name: /Tagged Delta/ }));

    await feedShows(app, DELTA_SCENE);
    await feedDoesNotShow(app, ALPHA_SCENE);
    await waitFor(() => expect(savedTvConfig(integration).channels).toEqual([alphaChannel]));
    expect(savedTvConfig(integration).lastViewedChannelId).toBe("alpha");

    await app.unmount();
  });

  it("can be deleted even when it's the only other channel, though the last saved one can't", async () => {
    const app = await bootWithTvConfig((config) => {
      config.set("channels", [alphaChannel]);
      config.set("lastViewedChannelId", "alpha");
    }, ALPHA_SCENE);
    await addTemporaryChannel();
    await openChannelSettings();

    await waitFor(() => expect(listedChannels()).toEqual(["Alpha Scenes", "Tagged Delta"]));
    expect(within(channelItem("Alpha Scenes")).queryByRole("button", { name: "Delete channel" })).not.toBeInTheDocument();
    click(within(channelItem("Tagged Delta")).getByRole("button", { name: "Delete channel" }));

    await waitFor(() => expect(listedChannels()).toEqual(["Alpha Scenes"]));

    await app.unmount();
  });
});

describe("Channel on startup", () => {
  /** @see docs/channels.md § "Startup channel" */
  const twoChannels = (startupChannel: "last-viewed" | "first") =>
    (config: Awaited<ReturnType<typeof tvConfig>>) => {
      config.set("channels", [alphaChannel, allMarkersChannel]);
      config.set("lastViewedChannelId", "all-markers");
      config.set("startupChannel", startupChannel);
    };

  it("shows the last viewed channel by default", async () => {
    const app = await bootWithTvConfig(twoChannels("last-viewed"), MARKER);
    await app.unmount();
  });

  it("shows the first channel when set to, without forgetting the last viewed one", async () => {
    const app = await bootWithTvConfig(twoChannels("first"), ALPHA_SCENE);
    expect((await tvConfig()).lastViewedChannelId).toBe("all-markers");
    await app.unmount();
  });

  it("is chosen in the Settings tab", async () => {
    const app = await bootApp();
    await openChannelSettings();

    await chooseSelectOption(startupChannelSelect(), "First in list");

    await waitFor(() => expect(savedTvConfig(integration).startupChannel).toBe("first"));

    await app.unmount();
  });
});
