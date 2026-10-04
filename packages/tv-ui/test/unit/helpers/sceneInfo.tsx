import React from "react";
import { act, screen } from "@testing-library/react";
import SceneInfo from "../../../src/components/slide/SceneInfo";
import { useTvConfig } from "../../../src/store/tvConfig";
import { clickEdit, PERFORMER, TAG, TITLE } from "../../helpers/sceneInfo";
import { sceneMediaItem } from "./mediaItems";
import { renderOnSlide } from "./render";

/**
 * Rendering the scene info panel on its own, for its unit tests. Its integration tests use the same fixture scene, in
 * the feed.
 */

/** A stand-in for fixture scene-7, with what the panel's fields show */
export const grottoGlow = (() => {
  const item = sceneMediaItem({
    id: "scene-7",
    title: TITLE,
    date: "2025-02-14",
    details: "Details for Grotto Glow.",
    code: null,
    director: null,
    urls: [],
    groups: [],
    studio: null,
    rating100: null,
    o_counter: 0,
    play_count: 0,
    tags: [{ id: "tag-beta", name: TAG }],
    performers: [{ id: "performer-bob", name: PERFORMER, gender: null, favorite: false }],
    // A portrait video, 180 wide and 320 high
    files: [{ id: "file-7", path: "/media/scene-7.mp4", width: 180, height: 320, frame_rate: 24, duration: 12 }],
    paths: { stream: "http://stash.test/scene/scene-7/stream" },
  });
  if (item.entityType !== "scene") throw new Error("Not a scene");
  return item.entity;
})();

/**
 * Render the open panel for fixture scene-7, with the given layout and field options saved, returning it. `setOpen`
 * opens and closes it as the info button does.
 */
export function renderPanel({ layout, fieldOptions }: {
  layout?: ReturnType<typeof useTvConfig.getState>["sceneInfoLayout"],
  fieldOptions?: ReturnType<typeof useTvConfig.getState>["sceneInfoFieldOptions"],
} = {}) {
  if (layout) useTvConfig.getState().set("sceneInfoLayout", layout);
  if (fieldOptions) useTvConfig.getState().set("sceneInfoFieldOptions", fieldOptions);
  const { rerender } = renderOnSlide(<SceneInfo scene={grottoGlow} open />);
  const infoPanel = screen.getByTestId("MediaSlide--sceneInfo");
  return {
    infoPanel,
    setOpen: (open: boolean) => act(() => rerender(<SceneInfo scene={grottoGlow} open={open} />)),
  };
}

/** Render the panel (see `renderPanel`) and switch it to its editor */
export function renderEditor(...args: Parameters<typeof renderPanel>) {
  const rendered = renderPanel(...args);
  clickEdit(rendered.infoPanel);
  return rendered;
}

/** The layout saved in tvConfig (which persists it to Stash: see docs/state-and-config.md) */
export function savedLayout() {
  return useTvConfig.getState().sceneInfoLayout;
}

export function savedFieldOptions() {
  return useTvConfig.getState().sceneInfoFieldOptions;
}
