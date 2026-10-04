import { act, screen, waitFor, within } from "@testing-library/react";
import type { ChannelConfig } from "../../src/components/channels/channel-config";

/**
 * Using the Settings tab's channel settings, for their unit and integration tests alike.
 *
 * @see docs/channels.md
 */

// The channel new users start with
export const defaultChannel: ChannelConfig = {
  id: "all-scenes",
  sources: [{ type: "all", entityType: "scene", randomise: false }],
};
export const allMarkersChannel: ChannelConfig = {
  id: "all-markers",
  sources: [{ type: "all", entityType: "marker", randomise: false }],
};

export async function openChannelSettings() {
  const { useGlobalState } = await import("../../src/store/globalState");
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
