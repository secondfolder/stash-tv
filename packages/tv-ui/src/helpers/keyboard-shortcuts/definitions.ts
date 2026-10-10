import { RatingSystemType } from "stash-ui/dist/src/utils/rating";
import { formatKeyCombo, withHeldKey, type KeyCombo } from "./key-combos";
import { formatKeySequence, lastKeyOfSequence, parseKeySequence, type KeySequence } from "./key-sequences";
import { getShortcutAction, SHORTCUT_ACTION_IDS, type ShortcutActionId } from "../shortcut-actions/actions";

/**
 * Each shortcut action's keys by default. The actions themselves (titles, groups, `heldWith`) are in
 * `shortcut-actions/actions.ts`, shared with the gamepad.
 *
 * @see docs/keyboard-shortcuts.md
 */

/** Its keys by default: the same for every rating system, or one set for each */
type KeyboardDefaults = readonly KeySequence[] | Readonly<Record<RatingSystemType, readonly KeySequence[]>>;

export const KEYBOARD_DEFAULTS = {
  "show-shortcuts": ["?"],
  "play-pause": ["Space"],
  "seek-backwards": ["ArrowLeft"],
  "seek-forwards": ["ArrowRight"],
  // Pressed while holding a seek key (see their `heldWith`), so ↑ alone is still the previous media
  "seek-faster": ["ArrowUp"],
  "seek-slower": ["ArrowDown"],
  "next": ["ArrowDown"],
  "previous": ["ArrowUp"],
  "toggle-looping": ["l"],
  "toggle-mute": ["m"],
  "rate": ["r"],
  // `r 0` would start a decimal rating of `r 0 0` (10.0)
  "unset-rating": { [RatingSystemType.Stars]: ["r 0"], [RatingSystemType.Decimal]: ["r `"] },
  "delete": ["d"],
  "edit-tags": ["e"],
  "toggle-scene-info": ["i"],
  "toggle-crt": ["c"],
  "toggle-fullscreen": ["f"],
  "toggle-landscape": ["o"],
  "toggle-pip": ["p"],
  "toggle-subtitles": ["s"],
} as const satisfies Record<ShortcutActionId, KeyboardDefaults>;

/** Each action's key sequences */
export type ShortcutBindings = Record<ShortcutActionId, readonly KeySequence[]>;

/** The user's changes to the default bindings: only the actions they've changed */
export type ShortcutBindingOverrides = Partial<Record<ShortcutActionId, KeySequence[]>>;

/** An action's default keys with the given rating system */
export function defaultShortcutBindings(actionId: ShortcutActionId, ratingSystem: RatingSystemType): readonly KeySequence[] {
  const defaults: KeyboardDefaults = KEYBOARD_DEFAULTS[actionId];
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
  const heldWith = getShortcutAction(actionId).heldWith;
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
        const otherTitle = getShortcutAction(other.actionId).title;
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
