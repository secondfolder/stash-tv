/**
 * Channel settings. The Settings tab lists the user's channels: adding or editing one opens a modal to choose its
 * source, clicking one switches the feed to it, and "Channel on Startup" picks which one shows on load.
 *
 * @see docs/channels.md
 */

import { describe, expect, it, onTestFinished } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupIntegrationTest, bootApp, savedTvConfig, type BootedApp } from "./helpers/harness";
import { bootWithTvConfig } from "./helpers/feed";
import type { ChannelConfig } from "../../src/components/channels/channel-config";

const integration = setupIntegrationTest();

// Fixture filter "2" ("Alpha Scenes") matches scene-1/4/6 only. "Blueprint Boulevard" is a scene it excludes.
const ALPHA_SCENE = "Drift Duration";
const NON_ALPHA_SCENE = "Blueprint Boulevard";
// A fixture marker title, never a scene title
const MARKER = "Intro";

// The channel new users start with
const defaultChannel: ChannelConfig = {
  id: "all-scenes",
  sources: [{ type: "all", entityType: "scene", randomise: false }],
};
const alphaChannel: ChannelConfig = {
  id: "alpha",
  sources: [{ type: "stash-saved-filter", savedFilterId: "2", randomise: false }],
};
const allMarkersChannel: ChannelConfig = {
  id: "all-markers",
  sources: [{ type: "all", entityType: "marker", randomise: false }],
};

// fireEvent rather than userEvent: see docs/testing.md § "Gotchas" (userEvent.click breaks with a MediaSlide mounted)
function click(element: HTMLElement) {
  fireEvent.click(element);
}

async function tvConfig() {
  const { useTvConfig } = await import("../../src/store/tvConfig");
  return useTvConfig.getState();
}

async function openChannelSettings() {
  const { useGlobalState } = await import("../../src/store/globalState");
  await act(async () => useGlobalState.getState().set("showSettings", true));
  await screen.findByText("Channels");
}

/** The channels listed in the Settings tab, as their names */
function listedChannels() {
  return [...document.querySelectorAll<HTMLElement>(".ChannelSettings .channel .channel-name")]
    .map((element) => element.textContent);
}

function channelItem(name: string) {
  const item = [...document.querySelectorAll<HTMLElement>(".ChannelSettings .channel")].find(
    (element) => element.querySelector(".channel-name")?.textContent === name
  );
  if (!item) throw new Error(`No "${name}" channel in the Settings tab's list`);
  return item;
}

async function channelModal() {
  return await waitFor(() => {
    const modal = document.querySelector<HTMLElement>(".ChannelSettingsModal");
    if (!modal) throw new Error("Channel modal not shown");
    return modal;
  });
}

/** Choose what the channel in the modal shows: its media type, then the option with the given name */
async function chooseSource(modal: HTMLElement, mediaType: "Scenes" | "Markers", optionText: string) {
  click(within(modal).getByRole("button", { name: mediaType }));
  const combobox = within(modal).getByLabelText("Show");
  act(() => combobox.focus());
  await userEvent.keyboard(optionText);
  const listbox = await waitFor(() => {
    const element = document.getElementById(combobox.getAttribute("aria-controls") ?? "");
    if (!element) throw new Error("Source options not shown");
    return element;
  });
  click(await within(listbox).findByText(optionText));
}

/** The options in the modal's source dropdown */
async function sourceOptions(modal: HTMLElement) {
  const combobox = within(modal).getByLabelText("Show");
  act(() => combobox.focus());
  await userEvent.keyboard("{ArrowDown}");
  const listbox = await waitFor(() => {
    const element = document.getElementById(combobox.getAttribute("aria-controls") ?? "");
    if (!element) throw new Error("Source options not shown");
    return element;
  });
  const options = within(listbox).getAllByRole("option").map((option) => option.textContent);
  await userEvent.keyboard("{Escape}");
  return options;
}

async function feedShows(app: BootedApp, text: string) {
  await waitFor(() => expect(app.rendered.container.querySelector(".VideoScroller")?.textContent).toContain(text));
}

async function feedDoesNotShow(app: BootedApp, text: string) {
  await waitFor(() => expect(app.rendered.container.querySelector(".VideoScroller")?.textContent).not.toContain(text));
}

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

    const combobox = screen.getByLabelText("Channel on Startup");
    act(() => combobox.focus());
    await userEvent.keyboard("First");
    click(await screen.findByText("First in list"));

    await waitFor(() => expect(savedTvConfig(integration).startupChannel).toBe("first"));

    await app.unmount();
  });
});
