/**
 * The search palette, opened by the search action button or `/`: typing suggests searching for the text, and the
 * channels, performers, tags and studios it matches. Picking one shows it in the temporary channel, always replacing
 * what that showed, except a channel, which the feed switches to.
 *
 * @see docs/search.md
 */

import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupIntegrationTest, bootApp } from "./helpers/harness";
import { bootWithTvConfig, click, feedDoesNotShow, feedShows, tvConfig } from "./helpers/feed";
import { showTemporaryEntityFilter, temporaryChannelFilter } from "./helpers/entity-popovers";
import { openSearch, searchField, suggestion, suggestionsIn, typeSearch } from "./helpers/search";
import type { ChannelConfig } from "../../src/components/channels/channel-config";

setupIntegrationTest();

// The feed starts on the newest scene, "Grotto Glow" (fixture scene-7)
const FIRST_SCENE = "Grotto Glow";

describe("Search", () => {
  it("is in the default stack, and opens the search palette", async () => {
    const app = await bootApp(FIRST_SCENE);

    await openSearch(app);

    expect(searchField()).toHaveFocus();

    await app.unmount();
  });

  it("opens with its keyboard shortcut", async () => {
    const app = await bootApp(FIRST_SCENE);

    await userEvent.keyboard("/");

    // The key isn't typed into the field once it has focus
    await waitFor(() => expect(searchField()).toHaveValue(""));

    await app.unmount();
  });

  it("searches scenes for what's typed on Enter, in the temporary channel", async () => {
    const app = await bootApp(FIRST_SCENE);
    await openSearch(app);

    await typeSearch("Cascade");
    await userEvent.keyboard("{Enter}");

    await feedShows(app, "Cascade Calm");
    await feedDoesNotShow(app, FIRST_SCENE);
    expect(await temporaryChannelFilter()).toMatchObject({ name: "“Cascade”", find_filter: { q: "Cascade" } });
    expect(screen.queryByRole("combobox", { name: "Search" })).not.toBeInTheDocument();

    await app.unmount();
  });

  it("searches markers for what's typed with the suggestion under it", async () => {
    const app = await bootApp(FIRST_SCENE);
    await openSearch(app);

    await typeSearch("Peak");
    await userEvent.keyboard("{ArrowDown}{Enter}");

    await feedShows(app, "Peak");
    await feedDoesNotShow(app, "Intro");

    await app.unmount();
  });

  it("suggests performers, showing their scenes when picked", async () => {
    const app = await bootApp(FIRST_SCENE);
    await openSearch(app);

    const listbox = await typeSearch("carol");
    expect(suggestionsIn(listbox, "Performers")).toEqual([expect.stringContaining("Carol Chase")]);
    expect(suggestion(listbox, "Performers", "Carol Chase")).toHaveTextContent("2 scenes");
    click(suggestion(listbox, "Performers", "Carol Chase"));

    // Carol Chase is in "Cascade Calm" and "Foothill Flight" only
    await feedShows(app, "Cascade Calm");
    await feedDoesNotShow(app, FIRST_SCENE);
    expect((await temporaryChannelFilter())?.name).toBe("Carol Chase");

    await app.unmount();
  });

  it("suggests a tag's scenes, and its markers when it has any", async () => {
    const app = await bootApp(FIRST_SCENE);
    await openSearch(app);

    let listbox = await typeSearch("delta");
    expect(suggestionsIn(listbox, "Tags")).toEqual([expect.stringContaining("Delta")]);
    // No marker has "Delta"
    expect(within(listbox).queryByRole("group", { name: "Markers by tag" })).not.toBeInTheDocument();

    await userEvent.clear(searchField());
    listbox = await typeSearch("gamma");
    click(suggestion(listbox, "Markers by tag", "Gamma"));

    // The markers with "Gamma": "Finale" (one of its tags) and "Highlight" (its primary tag)
    await feedShows(app, "Highlight");
    await feedDoesNotShow(app, "Intro");

    await app.unmount();
  });

  it("suggests studios, showing their scenes when picked", async () => {
    const app = await bootApp(FIRST_SCENE);
    await openSearch(app);

    const listbox = await typeSearch("prism");
    click(suggestion(listbox, "Studios", "Prism Pictures"));

    await feedShows(app, "Aurora Ascending");
    await feedDoesNotShow(app, FIRST_SCENE);

    await app.unmount();
  });

  it("suggests the user's channels, switching to one picked rather than making a temporary channel", async () => {
    const channels: ChannelConfig[] = [
      { id: "all-scenes", sources: [{ type: "all", entityType: "scene", randomise: false }] },
      { id: "alpha", sources: [{ type: "stash-saved-filter", savedFilterId: "2", randomise: false }] },
    ];
    const app = await bootWithTvConfig((config) => {
      config.set("channels", channels);
      config.set("lastViewedChannelId", "all-scenes");
    }, FIRST_SCENE);
    await openSearch(app);

    const listbox = await typeSearch("alpha");
    click(suggestion(listbox, "Channels", "Scenes: Alpha Scenes"));

    // "Alpha Scenes" doesn't have "Blueprint Boulevard"
    await feedDoesNotShow(app, "Blueprint Boulevard");
    expect(await temporaryChannelFilter()).toBeUndefined();
    expect((await tvConfig()).lastViewedChannelId).toBe("alpha");

    await app.unmount();
  });

  it("replaces the temporary channel's filter rather than adding to it", async () => {
    const app = await bootApp(FIRST_SCENE);
    await showTemporaryEntityFilter("performer", { id: "performer-carol", name: "Carol Chase" });
    await feedShows(app, "Cascade Calm");
    await openSearch(app);

    await typeSearch("Foothill");
    await userEvent.keyboard("{Enter}");

    await waitFor(async () => expect((await temporaryChannelFilter())?.name).toBe("“Foothill”"));
    expect((await temporaryChannelFilter())?.object_filter).toEqual({});
    expect((await tvConfig()).channels.filter((channel) => channel.id === "temporary")).toHaveLength(1);

    await app.unmount();
  });

  it("says when nothing but the text itself can be searched for", async () => {
    const app = await bootApp(FIRST_SCENE);
    await openSearch(app);

    const listbox = await typeSearch("zzqx");

    expect(within(listbox).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Scenes matching “zzqx”",
      "Markers matching “zzqx”",
    ]);
    expect(screen.getByText("No channels, performers, tags or studios match.")).toBeInTheDocument();

    await app.unmount();
  });

  it("closes with Escape, empty the next time it's opened", async () => {
    const app = await bootApp(FIRST_SCENE);
    await openSearch(app);
    await typeSearch("Cascade");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("combobox", { name: "Search" })).not.toBeInTheDocument());
    await openSearch(app);

    expect(searchField()).toHaveValue("");

    await app.unmount();
  });
});
