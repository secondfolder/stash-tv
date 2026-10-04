/**
 * Channel settings in the Settings tab: the list of channels, adding one, the temporary channel's place in the list,
 * and the channel on startup. Where Stash's saved filters or the feed come into it, they're integration tested.
 *
 * @see docs/channels.md
 */

import { beforeEach, describe, expect, it } from "vitest";
import React from "react";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import SettingsTab from "../../../src/components/settings/SettingsTab";
import type { ChannelConfig } from "../../../src/components/channels/channel-config";
import { useTvConfig } from "../../../src/store/tvConfig";
import {
  allMarkersChannel,
  channelItem,
  channelModal,
  defaultChannel,
  listedChannels,
  openChannelSettings,
  startupChannelSelect,
} from "../../helpers/channelSettings";
import { chooseSelectOption } from "../../helpers/selects";
import { renderOnSlide } from "../helpers/render";
import { resetStores } from "../helpers/stores";

beforeEach(() => {
  resetStores();
});

async function renderChannelSettings() {
  renderOnSlide(<SettingsTab />);
  await openChannelSettings();
}

function setChannels(channels: ChannelConfig[]) {
  act(() => useTvConfig.getState().set("channels", channels));
}

describe("Channel settings", () => {
  it("starts new users with a single \"All scenes\" channel that can't be deleted", async () => {
    await renderChannelSettings();

    expect(listedChannels()).toEqual(["All scenes"]);
    const item = channelItem("All scenes");
    expect(within(item).getByRole("button", { name: "All scenes" })).toHaveAttribute("aria-current", "true");
    expect(within(item).queryByRole("button", { name: "Delete channel" })).not.toBeInTheDocument();
  });

  it("won't add a channel without a source", async () => {
    await renderChannelSettings();

    await userEvent.click(screen.getByText("Add channel"));
    const modal = await channelModal();
    await userEvent.click(within(modal).getByRole("button", { name: "Add" }));

    await within(modal).findByText("Choose a filter");
    expect(useTvConfig.getState().channels).toEqual([defaultChannel]);
  });
});

/** @see docs/channels.md § "Temporary channel" */
describe("Temporary channel", () => {
  const deltaChannel: ChannelConfig = {
    id: "temporary",
    sources: [{
      type: "temporary-filter",
      filter: {
        mode: GQL.FilterMode.Scenes,
        name: "Tagged Delta",
        object_filter: {
          tags: { modifier: GQL.CriterionModifier.IncludesAll, value: { items: [{ id: "tag-delta", label: "Delta" }], excluded: [], depth: 0 } },
        },
      },
      randomise: false,
    }],
  };

  it("is listed last, marked temporary, and can't be edited or moved", async () => {
    setChannels([defaultChannel, allMarkersChannel, deltaChannel]);
    await renderChannelSettings();

    await waitFor(() => expect(listedChannels()).toEqual(["All scenes", "All markers", "Tagged Delta"]));
    const item = channelItem("Tagged Delta");
    expect(within(item).getByText("Temporary")).toBeInTheDocument();
    expect(within(item).queryByRole("button", { name: "Edit channel" })).not.toBeInTheDocument();
    expect(item.querySelector(".drag-handle")).toHaveClass("disable");
  });

  it("can be deleted even when it's the only other channel, though the last saved one can't", async () => {
    setChannels([defaultChannel, deltaChannel]);
    await renderChannelSettings();

    await waitFor(() => expect(listedChannels()).toEqual(["All scenes", "Tagged Delta"]));
    expect(within(channelItem("All scenes")).queryByRole("button", { name: "Delete channel" })).not.toBeInTheDocument();
    await userEvent.click(within(channelItem("Tagged Delta")).getByRole("button", { name: "Delete channel" }));

    await waitFor(() => expect(listedChannels()).toEqual(["All scenes"]));
  });
});

describe("Channel on startup", () => {
  /** @see docs/channels.md § "Startup channel" */
  it("is chosen in the Settings tab", async () => {
    await renderChannelSettings();

    await chooseSelectOption(startupChannelSelect(), "First in list");

    expect(useTvConfig.getState().startupChannel).toBe("first");
  });
});
