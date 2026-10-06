/** The React Select-formatted filter info used as a fallback if no saved
 * filters are available. */
export const DEFAULT_FILTER = {
  label: "Default",
  value: "default",
} as const;

/** The React Select-formatted filter info used as a fallback if no default
 * filter is available. */
export const FALLBACK_FILTER = {
  label: "All portrait scenes",
  value: "portrait",
} as const;

/** The number of items remaining in the queue before new item data is fetched.
 * */
export const ITEMS_BEFORE_END_ON_FETCH = 2 as const;

export const PLUGIN_CONFIG_PROPERTY = {
  DEFAULT_FILTER_ID: "defaultFilterID",
  SUBTITLE_LANGUAGE: "subtitleLanguage",
} as const;

export const PLUGIN_NAMESPACE = "stash-tv" as const;

/**
 * The URL params Stash describes a scene page's queue with: a filter's (sort, search, criteria and page), or
 * hand-picked scenes' ids. The plugin opens Stash TV with them to show the queue (see `getStashQueue`).
 */
export const STASH_QUEUE_PARAMS = ["qsort", "qsortd", "qfq", "qfc", "qfp", "qs"];

/** The URL param the plugin passes the scene Stash was playing from the queue in, for the feed to start at */
export const STASH_QUEUE_SCENE_PARAM = "scene";

export const proxyPrefix = "/stash";

/** Values a playback position option's `label` or `shortLabel` can be built
 * from when it's a function, so it can describe the current settings. */
export type PlaybackPositionLabelContext = {
  /** `tvConfig.playLength` formatted for display */
  formattedDuration: string,
};

/** The options for where scene playback starts (`tvConfig.startPosition`), in
 * the order they're offered in settings and cycled through by the start point
 * action button. `shortLabel` is shown beside that button. Read them through
 * `usePlaybackPositionOptions()`, which resolves function labels and short labels. */
export const START_POSITION_OPTIONS = [
  { value: 'resume', label: 'Resume from last played position', shortLabel: 'Resume' },
  { value: 'beginning', label: 'Play from the beginning', shortLabel: 'Beginning' },
  { value: 'random', label: 'Start at a random marker (or position if none)', shortLabel: 'Random marker/time' },
] as const;

/** The options for where scene playback ends (`tvConfig.endPosition`), in the
 * order they're offered in settings and cycled through by the end point action
 * button. `shortLabel` is shown beside that button. Read them through
 * `usePlaybackPositionOptions()`, which resolves function labels and short labels. */
export const END_POSITION_OPTIONS = [
  { value: 'video-end', label: 'Play till end', shortLabel: 'End' },
  { value: 'fixed-length', label: ({formattedDuration}: PlaybackPositionLabelContext) => `Play for ${formattedDuration}`, shortLabel: ({formattedDuration}: PlaybackPositionLabelContext) => `After ${formattedDuration}` },
  { value: 'random-length', label: 'Play for random length of time', shortLabel: 'Random end' },
] as const;

/** The UI controls (and the panels they open) that keep the UI showing while a mouse rests over them, and whose click
 * is swallowed when the press that made it woke the UI (see `useUiAutoHide`) */
export const UI_CONTROLS_SELECTOR = [
  ".hide-on-ui-hide",
  ".dim-on-ui-hide",
  ".vjs-control-bar",
  ".SceneInfo.active",
  ".folder-contents-popover",
  ".PopoverPanel",
  ".EntityPopover",
].join(", ");
