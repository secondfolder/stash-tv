/**
 * Editing, switching to and deleting channels in the Settings tab.
 *
 * @see docs/channels.md
 */

import { describe, expect, it } from "vitest";
import { waitFor, within } from "@testing-library/react";
import { savedTvConfig } from "./helpers/harness";
import { bootWithTvConfig, feedShows, click, tvConfig } from "./helpers/feed";
import { setupChannelSettingsTest, ALPHA_SCENE, MARKER, alphaChannel, chooseSource } from "./helpers/channel-settings";
import { allMarkersChannel, openChannelSettings, listedChannels, channelItem, channelModal } from "../helpers/channelSettings";

const integration = setupChannelSettingsTest();

describe("Channel settings", () => {
  it("edits a channel's source and randomise option", async () => {
    const app = await bootWithTvConfig((config) => config.set("channels", [alphaChannel]), ALPHA_SCENE);
    await openChannelSettings();

    click(within(channelItem("Alpha Scenes")).getByRole("button", { name: "Edit channel" }));
    const modal = await channelModal();
    await chooseSource(modal, "Markers", "Beta Markers");
    click(within(modal).getByLabelText("Randomise order"));
    click(within(modal).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(listedChannels()).toEqual(["Beta Markers"]));
    const editedChannels = [
      { id: "alpha", sources: [{ type: "stash-saved-filter", savedFilterId: "4", randomise: true }] },
    ];
    expect((await tvConfig()).channels).toEqual(editedChannels);
    // It's the active channel so the feed follows the edit. "Peak" is a marker with the beta tag.
    await feedShows(app, "Peak");
    await waitFor(() => expect(savedTvConfig(integration).channels).toEqual(editedChannels));

    await app.unmount();
  });

  it("changes nothing when editing is cancelled", async () => {
    const app = await bootWithTvConfig((config) => config.set("channels", [alphaChannel]), ALPHA_SCENE);
    await openChannelSettings();

    click(within(channelItem("Alpha Scenes")).getByRole("button", { name: "Edit channel" }));
    const modal = await channelModal();
    await chooseSource(modal, "Markers", "Beta Markers");
    click(within(modal).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(document.querySelector(".ChannelSettingsModal")).not.toBeInTheDocument());
    expect((await tvConfig()).channels).toEqual([alphaChannel]);

    await app.unmount();
  });

  it("switches the feed to a channel when it's clicked", async () => {
    const app = await bootWithTvConfig((config) => {
      config.set("channels", [alphaChannel, allMarkersChannel]);
      config.set("lastViewedChannelId", "alpha");
    }, ALPHA_SCENE);
    await openChannelSettings();
    expect(within(channelItem("Alpha Scenes")).getByRole("button", { name: /Alpha Scenes/ }))
      .toHaveAttribute("aria-current", "true");

    click(within(channelItem("All markers")).getByRole("button", { name: /All markers/ }));

    await feedShows(app, MARKER);
    expect(within(channelItem("All markers")).getByRole("button", { name: /All markers/ }))
      .toHaveAttribute("aria-current", "true");
    await waitFor(() => expect(savedTvConfig(integration).lastViewedChannelId).toBe("all-markers"));

    await app.unmount();
  });

  it("deletes a channel, moving the feed to the next one if it was showing", async () => {
    const app = await bootWithTvConfig((config) => {
      config.set("channels", [alphaChannel, allMarkersChannel]);
      config.set("lastViewedChannelId", "alpha");
    }, ALPHA_SCENE);
    await openChannelSettings();

    click(within(channelItem("Alpha Scenes")).getByRole("button", { name: "Delete channel" }));

    await waitFor(() => expect(listedChannels()).toEqual(["All markers"]));
    await feedShows(app, MARKER);
    await waitFor(() => expect(savedTvConfig(integration).channels).toEqual([allMarkersChannel]));
    // The last channel can't be deleted
    expect(within(channelItem("All markers")).queryByRole("button", { name: "Delete channel" })).not.toBeInTheDocument();

    await app.unmount();
  });

  it("shows a channel whose filter was deleted from Stash as missing", async () => {
    const app = await bootWithTvConfig((config) => {
      config.set("channels", [
        allMarkersChannel,
        { id: "deleted", sources: [{ type: "stash-saved-filter", savedFilterId: "deleted-filter", randomise: false }] },
      ]);
      config.set("lastViewedChannelId", "all-markers");
    }, MARKER);
    await openChannelSettings();

    await waitFor(() => expect(listedChannels()).toEqual(["All markers", "Missing filter"]));
    expect(channelItem("Missing filter")).toHaveClass("missing");

    await app.unmount();
  });
});
