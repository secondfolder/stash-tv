import { RatingSystemType } from "stash-ui/dist/src/utils/rating";
import { formatKeyCombo, withHeldKey, type KeyCombo } from "./key-combos";
import { formatKeySequence, lastKeyOfSequence, parseKeySequence, type KeySequence } from "./key-sequences";

/**
 * Every keyboard shortcut action: what it's called in the settings, the keys it has by default and when it applies.
 * Adding a shortcut means adding it here (and to the help rows in `KeyboardShortcutsInfo`).
 *
 * @see docs/keyboard-shortcuts.md
 */

export const SHORTCUT_GROUPS = ["General", "Playback", "Scene/Marker Actions", "Display"] as const;
export type ShortcutGroup = typeof SHORTCUT_GROUPS[number];

type ShortcutDefinition<ActionId extends string = ShortcutActionId> = {
  group: ShortcutGroup;
  /** What the settings call it */
  title: string;
  /** Its keys by default: the same for every rating system, or one set for each */
  defaults: readonly KeySequence[] | Readonly<Record<RatingSystemType, readonly KeySequence[]>>;
  /**
   * Actions whose keys are held down while pressing this one's: its keys are pressed while holding the last key of
   * any of theirs. That part follows those actions' keys, so it isn't part of this one's own (as the rating's digits
   * aren't)
   */
  heldWith?: readonly ActionId[];
};

export const SHORTCUT_DEFINITIONS = {
  "show-shortcuts": { group: "General", title: "Show keyboard shortcuts", defaults: ["?"] },
  "play-pause": { group: "Playback", title: "Play/pause", defaults: ["Space"] },
  "seek-backwards": { group: "Playback", title: "Jump backwards (hold to rewind)", defaults: ["ArrowLeft"] },
  "seek-forwards": { group: "Playback", title: "Jump forwards (hold to fast forward)", defaults: ["ArrowRight"] },
  // Pressed while holding a seek key: they only do anything while rewinding or fast forwarding
  "seek-faster": {
    group: "Playback",
    title: "Speed up while rewinding/fast forwarding",
    defaults: ["ArrowUp"],
    heldWith: ["seek-backwards", "seek-forwards"],
  },
  "seek-slower": {
    group: "Playback",
    title: "Slow down while rewinding/fast forwarding",
    defaults: ["ArrowDown"],
    heldWith: ["seek-backwards", "seek-forwards"],
  },
  "next": { group: "Playback", title: "Go to next media", defaults: ["ArrowDown"] },
  "previous": { group: "Playback", title: "Go to previous media", defaults: ["ArrowUp"] },
  "toggle-looping": { group: "Playback", title: "Toggle looping", defaults: ["l"] },
  "toggle-mute": { group: "Playback", title: "Mute/unmute", defaults: ["m"] },
  "rate": { group: "Scene/Marker Actions", title: "Rate", defaults: ["r"] },
  "unset-rating": {
    group: "Scene/Marker Actions",
    title: "Unset rating",
    // `r 0` would start a decimal rating of `r 0 0` (10.0)
    defaults: { [RatingSystemType.Stars]: ["r 0"], [RatingSystemType.Decimal]: ["r `"] },
  },
  "delete": { group: "Scene/Marker Actions", title: "Delete scene/marker", defaults: ["d"] },
  "edit-tags": { group: "Scene/Marker Actions", title: "Edit tags", defaults: ["e"] },
  "toggle-scene-info": { group: "Scene/Marker Actions", title: "Toggle scene info", defaults: ["i"] },
  "toggle-crt": { group: "Display", title: "Toggle CRT effect", defaults: ["c"] },
  "toggle-fullscreen": { group: "Display", title: "Toggle fullscreen", defaults: ["f"] },
  "toggle-landscape": { group: "Display", title: "Toggle forced landscape", defaults: ["o"] },
  "toggle-pip": { group: "Display", title: "Toggle picture-in-picture", defaults: ["p"] },
  "toggle-subtitles": { group: "Display", title: "Toggle subtitles", defaults: ["s"] },
} as const satisfies Record<string, ShortcutDefinition<string>>;

export type ShortcutActionId = keyof typeof SHORTCUT_DEFINITIONS;

/** Each action's key sequences */
export type ShortcutBindings = Record<ShortcutActionId, readonly KeySequence[]>;

/** The user's changes to the default bindings: only the actions they've changed */
export type ShortcutBindingOverrides = Partial<Record<ShortcutActionId, KeySequence[]>>;

export const SHORTCUT_ACTION_IDS = Object.keys(SHORTCUT_DEFINITIONS) as ShortcutActionId[];

export function getShortcutDefinition(actionId: ShortcutActionId): ShortcutDefinition {
  return SHORTCUT_DEFINITIONS[actionId];
}

/** An action's default keys with the given rating system */
export function defaultShortcutBindings(actionId: ShortcutActionId, ratingSystem: RatingSystemType): readonly KeySequence[] {
  const defaults = getShortcutDefinition(actionId).defaults;
  return Array.isArray(defaults) ? defaults : (defaults as Record<RatingSystemType, readonly KeySequence[]>)[ratingSystem];
}

/** Every action's keys: the user's where they've changed them, otherwise the defaults */
export function resolveShortcutBindings(
  overrides: ShortcutBindingOverrides,
  ratingSystem: RatingSystemType,
): ShortcutBindings {
  const bindings: Partial<ShortcutBindings> = {};
  for (const actionId of SHORTCUT_ACTION_IDS) {
    bindings[actionId] = overrides[actionId] ?? defaultShortcutBindings(actionId, ratingSystem);
  }
  return bindings as ShortcutBindings;
}

/**
 * The overrides with an action's keys changed. An action given its defaults is left out, so it follows any later
 * change to them (and, for the defaults that depend on it, to the rating system).
 */
export function withActionBindings(
  overrides: ShortcutBindingOverrides,
  actionId: ShortcutActionId,
  sequences: readonly KeySequence[],
  ratingSystem: RatingSystemType,
): ShortcutBindingOverrides {
  const { [actionId]: _previous, ...others } = overrides;
  const defaults = defaultShortcutBindings(actionId, ratingSystem);
  const isDefault = sequences.length === defaults.length && sequences.every((sequence, index) => sequence === defaults[index]);
  return isDefault ? others : { ...others, [actionId]: [...sequences] };
}

/* --------------------------------- Rating --------------------------------- */

/** The digits typed after the rating action's keys: one 1–5 for stars, or two 0–9 for decimal */
export function ratingDigitSlots(ratingSystem: RatingSystemType): readonly (readonly string[])[] {
  const digits = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => String(from + index));
  return ratingSystem === RatingSystemType.Decimal ? [digits(0, 9), digits(0, 9)] : [digits(1, 5)];
}

/** How each digit typed after the rating action's keys is shown, e.g. `{1-5}` */
export function formatRatingDigitSlotList(ratingSystem: RatingSystemType): string[] {
  return ratingDigitSlots(ratingSystem).map((digits) => `{${digits[0]}-${digits[digits.length - 1]}}`);
}

/** How the digits typed after the rating action's keys are shown, e.g. `{1-5}` or `{0-9} {0-9}` */
export function formatRatingDigitSlots(ratingSystem: RatingSystemType): string {
  return formatRatingDigitSlotList(ratingSystem).join(" ");
}

/* ------------------------------ Key patterns ------------------------------ */

/** One step of what's typed for a shortcut: a combo, or a digit (any of those given) */
export type KeyPatternStep = { combo: KeyCombo } | { digits: readonly string[] };

/** The keys held while pressing an action's keys, if it has any: the last key of each of its `heldWith` actions' keys */
export function heldWithKeys(actionId: ShortcutActionId, bindings: ShortcutBindings): string[] | null {
  const heldWith = getShortcutDefinition(actionId).heldWith;
  if (!heldWith) return null;
  return [...new Set(heldWith.flatMap((otherId) => bindings[otherId].map(lastKeyOfSequence)))];
}

/**
 * Everything typed for one of an action's sequences, in each of the ways it can be: the sequence, pressed while
 * holding each of its `heldWith` keys (one way for each), then for the rating action its digits. None for an action
 * held with actions that have no keys.
 */
export function shortcutPatterns(
  actionId: ShortcutActionId,
  sequence: KeySequence,
  ratingSystem: RatingSystemType,
  bindings: ShortcutBindings,
): KeyPatternStep[][] {
  const digits: KeyPatternStep[] = actionId === "rate"
    ? ratingDigitSlots(ratingSystem).map((slot) => ({ digits: slot }))
    : [];
  const combos = parseKeySequence(sequence);
  const heldKeys = heldWithKeys(actionId, bindings);
  const comboSets = heldKeys ? heldKeys.map((held) => combos.map((combo) => withHeldKey(combo, held))) : [combos];
  return comboSets.map((set) => [...set.map((combo) => ({ combo })), ...digits]);
}

/** Whether a combo typed matches a step */
export function comboMatchesStep(combo: KeyCombo, step: KeyPatternStep): boolean {
  return "combo" in step ? step.combo === combo : step.digits.includes(combo);
}

/** Whether something could be typed that matches both steps */
function stepsOverlap(a: KeyPatternStep, b: KeyPatternStep): boolean {
  if ("combo" in a) return comboMatchesStep(a.combo, b);
  if ("combo" in b) return comboMatchesStep(b.combo, a);
  return a.digits.some((digit) => b.digits.includes(digit));
}

/**
 * How two patterns clash, if they do: "same" when one thing typed would match both, "starts" when everything that
 * matches the first starts what matches the second (so the second could never be typed: the first matches first),
 * "started-by" the other way round.
 */
export function patternClash(a: KeyPatternStep[], b: KeyPatternStep[]): "same" | "starts" | "started-by" | null {
  const shared = Math.min(a.length, b.length);
  for (let index = 0; index < shared; index++) {
    if (!stepsOverlap(a[index], b[index])) return null;
  }
  return a.length === b.length ? "same" : a.length < b.length ? "starts" : "started-by";
}

export type ShortcutClash = {
  actionId: ShortcutActionId;
  sequence: KeySequence;
  clash: "same" | "starts" | "started-by";
};

/**
 * The bindings that would clash with giving an action a sequence: exactly the same keys, or a sequence starting
 * another (whatever was meant, the shorter one matches first).
 */
export function findClashingBindings(
  bindings: ShortcutBindings,
  ratingSystem: RatingSystemType,
  actionId: ShortcutActionId,
  sequence: KeySequence,
): ShortcutClash[] {
  const patterns = shortcutPatterns(actionId, sequence, ratingSystem, bindings);
  return SHORTCUT_ACTION_IDS.flatMap((otherId) => bindings[otherId].flatMap((otherSequence): ShortcutClash[] => {
    if (otherId === actionId && otherSequence === sequence) return [];
    const otherPatterns = shortcutPatterns(otherId, otherSequence, ratingSystem, bindings);
    const clash = patterns.flatMap((pattern) => otherPatterns.map((other) => patternClash(pattern, other))).find(Boolean);
    return clash ? [{ actionId: otherId, sequence: otherSequence, clash }] : [];
  }));
}

/** How the keys held while pressing an action's are shown, e.g. `{←/→}`, or null if it has none */
export function formatHeldWithKeys(actionId: ShortcutActionId, bindings: ShortcutBindings): string | null {
  const heldKeys = heldWithKeys(actionId, bindings);
  if (!heldKeys) return null;
  return `{${heldKeys.map((key) => formatKeyCombo(key)).join("/")}}`;
}

/** How a binding is shown to the user, with the keys held while pressing it (`{←/→}+↑`) and the rating's digits */
export function formatShortcut(
  actionId: ShortcutActionId,
  sequence: KeySequence,
  ratingSystem: RatingSystemType,
  bindings: ShortcutBindings,
): string {
  const held = formatHeldWithKeys(actionId, bindings);
  const keys = `${held ? `${held}+` : ""}${formatKeySequence(sequence)}`;
  return actionId === "rate" ? `${keys} ${formatRatingDigitSlots(ratingSystem)}` : keys;
}

/**
 * Each action's bindings that clash with another binding, described. Changing keys in the settings never leaves a
 * clash, but one can come about without that, e.g. when Stash's rating system changes.
 */
export function describeClashes(
  bindings: ShortcutBindings,
  ratingSystem: RatingSystemType,
): Partial<Record<ShortcutActionId, string[]>> {
  const described: Partial<Record<ShortcutActionId, string[]>> = {};
  for (const actionId of SHORTCUT_ACTION_IDS) {
    for (const sequence of bindings[actionId]) {
      const shown = formatShortcut(actionId, sequence, ratingSystem, bindings);
      for (const other of findClashingBindings(bindings, ratingSystem, actionId, sequence)) {
        const otherShown = formatShortcut(other.actionId, other.sequence, ratingSystem, bindings);
        const otherTitle = getShortcutDefinition(other.actionId).title;
        (described[actionId] ??= []).push({
          same: `${shown} is also "${otherTitle}"'s key.`,
          starts: `${shown} starts ${otherShown} ("${otherTitle}"), so one of them needs changing.`,
          "started-by": `${otherShown} ("${otherTitle}") starts ${shown}, so one of them needs changing.`,
        }[other.clash]);
      }
    }
  }
  return described;
}
