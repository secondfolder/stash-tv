import { formatKeyCombo, keyOfCombo, type KeyCombo } from "./key-combos";

/**
 * Key sequences: what a shortcut binding is. One or more key combos pressed one after another, written Mousetrap
 * style with a space between them, e.g. `d`, `g i`, `Ctrl+k s`. The space bar is written `Space`, so a space always
 * separates combos.
 *
 * @see docs/keyboard-shortcuts.md § "Key sequences"
 */

export type KeySequence = string;

export function parseKeySequence(sequence: KeySequence): KeyCombo[] {
  return sequence.split(" ").filter(Boolean);
}

export function joinKeySequence(combos: readonly KeyCombo[]): KeySequence {
  return combos.join(" ");
}

/** How a sequence is shown to the user, e.g. `g i`, `Shift + d`, `←` */
export function formatKeySequence(sequence: KeySequence): string {
  return parseKeySequence(sequence).map(formatKeyCombo).join(" ");
}

/** The key of a sequence's last combo, without its modifiers: the one held down to hold the shortcut */
export function lastKeyOfSequence(sequence: KeySequence): string {
  const combos = parseKeySequence(sequence);
  return keyOfCombo(combos[combos.length - 1] ?? "");
}
