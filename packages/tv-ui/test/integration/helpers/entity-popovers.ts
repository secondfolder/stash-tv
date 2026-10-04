import { act, screen, waitFor, within } from "@testing-library/react";
import type { BootedApp } from "./harness";
import { bootWithTvConfig, currentSlide, click } from "./feed";
import type { FilterEntity, FilterEntityType } from "../../../src/components/channels/temporary-filter";

/**
 * Helpers for tests of entities' popovers in the scene info panel (see docs/entity-popovers.md). App code is imported
 * only inside functions: see docs/testing.md § "Gotchas" (importing Stash's `StashService` connects to Stash).
 */

/** The first slide's scene's date (fixture scene-7, "Grotto Glow") */
export const FIRST_SCENE_DATE = "14 February 2025";

/** Boot showing the scene info panel with just the title (which the feed is checked for), the date, and these fields */
export async function bootWithPanelOpenShowing(fields: string[]) {
  const layout = [["title"], ["date"], ...fields.map(field => [field])];
  const app = await bootWithTvConfig((tvConfig) => tvConfig.set("sceneInfoLayout", layout), FIRST_SCENE_DATE);
  const { useGlobalState } = await import("../../../src/store/globalState");
  await act(async () => useGlobalState.getState().set("sceneInfoOpen", true));
  return app;
}

/** The link opening an entity's popover in the current slide's info panel, by the entity's name */
export function entityLink(app: BootedApp, name: string) {
  return within(within(currentSlide(app)).getByTestId("MediaSlide--sceneInfo")).getByRole("link", { name });
}

export async function openEntityPopover(app: BootedApp, name: string) {
  // The feed may be reloading for a new channel filter, with no current slide yet
  click(await waitFor(() => entityLink(app, name)));
  return await screen.findByRole("dialog", { name });
}

export async function temporaryChannelFilter() {
  const { useTvConfig } = await import("../../../src/store/tvConfig");
  const { getTemporaryFilter } = await import("../../../src/components/channels/channel-config");
  return getTemporaryFilter(useTvConfig.getState().channels);
}

/**
 * Show a temporary channel filtering by the entity, as its popover's "Show scenes with…" does, also requiring any others
 * given, as "Add to channel filter" does
 */
export async function showTemporaryEntityFilter(entityType: FilterEntityType, entity: FilterEntity, ...others: FilterEntity[]) {
  const { showTemporaryFilter } = await import("../../../src/hooks/useMediaItemFilters");
  const { addEntityToFilter, makeEntityFilter } = await import("../../../src/components/channels/temporary-filter");
  const filter = others.reduce((filter, other) => addEntityToFilter(filter, entityType, other), makeEntityFilter(entityType, entity));
  await act(async () => showTemporaryFilter(filter));
}
