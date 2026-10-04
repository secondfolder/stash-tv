/**
 * The scene info panel's fields, and the options each can be shown with. (Marking an orgasm from the o-count, which
 * saves to Stash, is covered by the panel's integration tests.)
 *
 * @see docs/scene-info-panel.md § "Field options"
 * @see docs/scene-info-panel.md § "Fields"
 */

import { beforeEach, describe, expect, it } from "vitest";
import { within } from "@testing-library/react";
import { click, field, openFieldOptions, PERFORMER, save, saveFieldOptions, SIMPLE_LAYOUT } from "../../helpers/sceneInfo";
import { renderEditor, renderPanel, savedFieldOptions } from "../helpers/sceneInfo";
import { resetStores } from "../helpers/stores";

beforeEach(() => {
  resetStores();
});

/** The panel showing these fields, one per line */
const showing = (fields: string[]) => ({ layout: [["date"], ...fields.map((field) => [field])] });

describe("scene info panel", () => {
  describe("field options", () => {
    it("shows the rating as Stash's rating control by default, and as text when asked to", async () => {
      const { infoPanel } = renderPanel(showing(["rating"]));
      // Shown without a rating too, so one can be given
      expect(field(infoPanel, "rating")?.querySelector(".rating-stars")).toBeInTheDocument();

      click(within(infoPanel).getByRole("button", { name: "Customise info panel" }));
      const dialog = await openFieldOptions(infoPanel, "Rating");
      click(within(dialog).getByRole("button", { name: "Text" }));
      await saveFieldOptions(dialog);
      save(infoPanel);

      // The scene has no rating, which as text isn't shown
      expect(field(infoPanel, "rating")).not.toBeInTheDocument();
      expect(savedFieldOptions()).toEqual({ rating: { display: "text" } });
    });

    it("doesn't change a field's options until the panel's changes are saved", async () => {
      const { infoPanel } = renderEditor(showing(["resolution"]));
      const dialog = await openFieldOptions(infoPanel, "Resolution");
      click(within(dialog).getByRole("button", { name: /Width × height/ }));
      await saveFieldOptions(dialog);
      click(within(infoPanel).getByRole("button", { name: "Cancel" }));

      expect(field(infoPanel, "resolution")?.textContent).toBe("144p");
      expect(savedFieldOptions()).toEqual({});
    });

    it("shows the resolution's name unlabelled by default, or its dimensions labelled when asked to", async () => {
      const { infoPanel } = renderPanel(showing(["resolution"]));
      // The scene's video is 180×320
      expect(field(infoPanel, "resolution")?.textContent).toBe("144p");
      expect(within(field(infoPanel, "resolution")!).queryByRole("img")).not.toBeInTheDocument();

      click(within(infoPanel).getByRole("button", { name: "Customise info panel" }));
      const dialog = await openFieldOptions(infoPanel, "Resolution");
      click(within(dialog).getByRole("button", { name: /Width × height/ }));
      click(within(dialog).getByRole("button", { name: "Resolution" }));
      await saveFieldOptions(dialog);
      save(infoPanel);

      expect(field(infoPanel, "resolution")?.textContent).toBe("Resolution180×320");
      expect(savedFieldOptions()).toEqual({ resolution: { format: "dimensions", label: "text" } });
    });

    it("labels the performers with an icon by default, or their field's name, or not at all", async () => {
      const { infoPanel } = renderPanel({ layout: SIMPLE_LAYOUT });
      expect(within(field(infoPanel, "performers")!).getByRole("img", { name: "Performers" })).toBeInTheDocument();

      click(within(infoPanel).getByRole("button", { name: "Customise info panel" }));
      let dialog = await openFieldOptions(infoPanel, "Performers");
      click(within(dialog).getByRole("button", { name: "Performers" }));
      await saveFieldOptions(dialog);
      save(infoPanel);
      expect(field(infoPanel, "performers")?.textContent).toBe(`Performers${PERFORMER}`);

      click(within(infoPanel).getByRole("button", { name: "Customise info panel" }));
      dialog = await openFieldOptions(infoPanel, "Performers");
      click(within(dialog).getByRole("button", { name: "None" }));
      await saveFieldOptions(dialog);
      save(infoPanel);
      expect(field(infoPanel, "performers")?.textContent).toBe(PERFORMER);
      expect(within(field(infoPanel, "performers")!).queryByRole("img")).not.toBeInTheDocument();
    });

    it("shows the play count with an eye icon by default, even before the scene's been played", async () => {
      const { infoPanel } = renderPanel(showing(["play-count"]));
      // The scene hasn't been played
      expect(field(infoPanel, "play-count")?.textContent).toBe("0");
      expect(within(field(infoPanel, "play-count")!).getByRole("img", { name: "Play count" })).toBeInTheDocument();

      click(within(infoPanel).getByRole("button", { name: "Customise info panel" }));
      const dialog = await openFieldOptions(infoPanel, "Play count");
      click(within(dialog).getByRole("button", { name: "Play count" }));
      await saveFieldOptions(dialog);
      save(infoPanel);

      // Labelled with its name, it isn't shown until the scene's been played
      expect(field(infoPanel, "play-count")).not.toBeInTheDocument();
    });

    it("only offers to label the o-count when it's shown as text", async () => {
      const { infoPanel } = renderEditor(showing(["o-count"]));
      const dialog = await openFieldOptions(infoPanel, "O-count");
      expect(within(dialog).queryByRole("button", { name: "Icon" })).not.toBeInTheDocument();

      click(within(dialog).getByRole("button", { name: "Text" }));

      expect(within(dialog).getByRole("button", { name: "Icon" })).toHaveAttribute("aria-pressed", "true");
    });

    it("offers no options for fields that are only shown one way", () => {
      const { infoPanel } = renderEditor({ layout: SIMPLE_LAYOUT });

      expect(within(infoPanel).queryByRole("button", { name: "Title options" })).not.toBeInTheDocument();
    });

    it("goes back to the default options when reset", () => {
      const { infoPanel } = renderEditor({ fieldOptions: { resolution: { format: "dimensions" } } });

      click(within(infoPanel).getByRole("button", { name: "Reset to default" }));
      save(infoPanel);

      expect(savedFieldOptions()).toEqual({});
    });
  });

  /** @see docs/scene-info-panel.md § "Fields" */
  it("cuts the details short unless they're always to be shown in full", async () => {
    const { infoPanel } = renderPanel(showing(["details"]));
    expect(field(infoPanel, "details")).toHaveClass("capped");

    click(within(infoPanel).getByRole("button", { name: "Customise info panel" }));
    const dialog = await openFieldOptions(infoPanel, "Details");
    click(within(dialog).getByLabelText("Always show the full text"));
    await saveFieldOptions(dialog);
    save(infoPanel);

    expect(field(infoPanel, "details")).not.toHaveClass("capped");
  });

  /** @see docs/scene-info-panel.md § "Fields" */
  it("shows the frame rate as Stash does", () => {
    const { infoPanel } = renderPanel(showing(["frame-rate"]));

    expect(field(infoPanel, "frame-rate")?.textContent).toBe("24 fps");
  });
});
