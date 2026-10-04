/**
 * The action button stack as a whole: folders, and buttons whose type this build doesn't know. Buttons that need
 * Stash's data (e.g. quick tags, rating) are tested in its integration tests.
 *
 * @see docs/action-buttons.md § "Rendering (`ActionButtonStack`)"
 * @see docs/action-buttons.md § "`ActionButtonBase`"
 */

import { beforeEach, describe, expect, it } from "vitest";
import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionButtonStack, type ActionButtonStackConfig } from "../../../src/components/action-buttons/ActionButtonStack";
import { getActionButtonDefinition } from "../../../src/components/action-buttons/buttons";
import { MediaItemStateContextProvider } from "../../../src/store/mediaItemState";
import { useTvConfig } from "../../../src/store/tvConfig";
import { displayedIconState } from "../../helpers/actionButtons";
import { sceneMediaItem } from "../helpers/mediaItems";
import { resetStores } from "../helpers/stores";

beforeEach(() => {
  resetStores();
});

/** Render the stack for a scene, with the given buttons */
function renderStack(config: ActionButtonStackConfig[]) {
  useTvConfig.getState().set("actionButtonStackConfig", config);
  return render(
    <MediaItemStateContextProvider>
      <ActionButtonStack
        mediaItem={sceneMediaItem()}
        sceneInfoOpen={false}
        setSceneInfoOpen={() => {}}
        playerRef={{ current: null }}
      />
    </MediaItemStateContextProvider>
  );
}

describe("Action button folders", () => {
  const twoFolders: ActionButtonStackConfig[] = [
    { id: "a", type: "folder", pinned: false, contents: [
      { id: "a.1", type: "button", buttonType: "loop", pinned: false },
      { id: "a.2", type: "button", buttonType: "letterboxing", pinned: false },
    ] },
    { id: "b", type: "folder", pinned: false, contents: [
      { id: "b.1", type: "button", buttonType: "force-landscape", pinned: false },
    ] },
  ];

  function folderButtons() {
    return screen.getAllByRole("button", { name: /folder$/ });
  }

  /** Buttons of an open folder. Its popover is portalled to the document body. */
  function openFolderButtonNames() {
    const popover = document.querySelector<HTMLElement>(".folder-contents-popover");
    return popover ? within(popover).getAllByRole("button").map((button) => button.textContent) : [];
  }

  it("shows a folder's buttons only once it's opened", async () => {
    renderStack(twoFolders);
    expect(openFolderButtonNames()).toEqual([]);

    await userEvent.click(folderButtons()[0]);

    await waitFor(() => expect(openFolderButtonNames()).toEqual(["Loop scene", "Fill screen"]));
  });

  it("hides a folder's buttons when it's closed again", async () => {
    renderStack(twoFolders);
    await userEvent.click(folderButtons()[0]);
    await waitFor(() => expect(openFolderButtonNames()).not.toEqual([]));

    await userEvent.click(screen.getByRole("button", { name: "Close folder" }));

    await waitFor(() => expect(openFolderButtonNames()).toEqual([]));
  });

  it("closes the open folder when another one is opened", async () => {
    renderStack(twoFolders);
    await userEvent.click(folderButtons()[0]);
    await waitFor(() => expect(openFolderButtonNames()).toEqual(["Loop scene", "Fill screen"]));

    await userEvent.click(folderButtons()[1]);

    await waitFor(() => expect(openFolderButtonNames()).toEqual(["Portrait"]));
  });

  // Which 4 is down to CSS, so it's covered by test/e2e/action-button-stack.test.ts

  it("previews a button's current state", async () => {
    renderStack([
      { id: "a", type: "folder", pinned: false, contents: [{ id: "a.1", type: "button", buttonType: "loop", pinned: false }] },
    ]);
    const folder = screen.getByRole("button", { name: "Open folder" });

    act(() => useTvConfig.getState().set("looping", true));
    expect(await displayedIconState(folder, getActionButtonDefinition("loop").icon)).toBe("active");

    act(() => useTvConfig.getState().set("looping", false));
    expect(await displayedIconState(folder, getActionButtonDefinition("loop").icon)).toBe("inactive");
  });

});

describe("Unknown action buttons", () => {
  // A button saved by a newer version of Stash TV sharing the same Stash server
  it("shows a warning naming the unknown button type instead of a button", async () => {
    // Saved config isn't checked against the button types, which is what this simulates
    renderStack([{ id: "teleport-0", type: "button", buttonType: "teleport", pinned: true } as unknown as ActionButtonStackConfig]);

    await waitFor(() => expect(document.body).toHaveTextContent('Unknown button type "teleport"'));
    expect(document.querySelector(".unknown-action-button")).toHaveTextContent('Unknown button: "teleport"');
    expect(screen.queryByRole("button", { name: /teleport/ })).not.toBeInTheDocument();
  });
});
