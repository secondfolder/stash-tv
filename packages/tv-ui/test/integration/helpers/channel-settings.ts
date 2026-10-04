import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupIntegrationTest } from "./harness";
import type { ChannelConfig } from "../../../src/components/channels/channel-config";
import { click } from "./feed";
import { chooseSelectOption, openSelectMenu } from "./selects";

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

// The channel new users start with
export const defaultChannel: ChannelConfig = {
  id: "all-scenes",
  sources: [{ type: "all", entityType: "scene", randomise: false }],
};
export const alphaChannel: ChannelConfig = {
  id: "alpha",
  sources: [{ type: "stash-saved-filter", savedFilterId: "2", randomise: false }],
};
export const allMarkersChannel: ChannelConfig = {
  id: "all-markers",
  sources: [{ type: "all", entityType: "marker", randomise: false }],
};

export async function openChannelSettings() {
  const { useGlobalState } = await import("../../../src/store/globalState");
  await act(async () => useGlobalState.getState().set("showSettings", true));
  await screen.findByText("Channels");
}

/**
 * The Settings tab's "Channel on Startup" select. Looked for within its form group: a label query over the whole booted
 * app takes seconds (see docs/testing.md § "Gotchas")
 */
export function startupChannelSelect() {
  const group = screen.getByText("Channel on Startup").closest<HTMLElement>(".form-group");
  if (!group) throw new Error("Channel on Startup isn't in a form group");
  return within(group).getByLabelText("Channel on Startup");
}

/** The channels listed in the Settings tab, as their names */
export function listedChannels() {
  return [...document.querySelectorAll<HTMLElement>(".ChannelSettings .channel .channel-name")]
    .map((element) => element.textContent);
}

export function channelItem(name: string) {
  const item = [...document.querySelectorAll<HTMLElement>(".ChannelSettings .channel")].find(
    (element) => element.querySelector(".channel-name")?.textContent === name
  );
  if (!item) throw new Error(`No "${name}" channel in the Settings tab's list`);
  return item;
}

export async function channelModal() {
  return await waitFor(() => {
    const modal = document.querySelector<HTMLElement>(".ChannelSettingsModal");
    if (!modal) throw new Error("Channel modal not shown");
    return modal;
  });
}

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
