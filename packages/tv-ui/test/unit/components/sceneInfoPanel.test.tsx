/**
 * The scene info panel. Its edit button turns its fields into pills, to drag into place, remove, or add from the
 * fields it isn't showing (listed below the pills). The layout persists in tvConfig. Dragging needs layout, so it's
 * covered by the e2e tests, and the panel as the feed moves on by the integration tests.
 *
 * @see docs/scene-info-panel.md
 */

import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
// From the module of its own, not the panel's config: that imports the fields, and with them Stash's API client
import { defaultSceneInfoLayout } from "../../../src/components/slide/SceneInfo/default-layout";
import {
  click,
  DATE,
  editorLines,
  field,
  PERFORMER,
  save,
  saveFieldOptions,
  shownFields,
  shownLines,
  SIMPLE_LAYOUT,
  TAG,
  TITLE,
} from "../../helpers/sceneInfo";
import { renderEditor, renderPanel, savedFieldOptions, savedLayout } from "../helpers/sceneInfo";
import { resetStores } from "../helpers/stores";

beforeEach(() => {
  resetStores();
});

describe("scene info panel", () => {
  it("shows the default fields until it's customised", () => {
    const { infoPanel } = renderPanel();

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
  });

  it("shows fields that share a line on the same line", () => {
    const { infoPanel } = renderPanel({ layout: [["date", "performers"], ["title"]] });

    expect(shownLines(infoPanel)).toEqual([`${DATE}${PERFORMER}`, TITLE]);
  });

  it("shows each field as a pill named after it, on the same lines as the panel", () => {
    const { infoPanel } = renderEditor({ layout: [["date", "performers"], ["title"]] });

    expect(editorLines(infoPanel)).toEqual([["Date", "Performers"], ["Title"]]);
  });

  it("shows the scene's values in the pills when asked to, and names again when asked again", () => {
    const { infoPanel } = renderEditor({ layout: SIMPLE_LAYOUT });
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
  });

  it("stops showing a field the user removes", () => {
    const { infoPanel } = renderEditor({ layout: SIMPLE_LAYOUT });

    click(within(infoPanel).getByRole("button", { name: "Remove Performers" }));
    save(infoPanel);

    expect(infoPanel).not.toHaveTextContent(PERFORMER);
    expect(infoPanel).toHaveTextContent(TITLE);
    expect(savedLayout()).toEqual([["studio"], ["title"], ["date"]]);
  });

  it("adds an unused field the user taps to a new line at the bottom", () => {
    const { infoPanel } = renderEditor({ layout: SIMPLE_LAYOUT });

    // Only the fields not in the panel are offered
    expect(within(infoPanel).queryByRole("button", { name: "Add Title" })).not.toBeInTheDocument();
    click(within(infoPanel).getByRole("button", { name: "Add Tags" }));
    save(infoPanel);

    expect(shownLines(infoPanel).at(-1)).toBe(TAG);
    expect(savedLayout()).toEqual([["studio"], ["title"], ["performers"], ["date"], ["tags"]]);
  });

  it("goes back to the default fields when reset", () => {
    const { infoPanel } = renderEditor({ layout: [["date"]] });

    click(within(infoPanel).getByRole("button", { name: "Reset to default" }));
    // As in the settings, it's only offered when the layout isn't the default
    expect(within(infoPanel).queryByRole("button", { name: "Reset to default" })).not.toBeInTheDocument();
    save(infoPanel);

    expect(infoPanel).toHaveTextContent(TITLE);
    expect(savedLayout()).toEqual(defaultSceneInfoLayout);
  });

  it("doesn't change the panel until the changes are saved", () => {
    const { infoPanel } = renderEditor({ layout: SIMPLE_LAYOUT });

    click(within(infoPanel).getByRole("button", { name: "Remove Performers" }));
    click(within(infoPanel).getByRole("button", { name: "Cancel" }));

    expect(shownLines(infoPanel)).toEqual(["", TITLE, PERFORMER, DATE]);
    expect(savedLayout()).toEqual(SIMPLE_LAYOUT);
  });

  it("discards unsaved changes when the panel is closed", () => {
    const { infoPanel, setOpen } = renderEditor({ layout: SIMPLE_LAYOUT });
    click(within(infoPanel).getByRole("button", { name: "Remove Performers" }));

    setOpen(false);
    setOpen(true);

    expect(within(infoPanel).getByRole("button", { name: "Customise info panel" })).toBeInTheDocument();
    expect(shownLines(infoPanel)).toEqual(["", TITLE, PERFORMER, DATE]);
  });

  /** @see docs/scene-info-panel.md § "Spacers" */
  describe("spacers", () => {
    function spacers(layout: unknown) {
      return ((layout ?? []) as unknown[][]).flat().filter(
        (entry): entry is { field: string, id: string, options?: { size: string } } => typeof entry === "object" && entry !== null,
      );
    }

    it("adds another spacer each time one's added, leaving it among the unused fields", () => {
      const { infoPanel } = renderEditor({ layout: SIMPLE_LAYOUT });

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
      expect(spacers(savedLayout())).toHaveLength(2);
      expect(new Set(spacers(savedLayout()).map(spacer => spacer.id))).toHaveProperty("size", 2);
      // Space between the lines, on lines of their own
      expect(infoPanel.querySelectorAll(".field-line .field-spacer")).toHaveLength(2);
    });

    it("shows only the biggest of the spacers with nothing shown between them", () => {
      const spacer = (id: string, size: string) => [{ field: "spacer", id, options: { size } }];
      // The scene has no studio code or director, so nothing's shown between the first three spacers
      const { infoPanel } = renderPanel({ layout: [
        ["date"], spacer("1", "small"), ["code"], spacer("2", "big"), ["director"], spacer("3", "medium"),
        ["title"], spacer("4", "small"), ["performers"],
      ] });

      const shownSpacers = [...infoPanel.querySelectorAll(".field-line:not(.collapsed-spacer) .field-spacer")];
      expect(shownSpacers.map(spacer => spacer.className)).toEqual([
        expect.stringContaining("spacer-big"),
        // Between the title and the performers, which show
        expect.stringContaining("spacer-small"),
      ]);
    });

    it("doesn't show spacers with nothing shown before them, or after them", () => {
      const spacer = (id: string, size: string) => [{ field: "spacer", id, options: { size } }];
      // The scene has no studio code or director
      const { infoPanel } = renderPanel({ layout: [
        ["code"], spacer("1", "big"), ["date"], spacer("2", "small"), ["director"], spacer("3", "medium"),
      ] });

      expect(infoPanel.querySelectorAll(".field-line:not(.collapsed-spacer) .field-spacer")).toHaveLength(0);
    });

    it("keeps each spacer's size its own, in the layout", async () => {
      const { infoPanel } = renderEditor({ layout: SIMPLE_LAYOUT });
      click(within(infoPanel).getByRole("button", { name: "Add Spacer" }));
      click(within(infoPanel).getByRole("button", { name: "Add Spacer" }));
      click(within(infoPanel).getAllByRole("button", { name: "Medium spacer options" })[0]);
      const dialog = await screen.findByRole("dialog");
      click(within(dialog).getByRole("button", { name: "Big" }));
      await saveFieldOptions(dialog);

      expect(within(infoPanel).getByRole("button", { name: "Remove Big spacer" })).toBeInTheDocument();
      save(infoPanel);

      expect(spacers(savedLayout()).map(spacer => spacer.options?.size)).toEqual(["big", undefined]);
      expect(savedFieldOptions()).toEqual({});
      expect(field(infoPanel, "spacer")).toHaveClass("spacer-big");
      expect(infoPanel.querySelectorAll(".field-line .spacer-medium")).toHaveLength(1);
    });
  });
});
