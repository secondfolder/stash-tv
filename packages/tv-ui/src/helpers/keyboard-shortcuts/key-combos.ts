/**
 * Key combos: how a key press is written down for a shortcut binding, and how a key event is matched against one.
 *
 * A combo is a normalised string: any modifiers (`Ctrl`, `Alt`, `Meta`, `Shift`, in that order), then any other keys
 * held down while it's pressed (in alphabetical order), then the key, joined with `+`. E.g. `d`, `Shift+d`,
 * `Ctrl+Alt+k`, `Space`, `ArrowUp`, `?`, `ArrowLeft+ArrowUp` (↑ pressed while holding ←). Keys are
 * `KeyboardEvent.key`, so they follow the user's keyboard layout, with these rules:
 * - Letters are lower case, with Shift written explicitly (`Shift+d` rather than `D`)
 * - Other characters already say whether Shift was held (`?` rather than `Shift+/`), so Shift isn't written for them
 * - The space bar is `Space`
 *
 * @see docs/keyboard-shortcuts.md § "Key combos"
 */

export type KeyCombo = string;

const MODIFIERS = ["Ctrl", "Alt", "Meta", "Shift"] as const;
type Modifier = typeof MODIFIERS[number];

const MODIFIER_KEYS = new Set(["Control", "Alt", "AltGraph", "Meta", "Shift", "OS", "Hyper", "Super", "CapsLock", "Fn", "FnLock"]);

/** Whether a key is a letter, which has upper and lower case forms */
function isLetter(key: string) {
  return key.length === 1 && key.toLowerCase() !== key.toUpperCase();
}

/** An event's key, normalised the way combos write it (without any modifiers) */
export function normaliseKey(key: string): string {
  if (key === " " || key === "Spacebar") return "Space";
  if (isLetter(key)) return key.toLowerCase();
  return key;
}

/**
 * Arrow keys pressed in forced landscape, turned back into what they'd be in portrait. The screen is turned 90°
 * counter-clockwise, so → points down the feed and ← up it. Bindings are always in portrait terms.
 */
const LANDSCAPE_ARROWS: Record<string, string> = {
  ArrowRight: "ArrowDown",
  ArrowLeft: "ArrowUp",
  ArrowUp: "ArrowRight",
  ArrowDown: "ArrowLeft",
};

export function rotateForLandscape(key: string): string {
  return LANDSCAPE_ARROWS[key] ?? key;
}

type KeyEventLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey">;

/** The key an event is for, normalised, and turned for forced landscape. Null for a modifier pressed on its own. */
export function keyFromEvent(event: Pick<KeyboardEvent, "key">, { forceLandscape = false } = {}): string | null {
  if (!event.key || MODIFIER_KEYS.has(event.key) || event.key === "Unidentified" || event.key === "Dead") return null;
  const key = normaliseKey(event.key);
  return forceLandscape ? rotateForLandscape(key) : key;
}

/**
 * The combo an event is for, given the other keys held down when it happened (as `KeyboardEvent.key`s; modifiers and
 * the event's own key are left out). Null for a modifier pressed on its own.
 */
export function comboFromEvent(
  event: KeyEventLike,
  { forceLandscape = false, heldKeys = [] }: { forceLandscape?: boolean, heldKeys?: Iterable<string> } = {},
): KeyCombo | null {
  const key = keyFromEvent(event, { forceLandscape });
  if (!key) return null;
  const modifiersHeld: Record<Modifier, boolean> = {
    Ctrl: event.ctrlKey,
    Alt: event.altKey,
    Meta: event.metaKey,
    // A character other than a letter already shows whether Shift was held
    Shift: event.shiftKey && (key.length > 1 || isLetter(key)),
  };
  const otherKeysHeld = [...new Set([...heldKeys]
    .map((heldKey) => keyFromEvent({ key: heldKey }, { forceLandscape }))
    .filter((heldKey): heldKey is string => heldKey !== null && heldKey !== key))]
    .sort();
  return [...MODIFIERS.filter((modifier) => modifiersHeld[modifier]), ...otherKeysHeld, key].join("+");
}

/** A combo's parts: its modifiers, the other keys held, and the key */
function parseCombo(combo: KeyCombo): { modifiers: Modifier[], heldKeys: string[], key: string } {
  // `+` itself is a key, written as the last part after an empty one (e.g. `Shift++` splits to "Shift", "", "")
  const endsWithPlus = combo === "+" || combo.endsWith("++");
  const parts = (endsWithPlus ? combo.slice(0, -1) : combo).split("+").filter(Boolean);
  const key = endsWithPlus ? "+" : parts.pop() ?? "";
  const isModifier = (part: string): part is Modifier => (MODIFIERS as readonly string[]).includes(part);
  return {
    modifiers: MODIFIERS.filter((modifier) => parts.includes(modifier)),
    heldKeys: parts.filter((part) => !isModifier(part)),
    key,
  };
}

/** A combo's key, without its modifiers or the other keys held */
export function keyOfCombo(combo: KeyCombo): string {
  return parseCombo(combo).key;
}

/** A combo pressed while also holding a key, e.g. `Shift+g+d` for `Shift+d` held with `g` */
export function withHeldKey(combo: KeyCombo, heldKey: string): KeyCombo {
  const { modifiers, heldKeys, key } = parseCombo(combo);
  if (heldKey === key) return combo;
  return [...modifiers, ...[...new Set([...heldKeys, heldKey])].sort(), key].join("+");
}

/** A combo without the other keys held while it's pressed, e.g. `Shift+d` for `Shift+g+d` */
export function withoutHeldKeys(combo: KeyCombo): KeyCombo {
  const { modifiers, key } = parseCombo(combo);
  return [...modifiers, key].join("+");
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");

const MODIFIER_LABELS: Record<Modifier, string> = isMac
  ? { Ctrl: "⌃", Alt: "⌥", Meta: "⌘", Shift: "⇧" }
  : { Ctrl: "Ctrl", Alt: "Alt", Meta: "Meta", Shift: "Shift" };

const KEY_LABELS: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
};

/**
 * How a combo is shown to the user, e.g. `d`, `Shift + d`, `←`, `Space`, `← + ↑`. Letters stay lower case, as in
 * Stash's own shortcut list, so an upper case letter is never mistaken for one needing Shift.
 */
export function formatKeyCombo(combo: KeyCombo): string {
  return formatKeyComboParts(combo).join(" + ");
}

/**
 * The labels of a combo's parts, pressed together: its modifiers, the other keys held, and the key (e.g. `Shift`,
 * `d`). On a Mac, its modifiers' symbols are joined onto the part after them, as macOS shows them (`⇧d`).
 */
export function formatKeyComboParts(combo: KeyCombo): string[] {
  const { modifiers, heldKeys, key } = parseCombo(combo);
  const keys = [...heldKeys, key].map((part) => KEY_LABELS[part] ?? part);
  const modifierLabels = modifiers.map((modifier) => MODIFIER_LABELS[modifier]);
  if (!isMac) return [...modifierLabels, ...keys];
  return [modifierLabels.join("") + keys[0], ...keys.slice(1)];
}

/**
 * Whether an event comes from somewhere the user is typing or adjusting a value (a text field, a select, a slider…),
 * where keys must do what they normally do there rather than trigger a shortcut.
 */
export function isTypingTarget(event: Pick<Event, "target">): boolean {
  const target = event.target;
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && (target.isContentEditable || target.getAttribute("role") === "slider"));
}
