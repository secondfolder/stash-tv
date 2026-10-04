/**
 * Spacers in the scene info panel: space between its lines, added and sized like its fields.
 *
 * @see docs/scene-info-panel.md § "Spacers"
 */

import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { bootWithTvConfig } from "./helpers/feed";
import { setupSceneInfoPanelTest, click, openPanel, startEditing, save, bootWithSimpleLayout, savedLayout, savedFieldOptions, field, saveFieldOptions, DATE } from "./helpers/scene-info-panel";

setupSceneInfoPanelTest();

describe("scene info panel", () => {
  /** @see docs/scene-info-panel.md § "Spacers" */
  describe("spacers", () => {
    function spacers(layout: unknown) {
      return ((layout ?? []) as unknown[][]).flat().filter(
        (entry): entry is { field: string, id: string, options?: { size: string } } => typeof entry === "object" && entry !== null,
      );
    }

    it("adds another spacer each time one's added, leaving it among the unused fields", async () => {
      const app = await bootWithSimpleLayout();
      const infoPanel = await startEditing(app);

      click(within(infoPanel).getByRole("button", { name: "Add Spacer" }));
      click(within(infoPanel).getByRole("button", { name: "Add Spacer" }));

      // Named after their size once added
      expect(within(infoPanel).getAllByRole("button", { name: "Remove Medium spacer" })).toHaveLength(2);
      expect(within(infoPanel).getByRole("button", { name: "Add Spacer" })).toBeInTheDocument();
      // Showing values, the added ones show theirs (their size), and the one to add only its name
      click(within(infoPanel).getByRole("button", { name: "Field value" }));
      expect(within(infoPanel).getByRole("button", { name: "Add Spacer" }).closest(".layout-item")).toHaveTextContent(/^Spacer$/);
      expect(infoPanel.querySelectorAll(".layout-lines .spacer-preview")).toHaveLength(2);
      save(infoPanel);
      await waitFor(() => expect(spacers(savedLayout())).toHaveLength(2));
      expect(new Set(spacers(savedLayout()).map(spacer => spacer.id))).toHaveProperty("size", 2);
      // Space between the lines, on lines of their own
      expect(infoPanel.querySelectorAll(".field-line .field-spacer")).toHaveLength(2);

      await app.unmount();
    });

    it("shows only the biggest of the spacers with nothing shown between them", async () => {
      const spacer = (id: string, size: string) => [{ field: "spacer", id, options: { size } }];
      // The fixture scene has no studio code or director, so nothing's shown between the first three spacers
      const app = await bootWithTvConfig((tvConfig) => tvConfig.set("sceneInfoLayout", [
        ["date"], spacer("1", "small"), ["code"], spacer("2", "big"), ["director"], spacer("3", "medium"),
        ["title"], spacer("4", "small"), ["performers"],
      ]), DATE);
      const infoPanel = await openPanel(app);

      const shownSpacers = [...infoPanel.querySelectorAll(".field-line:not(.collapsed-spacer) .field-spacer")];
      expect(shownSpacers.map(spacer => spacer.className)).toEqual([
        expect.stringContaining("spacer-big"),
        // Between the title and the performers, which show
        expect.stringContaining("spacer-small"),
      ]);

      await app.unmount();
    });

    it("doesn't show spacers with nothing shown before them, or after them", async () => {
      const spacer = (id: string, size: string) => [{ field: "spacer", id, options: { size } }];
      // The fixture scene has no studio code or director
      const app = await bootWithTvConfig((tvConfig) => tvConfig.set("sceneInfoLayout", [
        ["code"], spacer("1", "big"), ["date"], spacer("2", "small"), ["director"], spacer("3", "medium"),
      ]), DATE);
      const infoPanel = await openPanel(app);

      expect(infoPanel.querySelectorAll(".field-line:not(.collapsed-spacer) .field-spacer")).toHaveLength(0);

      await app.unmount();
    });

    it("keeps each spacer's size its own, in the layout", async () => {
      const app = await bootWithSimpleLayout();
      const infoPanel = await startEditing(app);
      click(within(infoPanel).getByRole("button", { name: "Add Spacer" }));
      click(within(infoPanel).getByRole("button", { name: "Add Spacer" }));
      click(within(infoPanel).getAllByRole("button", { name: "Medium spacer options" })[0]);
      const dialog = await screen.findByRole("dialog");
      click(within(dialog).getByRole("button", { name: "Big" }));
      await saveFieldOptions(dialog);

      expect(within(infoPanel).getByRole("button", { name: "Remove Big spacer" })).toBeInTheDocument();
      save(infoPanel);

      await waitFor(() => expect(spacers(savedLayout()).map(spacer => spacer.options?.size)).toEqual(["big", undefined]));
      expect(savedFieldOptions()).toEqual({});
      expect(field(infoPanel, "spacer")).toHaveClass("spacer-big");
      expect(infoPanel.querySelectorAll(".field-line .spacer-medium")).toHaveLength(1);

      await app.unmount();
    });
  });
});
