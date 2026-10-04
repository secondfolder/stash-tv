/**
 * The scene info panel. Its edit button turns its fields into pills, to drag into place, remove, or add from the
 * fields it isn't showing (listed below the pills). The layout persists in tvConfig. Dragging needs layout, so it's covered by the e2e tests.
 *
 * Its fields' options and its spacers are tested in files of their own, so they run in parallel.
 *
 * @see docs/scene-info-panel.md
 */

import { describe, expect, it } from "vitest";
import { act, waitFor, within } from "@testing-library/react";
import { bootApp } from "./helpers/harness";
import { bootWithTvConfig, goToNextSlide, click } from "./helpers/feed";
import { setupSceneInfoPanelTest, openPanel, panel, startEditing, save, shownLines, editorLines, SIMPLE_LAYOUT, bootWithSimpleLayout, shownFields, savedLayout, TITLE, PERFORMER, DATE, TAG } from "./helpers/scene-info-panel";
// From the module of its own, not the panel's config: that imports the fields, and with them the Stash API client,
// which connects as it's imported, before the mock Stash server is set up
import { defaultSceneInfoLayout } from "../../src/components/slide/SceneInfo/default-layout";

setupSceneInfoPanelTest();

describe("scene info panel", () => {
  it("shows the default fields until it's customised", async () => {
    const app = await bootApp();
    const infoPanel = await openPanel(app);

    expect(shownFields(infoPanel)).toEqual([
      // The scene has no studio
      [],
      ["title"],
      ["spacer"],
      ["date", "resolution", "spacer", "frame-rate"],
      ["spacer"],
      ["rating", "o-count", "spacer", "play-count"],
      ["spacer"],
      ["performers"],
      ["spacer"],
      ["tags"],
      ["spacer"],
      ["details"],
    ]);

    await app.unmount();
  });

  it("shows fields that share a line on the same line", async () => {
    const app = await bootWithTvConfig((tvConfig) => tvConfig.set("sceneInfoLayout", [
      ["date", "performers"],
      ["title"],
    ]), DATE);
    const infoPanel = await openPanel(app);

    expect(shownLines(infoPanel)).toEqual([`${DATE}${PERFORMER}`, TITLE]);

    await app.unmount();
  });

  it("shows each field as a pill named after it, on the same lines as the panel", async () => {
    const app = await bootWithTvConfig((tvConfig) => tvConfig.set("sceneInfoLayout", [
      ["date", "performers"],
      ["title"],
    ]), DATE);
    const infoPanel = await startEditing(app);

    expect(editorLines(infoPanel)).toEqual([["Date", "Performers"], ["Title"]]);

    await app.unmount();
  });

  it("shows the scene's values in the pills when asked to, and names again when asked again", async () => {
    const app = await bootWithSimpleLayout();
    const infoPanel = await startEditing(app);
    const fieldName = within(infoPanel).getByRole("button", { name: "Field name" });
    const fieldValue = within(infoPanel).getByRole("button", { name: "Field value" });
    expect(fieldName).toHaveAttribute("aria-pressed", "true");

    click(fieldValue);
    expect(fieldValue).toHaveAttribute("aria-pressed", "true");
    expect(fieldName).toHaveAttribute("aria-pressed", "false");
    // The studio pill is empty: the scene has no studio, and the CSS shows the field's name instead
    expect(editorLines(infoPanel)).toEqual([[""], [TITLE], [PERFORMER], [DATE]]);

    click(fieldName);
    expect(editorLines(infoPanel)).toEqual([["Studio"], ["Title"], ["Performers"], ["Date"]]);

    await app.unmount();
  });

  it("stops showing a field the user removes", async () => {
    const app = await bootWithSimpleLayout();
    const infoPanel = await startEditing(app);

    click(within(infoPanel).getByRole("button", { name: "Remove Performers" }));
    save(infoPanel);

    expect(infoPanel).not.toHaveTextContent(PERFORMER);
    expect(infoPanel).toHaveTextContent(TITLE);
    await waitFor(() => expect(savedLayout()).toEqual([["studio"], ["title"], ["date"]]));

    await app.unmount();
  });

  it("adds an unused field the user taps to a new line at the bottom", async () => {
    const app = await bootWithSimpleLayout();
    const infoPanel = await startEditing(app);

    // Only the fields not in the panel are offered
    expect(within(infoPanel).queryByRole("button", { name: "Add Title" })).not.toBeInTheDocument();
    click(within(infoPanel).getByRole("button", { name: "Add Tags" }));
    save(infoPanel);

    expect(shownLines(infoPanel).at(-1)).toBe(TAG);
    await waitFor(() => expect(savedLayout()).toEqual([["studio"], ["title"], ["performers"], ["date"], ["tags"]]));

    await app.unmount();
  });

  it("goes back to the default fields when reset", async () => {
    const app = await bootWithTvConfig((tvConfig) => tvConfig.set("sceneInfoLayout", [["date"]]), DATE);
    const infoPanel = await startEditing(app);

    click(within(infoPanel).getByRole("button", { name: "Reset to default" }));
    // As in the settings, it's only offered when the layout isn't the default
    expect(within(infoPanel).queryByRole("button", { name: "Reset to default" })).not.toBeInTheDocument();
    save(infoPanel);

    expect(infoPanel).toHaveTextContent(TITLE);
    await waitFor(() => expect(savedLayout()).toEqual(defaultSceneInfoLayout));

    await app.unmount();
  });

  it("doesn't change the panel until the changes are saved", async () => {
    const app = await bootWithSimpleLayout();
    const infoPanel = await startEditing(app);

    click(within(infoPanel).getByRole("button", { name: "Remove Performers" }));
    click(within(infoPanel).getByRole("button", { name: "Cancel" }));

    expect(shownLines(infoPanel)).toEqual(["", TITLE, PERFORMER, DATE]);
    expect(savedLayout()).toEqual(SIMPLE_LAYOUT);

    await app.unmount();
  });

  it("discards unsaved changes when the panel is closed", async () => {
    const app = await bootWithSimpleLayout();
    const editingPanel = await startEditing(app);
    click(within(editingPanel).getByRole("button", { name: "Remove Performers" }));
    const { useGlobalState } = await import("../../src/store/globalState");
    await act(async () => useGlobalState.getState().set("sceneInfoOpen", false));

    const infoPanel = await openPanel(app);
    expect(within(infoPanel).getByRole("button", { name: "Customise info panel" })).toBeInTheDocument();
    expect(shownLines(infoPanel)).toEqual(["", TITLE, PERFORMER, DATE]);

    await app.unmount();
  });

  it("carries on editing, with the unsaved changes, when the feed moves to the next video", async () => {
    const app = await bootWithSimpleLayout();
    const editingPanel = await startEditing(app);
    click(within(editingPanel).getByRole("button", { name: "Remove Performers" }));

    await goToNextSlide(app);

    const infoPanel = panel(app);
    expect(editorLines(infoPanel)).toEqual([["Studio"], ["Title"], ["Date"]]);
    save(infoPanel);
    await waitFor(() => expect(savedLayout()).toEqual([["studio"], ["title"], ["date"]]));

    await app.unmount();
  });

  it("keeps showing the fields' values in the pills when the feed moves to the next video", async () => {
    const app = await bootWithSimpleLayout();
    const editingPanel = await startEditing(app);
    click(within(editingPanel).getByRole("button", { name: "Field value" }));

    await goToNextSlide(app);

    const infoPanel = panel(app);
    expect(within(infoPanel).getByRole("button", { name: "Field value" })).toHaveAttribute("aria-pressed", "true");
    expect(editorLines(infoPanel)).not.toContainEqual(["Title"]);

    await app.unmount();
  });
});
