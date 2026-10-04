/**
 * The rate scene and delete action buttons. Each must change the right item on the server and show the change on the
 * slide.
 *
 * @see docs/action-buttons.md § "Button Props & Runtime Config Validation"
 * @see docs/media-loading.md § "Live item data"
 */

import { describe, expect, it } from "vitest";
import { waitFor, within } from "@testing-library/react";
import { bootApp } from "./helpers/harness";
import { currentSlide, displayedSideInfo, pinActionButtons, sceneIdOf, slides, bootMarkersFeed, click, actionButton } from "./helpers/feed";
import { actionButtonRoot, displayedIconState, sidePanel } from "../helpers/actionButtons";
import { setupSceneActionButtonsTest, firstScene, firstMarker, serverScene } from "./helpers/scene-action-buttons";

const integration = setupSceneActionButtonsTest();

describe("Rate scene button", () => {
  /** The star buttons in the open rating panel, in order. */
  function stars() {
    const ratingStars = sidePanel().querySelector<HTMLElement>(".rating-stars");
    if (!ratingStars) throw new Error("Rating stars not shown");
    return within(ratingStars).getAllByRole("button");
  }

  async function displayedRatingState(button: HTMLElement) {
    // Imported after boot: see docs/testing.md § "Gotchas" (importing app code at the top of an integration test)
    const { buttonDefinition } = await import("../../src/components/action-buttons/buttons/RateSceneActionButton");
    return await displayedIconState(actionButtonRoot(button), buttonDefinition.icon);
  }

  it("rates the scene with the chosen number of stars", async () => {
    const app = await bootApp();
    await pinActionButtons(["rate-scene"]);
    const rateButton = await actionButton(app, "Rate scene");
    expect(await displayedRatingState(rateButton)).toBe("inactive");
    expect(displayedSideInfo(app, "rate-scene")).toBeNull();

    click(rateButton);
    click(stars()[3]);

    await waitFor(() => expect(serverScene(firstScene.id).rating100).toBe(80));
    await waitFor(() => expect(displayedSideInfo(app, "rate-scene")).toBe("4"));
    expect(await displayedRatingState(await actionButton(app, "Rate scene"))).toBe("active");

    await app.unmount();
  });

  it("clears the rating when the current star rating is chosen again", async () => {
    serverScene(firstScene.id).rating100 = 60;
    const app = await bootApp();
    await pinActionButtons(["rate-scene"]);

    click(await actionButton(app, "Rate scene"));
    click(stars()[2]);

    await waitFor(() => expect(serverScene(firstScene.id).rating100).toBeNull());
    await waitFor(() => expect(displayedSideInfo(app, "rate-scene")).toBeNull());

    await app.unmount();
  });

  it("shows a star rating out of 5, with a half star as .5", async () => {
    serverScene(firstScene.id).rating100 = 70;
    const app = await bootApp();
    await pinActionButtons(["rate-scene"]);

    expect(displayedSideInfo(app, "rate-scene")).toBe("3.5");

    await app.unmount();
  });

  it("shows a decimal rating out of 10 when Stash uses decimal ratings", async () => {
    integration.server.store.uiConfig = { ratingSystemOptions: { type: "decimal", starPrecision: "full" } };
    serverScene(firstScene.id).rating100 = 75;
    const app = await bootApp();
    await pinActionButtons(["rate-scene"]);

    expect(displayedSideInfo(app, "rate-scene")).toBe("7.5");

    await app.unmount();
  });

  it("focuses the rating input when opened with decimal ratings", async () => {
    integration.server.store.uiConfig = { ratingSystemOptions: { type: "decimal", starPrecision: "full" } };
    const app = await bootApp();
    await pinActionButtons(["rate-scene"]);

    click(await actionButton(app, "Rate scene"));

    await waitFor(() => expect(within(sidePanel()).getByRole("spinbutton")).toHaveFocus());

    await app.unmount();
  });

  it("rates a marker's scene", async () => {
    const app = await bootMarkersFeed();
    await pinActionButtons(["rate-scene"]);

    click(await actionButton(app, "Rate scene"));
    click(stars()[4]);

    await waitFor(() => expect(serverScene(firstMarker.sceneId).rating100).toBe(100));

    await app.unmount();
  });
});

describe("Delete button", () => {
  function confirmationDialog() {
    const dialog = document.querySelector<HTMLElement>(".ModalComponent");
    if (!dialog) throw new Error("Delete confirmation not shown");
    return dialog;
  }

  it("deletes the scene once confirmed and moves on to the next item", async () => {
    const app = await bootApp();
    await pinActionButtons(["delete-media-item"]);

    click(await actionButton(app, "Delete scene/marker"));
    click(await waitFor(() => within(confirmationDialog()).getByRole("button", { name: "Delete" })));

    await waitFor(() => expect(integration.server.store.scenes.has(firstScene.id)).toBe(false));
    await waitFor(() => expect(slides(app).map(sceneIdOf)).not.toContain(firstScene.id));

    await app.unmount();
  });

  it("deletes nothing when cancelled", async () => {
    const app = await bootApp();
    await pinActionButtons(["delete-media-item"]);

    click(await actionButton(app, "Delete scene/marker"));
    click(await waitFor(() => within(confirmationDialog()).getByRole("button", { name: "Cancel" })));

    await waitFor(() => expect(document.querySelector(".ModalComponent")).toBeNull());
    expect(integration.server.store.scenes.has(firstScene.id)).toBe(true);
    expect(sceneIdOf(currentSlide(app))).toBe(firstScene.id);

    await app.unmount();
  });

  it("deletes the marker, not its scene, on a marker slide", async () => {
    const app = await bootMarkersFeed();
    await pinActionButtons(["delete-media-item"]);

    click(await actionButton(app, "Delete scene/marker"));
    click(await waitFor(() => within(confirmationDialog()).getByRole("button", { name: "Delete" })));

    await waitFor(() => expect(integration.server.store.markers.has(firstMarker.id)).toBe(false));
    expect(integration.server.store.scenes.has(firstMarker.sceneId)).toBe(true);

    await app.unmount();
  });
});
