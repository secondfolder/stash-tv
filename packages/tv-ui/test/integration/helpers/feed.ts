import { act, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, vi } from "vitest";
import { bootApp, type BootedApp } from "./harness";
import type { useTvConfig } from "../../../src/store/tvConfig";
import type { ActionButtonConfig } from "../../../src/components/action-buttons/buttons";
import type { ActionButtonStackConfig } from "../../../src/components/action-buttons/ActionButtonStack";
import type { ChannelSource } from "../../../src/components/channels/channel-config";

/**
 * Click an element. fireEvent rather than userEvent: see docs/testing.md § "Gotchas" (userEvent.click breaks with a
 * MediaSlide mounted).
 */
export function click(element: HTMLElement) {
  fireEvent.click(element);
}

/** The booted app's tvConfig store (imported only once the app's booted: see docs/testing.md § "Gotchas") */
export async function tvConfig() {
  const { useTvConfig } = await import("../../../src/store/tvConfig");
  return useTvConfig.getState();
}

/**
 * Change persisted tvConfig, then boot fresh so the app starts with it (as it would after a reload). `readyText` is
 * passed to `bootApp()`.
 *
 * The config is changed through a fresh copy of the tvConfig store, without rendering the app: the store loads its
 * saved state as it's imported, and saves changes through the app's own storage, so they land on the server as the
 * app would save them. Rendering the feed is most of what a boot costs, so this saves one.
 */
export async function bootWithTvConfig(
  configure: (tvConfig: ReturnType<typeof useTvConfig.getState>) => void,
  readyText?: string
) {
  vi.resetModules();
  const { useTvConfig } = await import("../../../src/store/tvConfig");
  const { useGlobalState } = await import("../../../src/store/globalState");
  const { stashConfigWritesSettled } = await import("../../../src/helpers/stash-config-storage");
  await waitFor(() => expect(useGlobalState.getState().tvConfigLoaded).toBe(true));
  configure(useTvConfig.getState());
  await stashConfigWritesSettled();
  return await bootApp(readyText);
}

/**
 * Make a single channel showing the given source the last viewed one, so the next boot starts on it. Pass a saved
 * filter id as shorthand for a channel showing that Stash filter.
 */
export function setChannel(tvConfig: ReturnType<typeof useTvConfig.getState>, source: string | ChannelSource) {
  const channelSource: ChannelSource = typeof source === "string"
    ? { type: "stash-saved-filter", savedFilterId: source, randomise: false }
    : source
  tvConfig.set("channels", [{ id: "test-channel", sources: [channelSource] }]);
  tvConfig.set("lastViewedChannelId", "test-channel");
}

/** Every rendered MediaSlide (the virtualizer only renders those near the current one). */
export function slides(app: BootedApp) {
  return [...app.rendered.container.querySelectorAll<HTMLElement>('[data-testid="MediaSlide--container"]')];
}

export function currentSlide(app: BootedApp) {
  const current = slides(app).filter((slide) => slide.dataset.currentVideo === "true");
  expect(current).toHaveLength(1);
  return current[0];
}

export function sceneIdOf(slide: HTMLElement) {
  const sceneId = slide.dataset.sceneId;
  if (!sceneId) throw new Error("MediaSlide is missing data-scene-id");
  return sceneId;
}

/**
 * Tell the current slide's player its video started loading a new source, as a browser would after the source
 * changes. jsdom never loads media, so it never fires `loadstart` itself, and that's the event the app watches to
 * learn which stream is playing.
 */
export function fireLoadStart(app: BootedApp) {
  const video = currentSlide(app).querySelector("video");
  if (!video) throw new Error("Current slide has no video element");
  act(() => {
    video.dispatchEvent(new Event("loadstart"));
  });
}

/**
 * Make the current slide's video fail to play its source, as a browser does when it can't decode it, so the player's
 * error handling (e.g. Stash's fallback to the next stream) runs.
 */
export function failCurrentSource(app: BootedApp) {
  const video = currentSlide(app).querySelector("video");
  if (!video) throw new Error("Current slide has no video element");
  Object.defineProperty(video, "error", {
    configurable: true,
    // Video.js wraps whatever the element reports in its own MediaError, so only the code matters
    get: () => ({ code: MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED, message: "Can't play this source" }),
  });
  act(() => {
    video.dispatchEvent(new Event("error"));
  });
  // A later source would load fine, so it mustn't see this error
  Reflect.deleteProperty(video, "error");
}

export async function goToNextSlide(app: BootedApp) {
  const previousIndex = currentSlide(app).dataset.index;
  await userEvent.keyboard("{ArrowDown}");
  await waitFor(() => expect(currentSlide(app).dataset.index).not.toBe(previousIndex));
}

/** Move to the given slide index by stepping forward one slide at a time. */
export async function goToSlide(app: BootedApp, index: number) {
  while (Number(currentSlide(app).dataset.index) < index) {
    await goToNextSlide(app);
  }
  expect(currentSlide(app).dataset.index).toBe(String(index));
}

/** A button's config without the stack fields `pinActionButtons` fills in */
type ButtonOptions = ActionButtonConfig extends infer Config
  ? Config extends ActionButtonConfig ? Omit<Config, "id" | "type" | "pinned"> : never
  : never;

/** Types of the buttons that need no options of their own */
type OptionlessButtonType = ButtonOptions extends infer Options
  ? Options extends ButtonOptions ? ({ buttonType: Options["buttonType"] } extends Options ? Options["buttonType"] : never) : never
  : never;

/**
 * Replace the action button stack with just the given buttons, pinned, so their displayed state is in the DOM (by
 * default most buttons sit in a closed folder). Pass a button type for buttons with no options of their own, or the
 * button's options (e.g. `{ buttonType: "create-marker", iconId: "bookmark", markerDefaults: … }`).
 */
export async function pinActionButtons(buttons: (OptionlessButtonType | ButtonOptions)[]) {
  const { useTvConfig } = await import("../../../src/store/tvConfig");
  await act(async () => {
    useTvConfig.getState().set(
      "actionButtonStackConfig",
      buttons.map((button, index) => {
        const options = typeof button === "string" ? { buttonType: button } : button;
        return { ...options, id: `${options.buttonType}-${index}`, type: "button" as const, pinned: true };
      })
    );
  });
}

/** The side info (e.g. rating, o-count) shown next to the current slide's action button of the given type. */
export function displayedSideInfo(app: BootedApp, buttonType: string) {
  return currentSlide(app).querySelector(`.ActionButton.${buttonType} .side-info`)?.textContent ?? null;
}

/**
 * Replace the action button stack with one pinned button whose config isn't checked against any button's schema, as
 * if it were saved by a different version of Stash TV or edited by hand. For testing how buttons handle bad config.
 */
export async function pinUncheckedActionButton(options: { buttonType: string } & Record<string, unknown>) {
  const { useTvConfig } = await import("../../../src/store/tvConfig");
  const config = { ...options, id: `${options.buttonType}-0`, type: "button", pinned: true };
  await act(async () => {
    // Persisted config is untrusted at runtime, which is exactly what this simulates, so it can't be typed as valid
    useTvConfig.getState().set("actionButtonStackConfig", [config as unknown as ActionButtonConfig]);
  });
}

/** Replace the action button stack with the given config */
export async function setStackConfig(config: ActionButtonStackConfig[]) {
  const { useTvConfig } = await import("../../../src/store/tvConfig");
  await act(async () => useTvConfig.getState().set("actionButtonStackConfig", config));
}

/**
 * The current slide's action button with the given accessible name (its title). In the action button stack: the scene
 * info panel can have buttons of the same name (e.g. its o-count's "Mark Orgasm").
 */
export async function actionButton(app: BootedApp, name: string | RegExp) {
  const stack = await within(currentSlide(app)).findByTestId("MediaSlide--toggleableUi");
  return within(stack).findByRole("button", { name });
}

/** Boot showing every marker (fixture filter "3", "All Markers", sorted by scene) */
export async function bootMarkersFeed() {
  return await bootWithTvConfig((tvConfig) => setChannel(tvConfig, "3"), "Intro");
}

/** Wait for the feed to show the given text (e.g. a scene's title) */
export async function feedShows(app: BootedApp, text: string) {
  await waitFor(() => expect(app.rendered.container.querySelector(".VideoScroller")?.textContent).toContain(text));
}

/** Wait for the feed to stop showing the given text */
export async function feedDoesNotShow(app: BootedApp, text: string) {
  await waitFor(() => expect(app.rendered.container.querySelector(".VideoScroller")?.textContent).not.toContain(text));
}
