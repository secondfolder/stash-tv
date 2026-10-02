/**
 * The scene info panel. Its edit button turns its fields into pills, to drag into place, remove, or add from the
 * fields it isn't showing (listed below the pills). The layout persists in tvConfig. Dragging needs layout, so it's covered by the e2e tests.
 *
 * @see docs/scene-info-panel.md
 */

import { describe, expect, it } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { setupIntegrationTest, bootApp, savedTvConfig, type BootedApp } from "./helpers/harness";
import { bootWithTvConfig, currentSlide, goToNextSlide, sceneIdOf } from "./helpers/feed";
// From the module of its own, not the panel's config: that imports the fields, and with them the Stash API client,
// which connects as it's imported, before the mock Stash server is set up
import { defaultSceneInfoLayout } from "../../src/components/slide/SceneInfo/default-layout";

const integration = setupIntegrationTest();

// The first slide's scene (fixture scene-7, the newest), which has no studio
const TITLE = "Grotto Glow";
const PERFORMER = "Bob Bold";
// As Stash shows it on the scene's page (the fixture's date is 2025-02-14)
const DATE = "14 February 2025";
const TAG = "Beta";
// Booting waits for the first scene's title by default, which a customised panel may hide, so tests that customise it
// wait for the date instead

// fireEvent rather than userEvent: see docs/testing.md § "Gotchas" (userEvent.click breaks with a MediaSlide mounted)
function click(element: HTMLElement) {
  fireEvent.click(element);
}

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
  click(within(infoPanel).getByRole("button", { name: "Customise info panel" }));
  return infoPanel;
}

function save(infoPanel: HTMLElement) {
  click(within(infoPanel).getByRole("button", { name: "Save" }));
}

/** The panel's lines, as the text of each */
function shownLines(infoPanel: HTMLElement) {
  return [...infoPanel.querySelectorAll<HTMLElement>(".field-line")].map((line) => line.textContent);
}

/** The editor's lines, as the text of each pill on them (each line's items have its index in `data-line`) */
function editorLines(infoPanel: HTMLElement) {
  const lines: (string | null)[][] = [];
  for (const item of infoPanel.querySelectorAll<HTMLElement>(".layout-lines [data-line]")) {
    const line = lines[Number(item.dataset.line)] ??= [];
    if (item.classList.contains("field-pill")) line.push(item.textContent);
  }
  return lines;
}

/** A layout of the fields the tests use, each on its own line, to edit (the default has many more) */
const SIMPLE_LAYOUT = [["studio"], ["title"], ["performers"], ["date"]];

function bootWithSimpleLayout() {
  return bootWithTvConfig((tvConfig) => tvConfig.set("sceneInfoLayout", SIMPLE_LAYOUT), DATE);
}

/** The panel's lines, as the fields shown on each */
function shownFields(infoPanel: HTMLElement) {
  return [...infoPanel.querySelectorAll<HTMLElement>(".field-line")].map(line => (
    [...line.querySelectorAll<HTMLElement>(".line-fields > .field")].map(field => (
      [...field.classList].find(name => name.startsWith("field-"))?.replace(/^field-/, "")
    ))
  ));
}

function savedLayout() {
  return savedTvConfig(integration).sceneInfoLayout;
}

function savedFieldOptions() {
  return savedTvConfig(integration).sceneInfoFieldOptions;
}

/** The panel showing these fields, one per line */
function bootShowingFields(fields: string[]) {
  return bootWithTvConfig((tvConfig) => tvConfig.set("sceneInfoLayout", [["date"], ...fields.map(field => [field])]), DATE);
}

function field(infoPanel: HTMLElement, id: string) {
  return infoPanel.querySelector<HTMLElement>(`.field-line .field-${id}`);
}

/** Opens a field's options dialog from its pill, returning the dialog */
async function openFieldOptions(infoPanel: HTMLElement, fieldName: string) {
  click(within(infoPanel).getByRole("button", { name: `${fieldName} options` }));
  return await screen.findByRole("dialog");
}

/** Saves a field's options dialog, waiting for it to close (its form submits asynchronously) */
async function saveFieldOptions(dialog: HTMLElement) {
  click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
}

function serverOCount(sceneId: string) {
  return integration.server.store.scenes.get(sceneId)?.o_history.length;
}

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
      expect(within(infoPanel).getByRole("button", { name: "Add Spacer" })).toHaveTextContent(/^Spacer$/);
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
