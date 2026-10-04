import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupIntegrationTest } from "./harness";
import type { ChannelConfig } from "../../../src/components/channels/channel-config";
import { click } from "./feed";
import { chooseSelectOption, openSelectMenu } from "../../helpers/selects";

/**
 * Helpers for the channel settings tests, which are split across files so they run in parallel.
 *
 * @see docs/channels.md
 */

let integration: ReturnType<typeof setupIntegrationTest>;

/** Set up a test file for these tests against the mock server (call it at the top of the file) */
export function setupChannelSettingsTest() {
  integration = setupIntegrationTest();
  return integration;
}

// Fixture filter "2" ("Alpha Scenes") matches scene-1/4/6 only. "Blueprint Boulevard" is a scene it excludes.
export const ALPHA_SCENE = "Drift Duration";
export const NON_ALPHA_SCENE = "Blueprint Boulevard";
// A fixture marker title, never a scene title
export const MARKER = "Intro";

export const alphaChannel: ChannelConfig = {
  id: "alpha",
  sources: [{ type: "stash-saved-filter", savedFilterId: "2", randomise: false }],
};

/** Choose what the channel in the modal shows: its media type, then the option with the given name */
export async function chooseSource(modal: HTMLElement, mediaType: "Scenes" | "Markers", optionText: string) {
  click(within(modal).getByRole("button", { name: mediaType }));
  await chooseSelectOption(within(modal).getByLabelText("Show"), optionText);
}

/** The options in the modal's source dropdown */
export async function sourceOptions(modal: HTMLElement) {
  const listbox = await openSelectMenu(within(modal).getByLabelText("Show"));
  const options = within(listbox).getAllByRole("option").map((option) => option.textContent);
  await userEvent.keyboard("{Escape}");
  return options;
}
