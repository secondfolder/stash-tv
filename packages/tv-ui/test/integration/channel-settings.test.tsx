/**
 * Channel settings. The Settings tab lists the user's channels: adding or editing one opens a modal to choose its
 * source, clicking one switches the feed to it, and "Channel on Startup" picks which one shows on load.
 *
 * Adding channels and choosing their sources. Editing, switching and deleting them, the temporary channel and the
 * channel on startup are tested in files of their own, so they run in parallel.
 *
 * @see docs/channels.md
 */

import { describe, expect, it, onTestFinished } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { bootApp, savedTvConfig } from "./helpers/harness";
import { bootWithTvConfig } from "./helpers/feed";
import { setupChannelSettingsTest, ALPHA_SCENE, NON_ALPHA_SCENE, defaultChannel, alphaChannel, allMarkersChannel, click, tvConfig, openChannelSettings, listedChannels, channelItem, channelModal, chooseSource, sourceOptions, feedShows, feedDoesNotShow } from "./helpers/channel-settings";

const integration = setupChannelSettingsTest();

describe("Channel settings", () => {
  it("starts new users with a single \"All scenes\" channel that can't be deleted", async () => {
    const app = await bootApp();
    await openChannelSettings();

    expect(listedChannels()).toEqual(["All scenes"]);
    const item = channelItem("All scenes");
    expect(within(item).getByRole("button", { name: "All scenes" })).toHaveAttribute("aria-current", "true");
    expect(within(item).queryByRole("button", { name: "Delete channel" })).not.toBeInTheDocument();

    await app.unmount();
  });

  it("prefixes the names of saved filter channels with their type", async () => {
    const app = await bootWithTvConfig((config) => {
      config.set("channels", [defaultChannel, alphaChannel, allMarkersChannel, {
        id: "beta-markers",
        sources: [{ type: "stash-saved-filter", savedFilterId: "4", randomise: false }],
      }]);
      config.set("lastViewedChannelId", "all-scenes");
    });
    await openChannelSettings();

    await waitFor(() => expect(
      [...document.querySelectorAll<HTMLElement>(".ChannelSettings .channel .select-channel")]
        .map((element) => element.textContent)
    ).toEqual(["All scenes", "Scenes: Alpha Scenes", "All markers", "Markers: Beta Markers"]));

    await app.unmount();
  });

  it("adds a channel for the chosen filter and switches the feed to it", async () => {
    const app = await bootApp();
    await openChannelSettings();

    click(screen.getByText("Add channel"));
    const modal = await channelModal();
    await chooseSource(modal, "Scenes", "Alpha Scenes");
    click(within(modal).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(listedChannels()).toEqual(["All scenes", "Alpha Scenes"]));
    await feedShows(app, ALPHA_SCENE);
    await feedDoesNotShow(app, NON_ALPHA_SCENE);
    await waitFor(() => expect(savedTvConfig(integration).channels).toEqual([
      defaultChannel,
      { id: expect.any(String), sources: [{ type: "stash-saved-filter", savedFilterId: "2", randomise: false }] },
    ]));

    await app.unmount();
  });

  it("lists everything of the chosen media type, then its saved filters, in the source dropdown", async () => {
    // The fixtures' own "All Scenes" and "All Markers" filters would hide ours (see the next test)
    const { savedFilters } = integration.server.store;
    const originalFilters = new Map(savedFilters);
    savedFilters.set("1", { ...savedFilters.get("1")!, name: "Everything" });
    savedFilters.set("3", { ...savedFilters.get("3")!, name: "Every Marker" });
    onTestFinished(() => {
      savedFilters.clear();
      for (const [id, filter] of originalFilters) savedFilters.set(id, filter);
    });

    const app = await bootApp();
    await openChannelSettings();

    click(screen.getByText("Add channel"));
    const modal = await channelModal();
    expect(within(modal).getByRole("button", { name: "Scenes" })).toHaveAttribute("aria-pressed", "true");
    expect(await sourceOptions(modal)).toEqual(["All scenes", "Alpha Scenes", "Everything"]);

    click(within(modal).getByRole("button", { name: "Markers" }));
    expect(within(modal).getByRole("button", { name: "Markers" })).toHaveAttribute("aria-pressed", "true");
    expect(within(modal).getByRole("button", { name: "Scenes" })).toHaveAttribute("aria-pressed", "false");
    expect(await sourceOptions(modal)).toEqual(["All markers", "Beta Markers", "Every Marker"]);

    await app.unmount();
  });

  it("leaves out its own \"All …\" option when Stash has a filter of the same name, unless it's already chosen", async () => {
    // The fixtures include filters named "All Scenes" and "All Markers"
    const app = await bootApp();
    await openChannelSettings();

    click(screen.getByText("Add channel"));
    let modal = await channelModal();
    expect(await sourceOptions(modal)).toEqual(["All Scenes", "Alpha Scenes"]);
    click(within(modal).getByRole("button", { name: "Markers" }));
    expect(await sourceOptions(modal)).toEqual(["All Markers", "Beta Markers"]);
    click(within(modal).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.querySelector(".ChannelSettingsModal")).not.toBeInTheDocument());

    // The default channel already uses it
    click(within(channelItem("All scenes")).getByRole("button", { name: "Edit channel" }));
    modal = await channelModal();
    expect(await sourceOptions(modal)).toEqual(["All scenes", "All Scenes", "Alpha Scenes"]);

    await app.unmount();
  });

  it("clears the chosen source when switching media type", async () => {
    const app = await bootApp();
    await openChannelSettings();

    click(screen.getByText("Add channel"));
    const modal = await channelModal();
    await chooseSource(modal, "Scenes", "Alpha Scenes");
    click(within(modal).getByRole("button", { name: "Markers" }));
    click(within(modal).getByRole("button", { name: "Add" }));

    await within(modal).findByText("Choose a filter");
    expect((await tvConfig()).channels).toEqual([defaultChannel]);

    await app.unmount();
  });

  it("won't add a channel without a source", async () => {
    const app = await bootApp();
    await openChannelSettings();

    click(screen.getByText("Add channel"));
    const modal = await channelModal();
    click(within(modal).getByRole("button", { name: "Add" }));

    await within(modal).findByText("Choose a filter");
    expect((await tvConfig()).channels).toEqual([defaultChannel]);

    await app.unmount();
  });
});
