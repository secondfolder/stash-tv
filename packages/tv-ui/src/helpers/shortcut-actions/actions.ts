/**
 * Every shortcut action, whatever triggers it (keyboard or gamepad): what it's called, where it's listed and when it
 * applies. Each input device has its own bindings for them: the keyboard's defaults are in
 * `keyboard-shortcuts/definitions.ts`, the gamepad's presets in `gamepad/presets.ts`.
 *
 * Adding an action means adding it here, giving it default keys (and a help row in `KeyboardShortcutsInfo`).
 *
 * @see docs/keyboard-shortcuts.md § "The registry"
 */

export const SHORTCUT_GROUPS = ["General", "Playback", "Scene/Marker Actions", "Display"] as const;
export type ShortcutGroup = typeof SHORTCUT_GROUPS[number];

export type ShortcutAction<ActionId extends string = ShortcutActionId> = {
  group: ShortcutGroup;
  /** What the settings call it */
  title: string;
  /** A word or two for it, where there's little room (the gamepad diagram's labels) */
  shortTitle: string;
  /**
   * Actions whose keys (or gamepad controls) are held down while pressing this one's: its keys are pressed while
   * holding the last key of any of theirs. That part follows those actions' bindings, so it isn't part of this one's
   * own (as the rating's digits aren't)
   */
  heldWith?: readonly ActionId[];
};

export const SHORTCUT_ACTIONS = {
  "show-shortcuts": { group: "General", title: "Show keyboard shortcuts", shortTitle: "Shortcuts" },
  "play-pause": { group: "Playback", title: "Play/pause", shortTitle: "Play/pause" },
  "seek-backwards": { group: "Playback", title: "Jump backwards (hold to rewind)", shortTitle: "Jump back" },
  "seek-forwards": { group: "Playback", title: "Jump forwards (hold to fast forward)", shortTitle: "Jump fwd" },
  // Pressed while holding a seek key: they only do anything while rewinding or fast forwarding
  "seek-faster": {
    group: "Playback",
    title: "Speed up while rewinding/fast forwarding",
    shortTitle: "Faster",
    heldWith: ["seek-backwards", "seek-forwards"],
  },
  "seek-slower": {
    group: "Playback",
    title: "Slow down while rewinding/fast forwarding",
    shortTitle: "Slower",
    heldWith: ["seek-backwards", "seek-forwards"],
  },
  "next": { group: "Playback", title: "Go to next media", shortTitle: "Next" },
  "previous": { group: "Playback", title: "Go to previous media", shortTitle: "Previous" },
  "toggle-looping": { group: "Playback", title: "Toggle looping", shortTitle: "Loop" },
  "toggle-mute": { group: "Playback", title: "Mute/unmute", shortTitle: "Mute" },
  "rate": { group: "Scene/Marker Actions", title: "Rate", shortTitle: "Rate" },
  "unset-rating": { group: "Scene/Marker Actions", title: "Unset rating", shortTitle: "Unrate" },
  "delete": { group: "Scene/Marker Actions", title: "Delete scene/marker", shortTitle: "Delete" },
  "edit-tags": { group: "Scene/Marker Actions", title: "Edit tags", shortTitle: "Tags" },
  "toggle-scene-info": { group: "Scene/Marker Actions", title: "Toggle scene info", shortTitle: "Info" },
  "toggle-crt": { group: "Display", title: "Toggle CRT effect", shortTitle: "CRT" },
  "toggle-fullscreen": { group: "Display", title: "Toggle fullscreen", shortTitle: "Fullscreen" },
  "toggle-landscape": { group: "Display", title: "Toggle forced landscape", shortTitle: "Landscape" },
  "toggle-pip": { group: "Display", title: "Toggle picture-in-picture", shortTitle: "PiP" },
  "toggle-subtitles": { group: "Display", title: "Toggle subtitles", shortTitle: "Subtitles" },
} as const satisfies Record<string, ShortcutAction<string>>;

export type ShortcutActionId = keyof typeof SHORTCUT_ACTIONS;

export const SHORTCUT_ACTION_IDS = Object.keys(SHORTCUT_ACTIONS) as ShortcutActionId[];

export function getShortcutAction(actionId: ShortcutActionId): ShortcutAction {
  return SHORTCUT_ACTIONS[actionId];
}
