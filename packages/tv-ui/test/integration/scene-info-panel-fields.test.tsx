/**
 * The scene info panel's fields, and the options each can be shown with.
 *
 * @see docs/scene-info-panel.md § "Field options"
 */

import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { bootWithTvConfig, currentSlide, sceneIdOf } from "./helpers/feed";
import { setupSceneInfoPanelTest, click, openPanel, startEditing, save, bootWithSimpleLayout, savedFieldOptions, bootShowingFields, field, openFieldOptions, saveFieldOptions, serverOCount, PERFORMER } from "./helpers/scene-info-panel";

setupSceneInfoPanelTest();

describe("scene info panel", () => {
  /** @see docs/scene-info-panel.md § "Field options" */
  describe("field options", () => {
    it("shows the rating as Stash's rating control by default, and as text when asked to", async () => {
      const app = await bootShowingFields(["rating"]);
      let infoPanel = await openPanel(app);
      // Shown without a rating too, so one can be given
      expect(field(infoPanel, "rating")?.querySelector(".rating-stars")).toBeInTheDocument();

      infoPanel = await startEditing(app);
      const dialog = await openFieldOptions(infoPanel, "Rating");
      click(within(dialog).getByRole("button", { name: "Text" }));
      await saveFieldOptions(dialog);
      save(infoPanel);

      // The fixture scene has no rating, which as text isn't shown
      await waitFor(() => expect(field(infoPanel, "rating")).not.toBeInTheDocument());
      await waitFor(() => expect(savedFieldOptions()).toEqual({ rating: { display: "text" } }));

      await app.unmount();
    });

    it("doesn't change a field's options until the panel's changes are saved", async () => {
      const app = await bootShowingFields(["resolution"]);
      const infoPanel = await startEditing(app);
      const dialog = await openFieldOptions(infoPanel, "Resolution");
      click(within(dialog).getByRole("button", { name: /Width × height/ }));
      await saveFieldOptions(dialog);
      click(within(infoPanel).getByRole("button", { name: "Cancel" }));

      expect(field(infoPanel, "resolution")?.textContent).toBe("144p");
      // Saved with the rest of the config when it was set up, as the defaults
      expect(savedFieldOptions()).toEqual({});

      await app.unmount();
    });

    it("shows the resolution's name unlabelled by default, or its dimensions labelled when asked to", async () => {
      const app = await bootShowingFields(["resolution"]);
      let infoPanel = await openPanel(app);
      // The fixture scene's video is 180×320
      expect(field(infoPanel, "resolution")?.textContent).toBe("144p");
      expect(within(field(infoPanel, "resolution")!).queryByRole("img")).not.toBeInTheDocument();

      infoPanel = await startEditing(app);
      const dialog = await openFieldOptions(infoPanel, "Resolution");
      click(within(dialog).getByRole("button", { name: /Width × height/ }));
      click(within(dialog).getByRole("button", { name: "Resolution" }));
      await saveFieldOptions(dialog);
      save(infoPanel);

      expect(field(infoPanel, "resolution")?.textContent).toBe("Resolution180×320");
      await waitFor(() => expect(savedFieldOptions()).toEqual({ resolution: { format: "dimensions", label: "text" } }));

      await app.unmount();
    });

    it("labels the performers with an icon by default, or their field's name, or not at all", async () => {
      const app = await bootWithSimpleLayout();
      let infoPanel = await openPanel(app);
      expect(within(field(infoPanel, "performers")!).getByRole("img", { name: "Performers" })).toBeInTheDocument();

      infoPanel = await startEditing(app);
      let dialog = await openFieldOptions(infoPanel, "Performers");
      click(within(dialog).getByRole("button", { name: "Performers" }));
      await saveFieldOptions(dialog);
      save(infoPanel);
      expect(field(infoPanel, "performers")?.textContent).toBe(`Performers${PERFORMER}`);

      infoPanel = await startEditing(app);
      dialog = await openFieldOptions(infoPanel, "Performers");
      click(within(dialog).getByRole("button", { name: "None" }));
      await saveFieldOptions(dialog);
      save(infoPanel);
      expect(field(infoPanel, "performers")?.textContent).toBe(PERFORMER);
      expect(within(field(infoPanel, "performers")!).queryByRole("img")).not.toBeInTheDocument();

      await app.unmount();
    });

    it("shows the play count with an eye icon by default, even before the scene's been played", async () => {
      const app = await bootShowingFields(["play-count"]);
      let infoPanel = await openPanel(app);
      // The fixture scene hasn't been played
      expect(field(infoPanel, "play-count")?.textContent).toBe("0");
      expect(within(field(infoPanel, "play-count")!).getByRole("img", { name: "Play count" })).toBeInTheDocument();

      infoPanel = await startEditing(app);
      const dialog = await openFieldOptions(infoPanel, "Play count");
      click(within(dialog).getByRole("button", { name: "Play count" }));
      await saveFieldOptions(dialog);
      save(infoPanel);

      // Labelled with its name, it isn't shown until the scene's been played
      expect(field(infoPanel, "play-count")).not.toBeInTheDocument();

      await app.unmount();
    });

    it("only offers to label the o-count when it's shown as text", async () => {
      const app = await bootShowingFields(["o-count"]);
      const infoPanel = await startEditing(app);
      const dialog = await openFieldOptions(infoPanel, "O-count");
      expect(within(dialog).queryByRole("button", { name: "Icon" })).not.toBeInTheDocument();

      click(within(dialog).getByRole("button", { name: "Text" }));

      expect(within(dialog).getByRole("button", { name: "Icon" })).toHaveAttribute("aria-pressed", "true");

      await app.unmount();
    });

    it("offers no options for fields that are only shown one way", async () => {
      const app = await bootWithSimpleLayout();
      const infoPanel = await startEditing(app);

      expect(within(infoPanel).queryByRole("button", { name: "Title options" })).not.toBeInTheDocument();

      await app.unmount();
    });

    it("goes back to the default options when reset", async () => {
      const app = await bootWithTvConfig((tvConfig) => {
        tvConfig.set("sceneInfoFieldOptions", { resolution: { format: "dimensions" } });
      });
      const infoPanel = await startEditing(app);

      click(within(infoPanel).getByRole("button", { name: "Reset to default" }));
      save(infoPanel);

      await waitFor(() => expect(savedFieldOptions()).toEqual({}));

      await app.unmount();
    });
  });

  /** @see docs/scene-info-panel.md § "Fields" */
  it("marks an orgasm when the o-count is clicked, and shows its controls when clicked again", async () => {
    const app = await bootShowingFields(["o-count"]);
    const infoPanel = await openPanel(app);
    const sceneId = sceneIdOf(currentSlide(app));
    // Shown when the o-count is 0 too, so an orgasm can be marked
    const button = within(infoPanel).getByRole("button", { name: "Mark Orgasm" });
    expect(button).toHaveTextContent("0");

    click(button);
    await waitFor(() => expect(serverOCount(sceneId)).toBe(1));
    const marked = await within(infoPanel).findByRole("button", { name: "Change O-count" });
    expect(marked).toHaveTextContent("1");
    expect(marked).toHaveClass("state-active");

    click(marked);
    click(await screen.findByRole("button", { name: "Increase O-count" }));
    await waitFor(() => expect(serverOCount(sceneId)).toBe(2));

    await app.unmount();
  });

  /** @see docs/scene-info-panel.md § "Fields" */
  it("cuts the details short unless they're always to be shown in full", async () => {
    const app = await bootShowingFields(["details"]);
    let infoPanel = await openPanel(app);
    expect(field(infoPanel, "details")).toHaveClass("capped");

    infoPanel = await startEditing(app);
    const dialog = await openFieldOptions(infoPanel, "Details");
    click(within(dialog).getByLabelText("Always show the full text"));
    await saveFieldOptions(dialog);
    save(infoPanel);

    expect(field(infoPanel, "details")).not.toHaveClass("capped");

    await app.unmount();
  });

  /** @see docs/scene-info-panel.md § "Fields" */
  it("shows the frame rate as Stash does", async () => {
    const app = await bootShowingFields(["frame-rate"]);
    const infoPanel = await openPanel(app);

    expect(field(infoPanel, "frame-rate")?.textContent).toBe("24 fps");

    await app.unmount();
  });
});
