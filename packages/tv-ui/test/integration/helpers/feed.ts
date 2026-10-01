import { act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect } from "vitest";
import { bootApp, type BootedApp } from "./harness";
import type { useTvConfig } from "../../../src/store/tvConfig";
import type { ActionButtonConfig } from "../../../src/components/action-buttons/buttons";

/**
 * Boot once to change persisted tvConfig, then boot fresh so the app starts with it (as it would after a reload).
 * `readyText` is passed to the second `bootApp()`.
 */
export async function bootWithTvConfig(
  configure: (tvConfig: ReturnType<typeof useTvConfig.getState>) => void,
  readyText?: string
) {
  const first = await bootApp();
  const { useTvConfig } = await import("../../../src/store/tvConfig");
  await act(async () => {
    configure(useTvConfig.getState());
  });
  await first.unmount();
  return await bootApp(readyText);
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

/**
 * Replace the action button stack with just the given buttons, pinned, so their displayed state is in the DOM (by
 * default most buttons sit in a closed folder). Pass a button type for buttons with no options of their own, or the
 * button's options (e.g. `{ buttonType: "create-marker", iconId: "bookmark", markerDefaults: … }`).
 */
export async function pinActionButtons(buttons: ("rate-scene" | "o-counter" | ButtonOptions)[]) {
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
