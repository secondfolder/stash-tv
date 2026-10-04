/**
 * The resolution action button, which chooses the current slide's stream through Stash's ScenePlayer. These run
 * against the real Video.js player and Stash's source selector plugin.
 *
 * @see docs/action-buttons.md § "Button Props & Runtime Config Validation"
 * @see docs/video-player.md § "Source Selection"
 */

import { describe, expect, it } from "vitest";
import { waitFor, within } from "@testing-library/react";
import { bootApp, savedTvConfig, type BootedApp } from "./helpers/harness";
import { bootWithTvConfig, currentSlide, failCurrentSource, fireLoadStart, pinActionButtons, click, tvConfig, actionButton } from "./helpers/feed";
import { actionButtonRoot, displayedIconState, sidePanel } from "../helpers/actionButtons";
import { setupPlayerActionButtonsTest } from "./helpers/player-action-buttons";

const integration = setupPlayerActionButtonsTest();

describe("Resolution button", () => {
  async function openStreamPanel(app: BootedApp) {
    await pinActionButtons(["resolution"]);
    click(await actionButton(app, "Set stream resolution"));
    // The streams are listed once the player has loaded the scene's sources
    await waitFor(() => expect(streamOptions().length).toBeGreaterThan(0));
  }

  function streamOptions() {
    return within(sidePanel()).queryAllByRole("button");
  }

  function streamOption(name: string) {
    return within(sidePanel()).getByRole("button", { name });
  }

  /** The stream the panel shows as playing. Its button variant is how the panel shows it. */
  function playingStream() {
    return streamOptions().filter((option) => option.classList.contains("btn-primary")).map((option) => option.textContent);
  }

  /** The streams the panel marks (with a pin) as the preferred stream */
  function preferredStreams() {
    return streamOptions()
      .filter((option) => option.querySelector('[data-icon="thumbtack"]'))
      .map((option) => option.textContent);
  }

  /** Choose a stream in the panel, and let the player report the source it loads as a result */
  function chooseStream(app: BootedApp, name: string) {
    click(streamOption(name));
    fireLoadStart(app);
  }

  it("lists the scene's streams grouped by resolution, naming the direct stream by its file type", async () => {
    const app = await bootApp();

    await openStreamPanel(app);

    // The fixture is a 180×320 MP4, so a transcode to MP4 at the original resolution would duplicate the direct stream
    const group = sidePanel().querySelector(".stream-group");
    expect(group?.querySelector(".stream-group-label")).toHaveTextContent("Original 320p");
    expect(streamOptions().map((option) => option.textContent)).toEqual(["Direct MP4", "WEBM", "HLS", "DASH"]);

    await app.unmount();
  });

  it("shows the direct stream as playing and preferred by default", async () => {
    const app = await bootApp();

    await openStreamPanel(app);

    expect(playingStream()).toEqual(["Direct MP4"]);
    expect(preferredStreams()).toEqual(["Direct MP4"]);

    await app.unmount();
  });

  it("switches to the chosen stream and keeps it as the preferred stream", async () => {
    const app = await bootApp();
    await openStreamPanel(app);

    chooseStream(app, "WEBM");

    await waitFor(() => expect(playingStream()).toEqual(["WEBM"]));
    expect(preferredStreams()).toEqual(["WEBM"]);
    await waitFor(() => expect(savedTvConfig(integration).preferredStreamLabel).toBe("WEBM"));

    await app.unmount();
  });

  it("shows as active while playing a stream other than the direct stream", async () => {
    const app = await bootApp();
    await openStreamPanel(app);
    // Imported after boot: see docs/testing.md § "Gotchas" (importing app code at the top of an integration test)
    const { buttonDefinition } = await import("../../src/components/action-buttons/buttons/ResolutionActionButton");
    const displayedState = async () => await displayedIconState(
      actionButtonRoot(within(currentSlide(app)).getByRole("button", { name: "Set stream resolution" })),
      buttonDefinition.icon
    );
    expect(await displayedState()).toBe("inactive");

    chooseStream(app, "WEBM");

    await waitFor(() => expect(playingStream()).toEqual(["WEBM"]));
    expect(await displayedState()).toBe("active");
    await waitFor(() => expect(savedTvConfig(integration).preferredStreamLabel).toBe("WEBM"));

    await app.unmount();
  });

  it("stores no preference when switching back to the direct stream", async () => {
    const app = await bootWithTvConfig((config) => config.set("preferredStreamLabel", "WEBM"));
    await openStreamPanel(app);
    await waitFor(() => expect(playingStream()).toEqual(["WEBM"]));

    chooseStream(app, "Direct MP4");

    await waitFor(() => expect(playingStream()).toEqual(["Direct MP4"]));
    expect((await tvConfig()).preferredStreamLabel).toBeUndefined();
    await waitFor(() => expect(savedTvConfig(integration)).not.toHaveProperty("preferredStreamLabel"));

    await app.unmount();
  });

  it("shows the stream the player falls back to when the preferred one fails, keeping the preference", async () => {
    const app = await bootWithTvConfig((config) => config.set("preferredStreamLabel", "WEBM"));
    await openStreamPanel(app);
    await waitFor(() => expect(playingStream()).toEqual(["WEBM"]));

    // Stash's source selector then tries the next stream in its list, which is the direct stream
    failCurrentSource(app);
    fireLoadStart(app);

    await waitFor(() => expect(playingStream()).toEqual(["Direct MP4"]));
    expect(preferredStreams()).toEqual(["WEBM"]);
    expect((await tvConfig()).preferredStreamLabel).toBe("WEBM");

    await app.unmount();
  });

  it("names the preferred stream when this scene doesn't have it", async () => {
    const app = await bootWithTvConfig((config) => config.set("preferredStreamLabel", "MKV"));

    await openStreamPanel(app);

    expect(preferredStreams()).toEqual([]);
    expect(sidePanel().querySelector(".comment")).toHaveTextContent("MKV");

    await app.unmount();
  });
});
