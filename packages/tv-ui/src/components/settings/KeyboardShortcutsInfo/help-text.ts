import { RatingSystemType } from "stash-ui/dist/src/utils/rating";
import {
  formatRatingDigitSlots,
  SHORTCUT_GROUPS,
  type ShortcutActionId,
  type ShortcutBindings,
  type ShortcutGroup,
} from "../../../helpers/keyboard-shortcuts/definitions";
import { formatKeySequence } from "../../../helpers/keyboard-shortcuts/key-sequences";

/**
 * The keyboard shortcut list, written with the user's own keys. Where a shortcut matches one of Stash's, the wording
 * is from Stash's manual (`KeyboardShortcuts.md`), so users see the same description in both apps.
 *
 * @see docs/keyboard-shortcuts.md § "Help text"
 */

type HelpContext = {
  /** An action's keys, in markdown: each in code, separated by "or" */
  keys: (actionId: ShortcutActionId) => string;
  /** An action's keys, as text */
  keyLabels: (actionId: ShortcutActionId) => string[];
  ratingSystem: RatingSystemType;
};

type HelpEntry = {
  group: ShortcutGroup;
  /** The actions it's about. It's left out if one has no keys */
  actions: ShortcutActionId[];
  /** Its rows: the keys to press and what they do, in markdown */
  rows: (context: HelpContext) => [sequence: string, description: string][];
};

/** Markdown code for text, safe in a table cell (backticks and pipes included) */
function code(text: string) {
  const escaped = text.replace(/\|/g, "\\|");
  return escaped.includes("`") ? `\`\` ${escaped} \`\`` : `\`${escaped}\``;
}

/** An entry for one action: its keys, and what it does */
const single = (group: ShortcutGroup, actionId: ShortcutActionId, description: string): HelpEntry => ({
  group,
  actions: [actionId],
  rows: ({ keys }) => [[keys(actionId), description]],
});

/** Every way of typing the rating key followed by a suffix, in markdown */
const afterRatingKey = ({ keyLabels }: HelpContext, suffix: string) =>
  keyLabels("rate").map((prefix) => code(`${prefix} ${suffix}`)).join(" or ");

const HELP_ENTRIES: HelpEntry[] = [
  single("General", "show-shortcuts", "Show keyboard shortcuts"),

  single("Playback", "play-pause", "Play/pause player"),
  {
    group: "Playback",
    actions: ["seek-backwards", "seek-forwards"],
    rows: ({ keys }) => [
      [
        `${keys("seek-backwards")} or ${keys("seek-forwards")}`,
        "Jump backwards/forwards. The jump amount is dependent on the length of the video and it will try to align jumps with nearby markers if there are any.",
      ],
      [`Hold down ${keys("seek-backwards")} or ${keys("seek-forwards")}`, "Rewind/play at 2x speed"],
    ],
  },
  {
    group: "Playback",
    actions: ["seek-backwards", "seek-forwards", "seek-faster", "seek-slower"],
    rows: ({ keys }) => [[
      `Hold down ${keys("seek-backwards")} or ${keys("seek-forwards")} then tap ${keys("seek-faster")} or ${keys("seek-slower")}`,
      "Increase or decrease the rewind/play speed",
    ]],
  },
  {
    group: "Playback",
    actions: ["next", "previous"],
    rows: ({ keys }) => [[`${keys("next")} or ${keys("previous")}`, "Go to next/previous media"]],
  },
  single("Playback", "toggle-looping", "Toggle looping the scene"),
  single("Playback", "toggle-mute", "Mute/unmute"),

  {
    group: "Scene/Marker Actions",
    actions: ["rate"],
    rows: (context) => [[
      afterRatingKey(context, formatRatingDigitSlots(context.ratingSystem)),
      context.ratingSystem === RatingSystemType.Decimal
        ? `Set decimal rating (e.g. ${code(`${context.keyLabels("rate")[0]} 36`)} for \`3.6\`, use ${code(`${context.keyLabels("rate")[0]} 00`)} for \`10.0\`)`
        : "Set star rating",
    ]],
  },
  single("Scene/Marker Actions", "unset-rating", "Unset rating"),
  single("Scene/Marker Actions", "delete", "Delete the current scene/marker (opens the confirmation dialog with Delete focused, so `Enter` confirms)"),
  single("Scene/Marker Actions", "edit-tags", "Edit scene/marker tags"),
  single("Scene/Marker Actions", "toggle-scene-info", "Toggle scene info"),

  single("Display", "toggle-crt", "Toggle CRT effect"),
  single("Display", "toggle-fullscreen", "Toggle fullscreen"),
  single("Display", "toggle-landscape", "Toggle forced landscape orientation"),
  single("Display", "toggle-pip", "Toggle picture-in-picture"),
  single("Display", "toggle-subtitles", "Toggle subtitles"),
];

const GROUP_NOTES: Partial<Record<ShortcutGroup, string>> = {
  "Scene/Marker Actions": "Ratings set on a marker apply to the marker's scene.",
};

/**
 * The keyboard shortcut list, as markdown: a table for each group of shortcuts, leaving out shortcuts without keys
 */
export function shortcutHelpMarkdown(bindings: ShortcutBindings, ratingSystem: RatingSystemType): string {
  const keyLabels = (actionId: ShortcutActionId) => bindings[actionId].map(formatKeySequence);
  const context: HelpContext = {
    keys: (actionId) => keyLabels(actionId).map(code).join(" or "),
    keyLabels,
    ratingSystem,
  };

  return SHORTCUT_GROUPS.flatMap((group) => {
    const rows = HELP_ENTRIES
      .filter((entry) => entry.group === group && entry.actions.every((actionId) => bindings[actionId].length > 0))
      .flatMap((entry) => entry.rows(context))
      .map(([sequence, description]) => `| ${sequence} | ${description} |`);
    if (!rows.length) return [];
    return [[
      `## ${group}`,
      GROUP_NOTES[group],
      ["| Keyboard sequence | Action |", "| ----------------- | ------ |", ...rows].join("\n"),
    ].filter(Boolean).join("\n\n")];
  }).join("\n\n");
}
