import React from "react";
import ReactDOM from "react-dom";
import { fireEvent, waitFor } from "@testing-library/react";
import type { ActionButtonDefinition } from "../../src/components/action-buttons/buttons";

// App modules are imported inside functions rather than here: integration tests must not import anything that creates
// an Apollo client before the harness has pointed the API at the mock server (see docs/testing.md § "Gotchas"), and
// importing them later also gets the booted app's own instances.

/**
 * Which state an action button is showing, judged by its icon: the state whose icon matches the one rendered in the
 * button. Many buttons (e.g. playback rate, rating, volume) have the same title in every state, so the icon is the
 * only thing that tells the user whether the button is active.
 *
 * Returns null when the icon matches none of the given states.
 */
export async function displayedIconState<State extends string>(
  actionButton: Element,
  icon: ActionButtonDefinition["icon"],
  states: readonly State[] = ["active", "inactive"] as unknown as readonly State[]
): Promise<State | null> {
  const rendered = actionButton.querySelector(".ActionButtonIcon")?.outerHTML;
  if (!rendered) throw new Error("Action button has no icon");
  const { ActionButtonIcon } = await import("../../src/components/action-buttons/ActionButtonBase");
  const matches = states.filter((state) => renderIconMarkup(ActionButtonIcon, icon, state) === rendered);
  if (matches.length > 1) throw new Error(`States ${matches.join(", ")} share an icon so can't be told apart`);
  return matches[0] ?? null;
}

/** The markup of a button's icon in the given state, rendered the way the DOM serialises it. */
function renderIconMarkup(
  ActionButtonIcon: typeof import("../../src/components/action-buttons/ActionButtonBase").ActionButtonIcon,
  icon: ActionButtonDefinition["icon"],
  state: string
) {
  const container = document.createElement("div");
  ReactDOM.render(<ActionButtonIcon iconDefinition={icon} state={state} />, container);
  const markup = container.innerHTML;
  ReactDOM.unmountComponentAtNode(container);
  return markup;
}

/** The action button (its root element) with the given accessible name. */
export function actionButtonRoot(button: HTMLElement) {
  const root = button.closest(".ActionButton");
  if (!root) throw new Error("Element isn't inside an action button");
  return root;
}

/** The open action button side panel. */
export function sidePanel() {
  const panel = document.querySelector<HTMLElement>(".action-button-side-panel");
  if (!panel) throw new Error("Side panel not shown");
  return panel;
}

export function isSidePanelOpen() {
  return document.querySelector(".action-button-side-panel") !== null;
}

/**
 * Close the open side panel the way a user would: by clicking outside it, which lands on the backdrop the
 * outside-click handling puts just before the panel.
 */
export async function closeSidePanelByClickingOutside() {
  const backdrop = sidePanel().previousElementSibling;
  if (!(backdrop instanceof HTMLElement)) throw new Error("Side panel has no backdrop");
  // fireEvent rather than userEvent: see docs/testing.md § "Gotchas" (userEvent.click breaks with a MediaSlide mounted)
  fireEvent.click(backdrop);
  await waitFor(() => {
    if (isSidePanelOpen()) throw new Error("Side panel still open");
  });
}
