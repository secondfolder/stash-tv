/**
 * The subtitles action button, which chooses the current slide's captions through Stash's ScenePlayer. These run
 * against the real Video.js player.
 *
 * @see docs/action-buttons.md § "Button Props & Runtime Config Validation"
 */

import { describe, expect, it } from "vitest";
import { act, within } from "@testing-library/react";
import { bootApp, type BootedApp } from "./helpers/harness";
import { currentSlide, pinActionButtons, click, tvConfig, actionButton } from "./helpers/feed";
import { setupPlayerActionButtonsTest, firstSceneId } from "./helpers/player-action-buttons";

const integration = setupPlayerActionButtonsTest();

describe("Subtitles button", () => {
  function addEnglishCaptions(sceneId: string) {
    const scene = integration.server.store.scenes.get(sceneId);
    if (!scene) throw new Error(`No scene ${sceneId} on the server`);
    scene.captions = [{ language_code: "en", caption_type: "vtt" }];
  }

  function setSubtitleLanguage(language: string) {
    integration.server.store.pluginConfig = { "stash-tv": { subtitleLanguage: language } };
  }

  /** Boot with the subtitles button pinned, waiting on another pinned button so a missing one isn't missed */
  async function bootWithSubtitlesButton() {
    const app = await bootApp();
    await pinActionButtons(["subtitles", "loop"]);
    await actionButton(app, "Loop scene");
    return app;
  }

  function subtitlesButton(app: BootedApp) {
    return within(currentSlide(app)).queryByRole("button", { name: /subtitles/ });
  }

  it("shows subtitles when the scene has them in the chosen language", async () => {
    addEnglishCaptions(firstSceneId);
    setSubtitleLanguage("en");
    const app = await bootWithSubtitlesButton();

    click(await actionButton(app, "Show subtitles"));

    expect((await tvConfig()).showSubtitles).toBe(true);
    expect(await actionButton(app, "Hide subtitles")).toBeInTheDocument();

    await app.unmount();
  });

  it("hides subtitles when they're shown", async () => {
    addEnglishCaptions(firstSceneId);
    setSubtitleLanguage("en");
    const app = await bootWithSubtitlesButton();
    await act(async () => (await tvConfig()).set("showSubtitles", true));

    click(await actionButton(app, "Hide subtitles"));

    expect((await tvConfig()).showSubtitles).toBe(false);

    await app.unmount();
  });

  it("isn't shown when the scene has no subtitles", async () => {
    setSubtitleLanguage("en");
    const app = await bootWithSubtitlesButton();

    expect(subtitlesButton(app)).not.toBeInTheDocument();

    await app.unmount();
  });

  it("isn't shown when the scene has no subtitles in the chosen language", async () => {
    addEnglishCaptions(firstSceneId);
    setSubtitleLanguage("fr");
    const app = await bootWithSubtitlesButton();

    expect(subtitlesButton(app)).not.toBeInTheDocument();

    await app.unmount();
  });

  it("isn't shown when no subtitle language is chosen", async () => {
    addEnglishCaptions(firstSceneId);
    const app = await bootWithSubtitlesButton();

    expect(subtitlesButton(app)).not.toBeInTheDocument();

    await app.unmount();
  });
});
