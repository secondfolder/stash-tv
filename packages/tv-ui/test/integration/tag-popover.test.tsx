/**
 * Tags in the scene info panel open a popover with the tag's card (linking to it in Stash) and buttons: show its scenes
 * in the feed (in the temporary channel), or add it to the temporary channel's tag filter or remove it from it.
 *
 * @see docs/entity-popovers.md
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { setupIntegrationTest, type BootedApp } from "./helpers/harness";
import { bootWithTvConfig, currentSlide } from "./helpers/feed";

setupIntegrationTest();

// The first slide's scene (fixture scene-7), tagged "Beta" only. The next is "Foothill Flight", which isn't.
const DATE = "14 February 2025";
const NOT_BETA_SCENE = "Foothill Flight";

// fireEvent rather than userEvent: see docs/testing.md § "Gotchas" (userEvent.click breaks with a MediaSlide mounted)
function click(element: HTMLElement) {
  fireEvent.click(element);
}

/** Boot showing the scene info panel with just the title (which the feed is checked for), date and tags */
async function bootShowingTags(readyText = DATE) {
  const app = await bootWithTvConfig((tvConfig) => tvConfig.set("sceneInfoLayout", [["title"], ["date"], ["tags"]]), readyText);
  const { useGlobalState } = await import("../../src/store/globalState");
  await act(async () => useGlobalState.getState().set("sceneInfoOpen", true));
  return app;
}

function tagLink(app: BootedApp, name: string) {
  return within(within(currentSlide(app)).getByTestId("MediaSlide--sceneInfo")).getByRole("link", { name });
}

async function openTagPopover(app: BootedApp, name: string) {
  // The feed may be reloading for a new channel filter, with no current slide yet
  click(await waitFor(() => tagLink(app, name)));
  return await screen.findByRole("dialog", { name });
}

async function feedShows(app: BootedApp, text: string) {
  await waitFor(() => expect(app.rendered.container.querySelector(".VideoScroller")?.textContent).toContain(text));
}

async function feedDoesNotShow(app: BootedApp, text: string) {
  await waitFor(() => expect(app.rendered.container.querySelector(".VideoScroller")?.textContent).not.toContain(text));
}

async function temporaryChannelFilter() {
  const { useTvConfig } = await import("../../src/store/tvConfig");
  const { getTemporaryFilter } = await import("../../src/components/channels/channel-config");
  return getTemporaryFilter(useTvConfig.getState().channels);
}

/** Show a temporary channel filtering by the tag, as the popover's "Show scenes with this tag" does */
async function showTemporaryTagFilter(tag: { id: string; name: string }) {
  const { showTemporaryFilter } = await import("../../src/hooks/useMediaItemFilters");
  const { makeEntityFilter } = await import("../../src/components/channels/temporary-filter");
  await act(async () => showTemporaryFilter(makeEntityFilter("tag", tag)));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Tag popover", () => {
  it("opens with the tag's card when a tag is clicked", async () => {
    const app = await bootShowingTags();

    const popover = await openTagPopover(app, "Beta");

    // The card's title, and its count of the tag's scenes
    expect(await within(popover).findByRole("heading", { name: "Beta" })).toBeInTheDocument();
    expect(within(popover).getByRole("button", { name: "Show scenes with this tag" })).toBeInTheDocument();

    await app.unmount();
  });

  it("opens when a tag is hovered over, and closes once the pointer leaves", async () => {
    const app = await bootShowingTags();

    fireEvent.mouseEnter(tagLink(app, "Beta"));
    expect(await screen.findByRole("dialog", { name: "Beta" })).toBeInTheDocument();
    fireEvent.mouseLeave(tagLink(app, "Beta"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Beta" })).not.toBeInTheDocument());

    await app.unmount();
  });

  it("opens links in the tag's card in Stash, in a new tab", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const app = await bootShowingTags();

    const popover = await openTagPopover(app, "Beta");
    click(await within(popover).findByRole("heading", { name: "Beta" }));

    expect(open).toHaveBeenCalledWith(expect.stringMatching(/\/tags\/tag-beta$/), "_blank");

    await app.unmount();
  });

  it("leaves buttons in links in the tag's card (its favourite button) to do what they do, not open Stash", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const app = await bootShowingTags();

    const popover = await openTagPopover(app, "Beta");
    await within(popover).findByRole("heading", { name: "Beta" });
    // Stash gives it no accessible name
    const favouriteButton = popover.querySelector<HTMLElement>(".favorite-button");
    if (!favouriteButton) throw new Error("No favourite button in the tag's card");
    click(favouriteButton);

    expect(open).not.toHaveBeenCalled();

    await app.unmount();
  });

  it("shows the tag's scenes in the feed, in a temporary channel", async () => {
    const app = await bootShowingTags();

    const popover = await openTagPopover(app, "Beta");
    click(within(popover).getByRole("button", { name: "Show scenes with this tag" }));

    await feedShows(app, "Blueprint Boulevard");
    await feedDoesNotShow(app, NOT_BETA_SCENE);
    expect((await temporaryChannelFilter())?.name).toBe("Beta");

    await app.unmount();
  });

  it("offers to add the tag to the temporary channel's tag filter, showing scenes with all of its tags", async () => {
    const app = await bootShowingTags();
    // "Alpha" is on "Aurora Ascending", "Drift Duration" and "Foothill Flight", the newest, which is also "Epsilon"
    await showTemporaryTagFilter({ id: "tag-alpha", name: "Alpha" });
    await feedShows(app, "Aurora Ascending");

    const popover = await openTagPopover(app, "Epsilon");
    click(within(popover).getByRole("button", { name: "Add to channel filter" }));

    await feedDoesNotShow(app, "Aurora Ascending");
    await feedShows(app, "Foothill Flight");
    expect((await temporaryChannelFilter())?.name).toBe("Alpha & Epsilon");

    await app.unmount();
  });

  it("doesn't offer to add the tag to a filter without one, or one already requiring it", async () => {
    const app = await bootShowingTags();

    let popover = await openTagPopover(app, "Beta");
    expect(within(popover).queryByRole("button", { name: "Add to channel filter" })).not.toBeInTheDocument();
    click(within(popover).getByRole("button", { name: "Show scenes with this tag" }));
    await feedDoesNotShow(app, NOT_BETA_SCENE);

    popover = await openTagPopover(app, "Beta");
    expect(within(popover).getByRole("button", { name: "Show scenes with this tag" })).toBeInTheDocument();
    expect(within(popover).queryByRole("button", { name: "Add to channel filter" })).not.toBeInTheDocument();

    await app.unmount();
  });

  it("offers to remove the tag from the temporary channel's filter while it'd still filter by another", async () => {
    const app = await bootShowingTags();
    // "Foothill Flight" is the newest scene with "Alpha"
    await showTemporaryTagFilter({ id: "tag-alpha", name: "Alpha" });
    let popover = await openTagPopover(app, "Epsilon");
    click(within(popover).getByRole("button", { name: "Add to channel filter" }));
    await feedDoesNotShow(app, "Aurora Ascending");

    popover = await openTagPopover(app, "Epsilon");
    click(within(popover).getByRole("button", { name: "Remove from channel filter" }));

    await feedShows(app, "Aurora Ascending");
    expect((await temporaryChannelFilter())?.name).toBe("Alpha");
    // Alpha's the only tag left, and without it the filter would show everything
    popover = await openTagPopover(app, "Alpha");
    expect(within(popover).queryByRole("button", { name: "Remove from channel filter" })).not.toBeInTheDocument();

    await app.unmount();
  });
});
