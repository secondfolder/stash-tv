/**
 * The o-counter and set organized action buttons. Each must change the right item on the server and show the change
 * on the slide.
 *
 * @see docs/action-buttons.md § "Button Props & Runtime Config Validation"
 * @see docs/media-loading.md § "Live item data"
 */

import { describe, expect, it } from "vitest";
import { waitFor, within } from "@testing-library/react";
import { bootApp } from "./helpers/harness";
import { currentSlide, displayedSideInfo, pinActionButtons, bootMarkersFeed, click, actionButton } from "./helpers/feed";
import { closeSidePanelByClickingOutside, sidePanel } from "../helpers/actionButtons";
import { setupSceneActionButtonsTest, firstScene, serverScene } from "./helpers/scene-action-buttons";

setupSceneActionButtonsTest();

describe("O-counter button", () => {
  it("adds an orgasm mark to the scene in one click", async () => {
    const app = await bootApp();
    await pinActionButtons(["o-counter"]);

    click(await actionButton(app, "Mark Orgasm"));

    await waitFor(() => expect(serverScene(firstScene.id).o_history).toHaveLength(1));
    await waitFor(() => expect(displayedSideInfo(app, "o-counter")).toBe("1"));

    await app.unmount();
  });

  it("shows the scene's o-count beside the button, but not when it's 0", async () => {
    serverScene(firstScene.id).o_history = ["2024-05-01T10:00:00Z", "2024-05-02T10:00:00Z"];
    const app = await bootApp();
    await pinActionButtons(["o-counter"]);

    expect(displayedSideInfo(app, "o-counter")).toBe("2");
    // An o-count from before the slide was shown doesn't count as marked now
    expect(await actionButton(app, "Mark Orgasm")).toBeInTheDocument();

    await app.unmount();
  });

  it("opens a panel for adjusting the count once marked, instead of adding another", async () => {
    const app = await bootApp();
    await pinActionButtons(["o-counter"]);
    click(await actionButton(app, "Mark Orgasm"));
    await waitFor(() => expect(displayedSideInfo(app, "o-counter")).toBe("1"));

    click(await actionButton(app, "Undo Orgasm Mark"));

    expect(within(sidePanel()).getByRole("button", { name: "Decrease O-count" })).toBeInTheDocument();
    expect(sidePanel()).toHaveTextContent("1");
    expect(serverScene(firstScene.id).o_history).toHaveLength(1);

    await app.unmount();
  });

  it("removes the latest orgasm mark from the panel", async () => {
    serverScene(firstScene.id).o_history = ["2024-05-01T10:00:00Z", "2024-05-02T10:00:00Z"];
    const app = await bootApp();
    await pinActionButtons(["o-counter"]);
    click(await actionButton(app, "Mark Orgasm"));
    await waitFor(() => expect(serverScene(firstScene.id).o_history).toHaveLength(3));
    const markAdded = serverScene(firstScene.id).o_history[2];

    click(await actionButton(app, "Undo Orgasm Mark"));
    click(within(sidePanel()).getByRole("button", { name: "Decrease O-count" }));

    await waitFor(() => expect(serverScene(firstScene.id).o_history).toHaveLength(2));
    expect(serverScene(firstScene.id).o_history).not.toContain(markAdded);
    await waitFor(() => expect(displayedSideInfo(app, "o-counter")).toBe("2"));

    await app.unmount();
  });

  it("adds another orgasm mark from the panel", async () => {
    const app = await bootApp();
    await pinActionButtons(["o-counter"]);
    click(await actionButton(app, "Mark Orgasm"));
    await waitFor(() => expect(displayedSideInfo(app, "o-counter")).toBe("1"));

    click(await actionButton(app, "Undo Orgasm Mark"));
    click(within(sidePanel()).getByRole("button", { name: "Increase O-count" }));

    await waitFor(() => expect(serverScene(firstScene.id).o_history).toHaveLength(2));
    await waitFor(() => expect(sidePanel()).toHaveTextContent("2"));

    await app.unmount();
  });

  it("can't decrease the count below 0", async () => {
    const app = await bootApp();
    await pinActionButtons(["o-counter"]);
    click(await actionButton(app, "Mark Orgasm"));
    await waitFor(() => expect(displayedSideInfo(app, "o-counter")).toBe("1"));
    click(await actionButton(app, "Undo Orgasm Mark"));
    // Keep the panel open while the count drops by adding a second mark first, so the button stays "marked"
    click(within(sidePanel()).getByRole("button", { name: "Increase O-count" }));
    await waitFor(() => expect(sidePanel()).toHaveTextContent("2"));

    click(within(sidePanel()).getByRole("button", { name: "Decrease O-count" }));
    await waitFor(() => expect(sidePanel()).toHaveTextContent("1"));
    click(within(sidePanel()).getByRole("button", { name: "Decrease O-count" }));
    await waitFor(() => expect(serverScene(firstScene.id).o_history).toHaveLength(0));

    expect(within(sidePanel()).getByRole("button", { name: "Decrease O-count" })).toBeDisabled();
    expect(displayedSideInfo(app, "o-counter")).toBeNull();

    await app.unmount();
  });

  it("goes back to adding a mark in one click once the count drops back below where it started", async () => {
    const app = await bootApp();
    await pinActionButtons(["o-counter"]);
    click(await actionButton(app, "Mark Orgasm"));
    await waitFor(() => expect(displayedSideInfo(app, "o-counter")).toBe("1"));
    click(await actionButton(app, "Undo Orgasm Mark"));
    click(within(sidePanel()).getByRole("button", { name: "Decrease O-count" }));
    await waitFor(() => expect(serverScene(firstScene.id).o_history).toHaveLength(0));
    await closeSidePanelByClickingOutside();

    click(await actionButton(app, "Mark Orgasm"));

    await waitFor(() => expect(serverScene(firstScene.id).o_history).toHaveLength(1));

    await app.unmount();
  });
});

describe("Set organized button", () => {
  it("marks the scene as organized", async () => {
    const app = await bootApp();
    await pinActionButtons(["set-organized"]);

    click(await actionButton(app, "Mark as organized"));

    await waitFor(() => expect(serverScene(firstScene.id).organized).toBe(true));
    expect(await actionButton(app, "Mark as unorganized")).toBeInTheDocument();

    await app.unmount();
  });

  it("marks an organized scene as unorganized", async () => {
    serverScene(firstScene.id).organized = true;
    const app = await bootApp();
    await pinActionButtons(["set-organized"]);

    click(await actionButton(app, "Mark as unorganized"));

    await waitFor(() => expect(serverScene(firstScene.id).organized).toBe(false));
    expect(await actionButton(app, "Mark as organized")).toBeInTheDocument();

    await app.unmount();
  });

  it("isn't shown on marker slides", async () => {
    const app = await bootMarkersFeed();
    await pinActionButtons(["set-organized", "rate-scene"]);
    // Wait for the stack to render the other button so the absence isn't vacuous
    await actionButton(app, "Rate scene");

    expect(within(currentSlide(app)).queryByRole("button", { name: /organized/ })).not.toBeInTheDocument();

    await app.unmount();
  });
});
