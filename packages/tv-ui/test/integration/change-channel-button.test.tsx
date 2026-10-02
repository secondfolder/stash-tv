/**
 * The change channel button. By default it opens a panel listing the channels; with its `cycle` setting each press
 * switches to the next channel instead, showing the new channel's name in the feedback overlay.
 *
 * @see docs/action-buttons.md § "Per-Button Behaviour"
 * @see docs/channels.md § "Active channel"
 */

import { describe, expect, it } from "vitest";
import { act, fireEvent, waitFor, within } from "@testing-library/react";
import { setupIntegrationTest, bootApp, savedTvConfig, type BootedApp } from "./helpers/harness";
import { bootWithTvConfig, currentSlide, pinActionButtons } from "./helpers/feed";
import { isSidePanelOpen, sidePanel } from "../helpers/actionButtons";
import type { ChannelConfig } from "../../src/components/channels/channel-config";

const integration = setupIntegrationTest();

const channels: ChannelConfig[] = [
  { id: "all-scenes", sources: [{ type: "all", entityType: "scene", randomise: false }] },
  { id: "alpha", sources: [{ type: "stash-saved-filter", savedFilterId: "2", randomise: false }] },
  { id: "all-markers", sources: [{ type: "all", entityType: "marker", randomise: false }] },
];
const channelNames = ["All scenes", "Scenes: Alpha Scenes", "All markers"];

// "Blueprint Boulevard" is a scene that "Alpha Scenes" excludes. "Intro" is a marker, never a scene title.
const NON_ALPHA_SCENE = "Blueprint Boulevard";
const ALPHA_SCENE = "Drift Duration";
const MARKER = "Intro";

// fireEvent rather than userEvent: see docs/testing.md § "Gotchas" (userEvent.click breaks with a MediaSlide mounted)
function click(element: HTMLElement) {
  fireEvent.click(element);
}

async function bootOnFirstChannel() {
  return await bootWithTvConfig((config) => {
    config.set("channels", channels);
    config.set("lastViewedChannelId", "all-scenes");
  });
}

/** The button is re-found each time since switching channel reloads the feed, replacing the current slide */
function changeChannelButton(app: BootedApp) {
  return within(currentSlide(app)).findByRole("button", { name: "Change channel" });
}

function feedText(app: BootedApp) {
  return app.rendered.container.querySelector(".VideoScroller")?.textContent ?? "";
}

function feedbackText() {
  return document.querySelector(".FeedbackOverlay")?.textContent ?? "";
}

describe("Change channel button", () => {
  it("is in the default stack but hidden while there's only one channel", async () => {
    // New users have the default stack and a single "All scenes" channel
    const app = await bootApp();
    const { useTvConfig } = await import("../../src/store/tvConfig");
    expect(useTvConfig.getState().actionButtonStackConfig).toContainEqual(
      expect.objectContaining({ type: "button", buttonType: "change-channel" })
    );
    // Wait for the stack to render another button so the absence isn't vacuous
    await within(currentSlide(app)).findByRole("button", { name: "Show scene info" });
    expect(within(currentSlide(app)).queryByRole("button", { name: "Change channel" })).not.toBeInTheDocument();

    // A second channel makes it appear
    await act(async () => useTvConfig.getState().set("channels", channels.slice(0, 2)));
    await changeChannelButton(app);

    await app.unmount();
  });

  it("lists the channels in a panel, marking the one showing", async () => {
    const app = await bootOnFirstChannel();
    await pinActionButtons(["change-channel"]);

    click(await changeChannelButton(app));

    const options = within(sidePanel()).getAllByRole("button");
    expect(options.map((option) => option.textContent)).toEqual(channelNames);
    expect(options.filter((option) => option.getAttribute("aria-current") === "true").map((option) => option.textContent))
      .toEqual(["All scenes"]);

    await app.unmount();
  });

  it("switches to the channel chosen in its panel and closes the panel", async () => {
    const app = await bootOnFirstChannel();
    await pinActionButtons(["change-channel"]);

    click(await changeChannelButton(app));
    click(within(sidePanel()).getByRole("button", { name: "Scenes: Alpha Scenes" }));

    await waitFor(() => expect(isSidePanelOpen()).toBe(false));
    await waitFor(() => expect(feedText(app)).toContain(ALPHA_SCENE));
    expect(feedText(app)).not.toContain(NON_ALPHA_SCENE);
    await waitFor(() => expect(savedTvConfig(integration).lastViewedChannelId).toBe("alpha"));

    await app.unmount();
  });

  it("cycles to the next channel on each press when set to, showing its name", async () => {
    const app = await bootOnFirstChannel();
    await pinActionButtons([{ buttonType: "change-channel", cycle: true }]);

    click(await changeChannelButton(app));
    expect(isSidePanelOpen()).toBe(false);
    await waitFor(() => expect(feedbackText()).toBe("Scenes: Alpha Scenes"));
    await waitFor(() => expect(feedText(app)).toContain(ALPHA_SCENE));

    click(await changeChannelButton(app));
    await waitFor(() => expect(feedbackText()).toBe("All markers"));
    await waitFor(() => expect(feedText(app)).toContain(MARKER));

    // Wraps from the last channel back to the first
    click(await changeChannelButton(app));
    await waitFor(() => expect(feedbackText()).toBe("All scenes"));
    await waitFor(() => expect(feedText(app)).toContain(NON_ALPHA_SCENE));
    await waitFor(() => expect(savedTvConfig(integration).lastViewedChannelId).toBe("all-scenes"));

    await app.unmount();
  });
});
