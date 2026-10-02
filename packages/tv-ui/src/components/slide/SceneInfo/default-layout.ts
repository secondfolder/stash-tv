/**
 * The scene info panel's default layout. In a module of its own, importing nothing but types, as the tvConfig store
 * needs it: the fields' definitions import their components, and with them the Stash API client (StashService), which
 * connects as it's imported.
 */
import type { SceneInfoFieldInstance, SceneInfoFieldOptions, SceneInfoLayout } from "./scene-info-config";

/** A spacer in the default layout. Its id need only be unique in the layout. */
function defaultSpacer(id: number, size: SceneInfoFieldOptions["spacer"]["size"]): SceneInfoFieldInstance {
  return { field: "spacer", id: `default-${id}`, options: { size } };
}

export const defaultSceneInfoLayout: SceneInfoLayout = [
  ["studio"],
  ["title"],
  [defaultSpacer(1, "medium")],
  { left: ["date"], right: ["resolution", defaultSpacer(2, "small"), "frame-rate"] },
  [defaultSpacer(3, "small")],
  { left: ["rating"], right: ["o-count", defaultSpacer(4, "medium"), "play-count"] },
  [defaultSpacer(5, "medium")],
  ["performers"],
  [defaultSpacer(6, "small")],
  ["tags"],
  [defaultSpacer(7, "small")],
  ["details"],
];
