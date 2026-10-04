/**
 * The scene info panel in the feed: its editor carrying on as the feed moves to the next video, and its o-count
 * marking an orgasm on the server. The rest of the panel (its layout editor, fields and their options, spacers) is unit
 * tested, in test/unit/components/sceneInfoPanel.test.tsx and sceneInfoFields.test.tsx. Dragging needs layout, so it's
 * covered by the e2e tests.
 *
 * @see docs/scene-info-panel.md
 */

import { describe, expect, it } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import { setupIntegrationTest, savedTvConfig, serverOCount, type BootedApp } from "./helpers/harness";
import { bootWithTvConfig, currentSlide, goToNextSlide, sceneIdOf } from "./helpers/feed";
import { click, clickEdit, DATE, editorLines, save, SIMPLE_LAYOUT } from "../helpers/sceneInfo";
import type { useTvConfig } from "../../src/store/tvConfig";

const integration = setupIntegrationTest();

/** Boot with the panel showing these lines. (Booting waits for the date: a customised panel may hide the title.) */
function bootWithLayout(layout: ReturnType<typeof useTvConfig.getState>["sceneInfoLayout"]) {
  return bootWithTvConfig((tvConfig) => tvConfig.set("sceneInfoLayout", layout), DATE);
}

/** The current slide's info panel, opened */
async function openPanel(app: BootedApp) {
  const { useGlobalState } = await import("../../src/store/globalState");
  await act(async () => useGlobalState.getState().set("sceneInfoOpen", true));
  return panel(app);
}

function panel(app: BootedApp) {
  return within(currentSlide(app)).getByTestId("MediaSlide--sceneInfo");
}

async function startEditing(app: BootedApp) {
  const infoPanel = await openPanel(app);
  clickEdit(infoPanel);
  return infoPanel;
}

describe("scene info panel", () => {
  it("carries on editing, with the unsaved changes, when the feed moves to the next video", async () => {
    const app = await bootWithLayout(SIMPLE_LAYOUT);
    const editingPanel = await startEditing(app);
    click(within(editingPanel).getByRole("button", { name: "Remove Performers" }));

    await goToNextSlide(app);

    const infoPanel = panel(app);
    expect(editorLines(infoPanel)).toEqual([["Studio"], ["Title"], ["Date"]]);
    save(infoPanel);
    await waitFor(() => expect(savedTvConfig(integration).sceneInfoLayout).toEqual([["studio"], ["title"], ["date"]]));

    await app.unmount();
  });

  it("keeps showing the fields' values in the pills when the feed moves to the next video", async () => {
    const app = await bootWithLayout(SIMPLE_LAYOUT);
    const editingPanel = await startEditing(app);
    click(within(editingPanel).getByRole("button", { name: "Field value" }));

    await goToNextSlide(app);

    const infoPanel = panel(app);
    expect(within(infoPanel).getByRole("button", { name: "Field value" })).toHaveAttribute("aria-pressed", "true");
    expect(editorLines(infoPanel)).not.toContainEqual(["Title"]);

    await app.unmount();
  });

  /** @see docs/scene-info-panel.md § "Fields" */
  it("marks an orgasm when the o-count is clicked, and shows its controls when clicked again", async () => {
    const app = await bootWithLayout([["date"], ["o-count"]]);
    const infoPanel = await openPanel(app);
    const sceneId = sceneIdOf(currentSlide(app));
    // Shown when the o-count is 0 too, so an orgasm can be marked
    const button = within(infoPanel).getByRole("button", { name: "Mark Orgasm" });
    expect(button).toHaveTextContent("0");

    click(button);
    await waitFor(() => expect(serverOCount(integration, sceneId)).toBe(1));
    const marked = await within(infoPanel).findByRole("button", { name: "Change O-count" });
    expect(marked).toHaveTextContent("1");
    expect(marked).toHaveClass("state-active");

    click(marked);
    click(await screen.findByRole("button", { name: "Increase O-count" }));
    await waitFor(() => expect(serverOCount(integration, sceneId)).toBe(2));

    await app.unmount();
  });
});
