import React from "react";
import type { RatingSystemType } from "stash-ui/dist/src/utils/rating";
import {
  formatHeldWithKeys,
  formatRatingDigitSlots,
  type ShortcutBindings,
} from "../../../helpers/keyboard-shortcuts/definitions";
import type { ShortcutActionId } from "../../../helpers/shortcut-actions/actions";
import { formatKeyComboParts } from "../../../helpers/keyboard-shortcuts/key-combos";
import { parseKeySequence, type KeySequence } from "../../../helpers/keyboard-shortcuts/key-sequences";
import "./ShortcutKeys.scss";

/**
 * A shortcut's keys as the settings show them: each combo of the sequence separated by a space, with the parts pressed
 * together joined by a faint `+` (not a key itself), e.g. `Shift+d`, `←+↑ g`. The keys held while pressing them (a
 * seek key, for the seek speed) come before them, e.g. `{←/→}+↑`, and the rating's digits after.
 *
 * @see docs/keyboard-shortcuts.md § "Changing shortcuts"
 */
export function ShortcutKeys({ actionId, sequence, ratingSystem, bindings }: {
  actionId: ShortcutActionId;
  sequence: KeySequence;
  ratingSystem: RatingSystemType;
  bindings: ShortcutBindings;
}) {
  const heldWith = formatHeldWithKeys(actionId, bindings);
  return <span className="ShortcutKeys">
    {heldWith && <>{heldWith}<span className="shortcut-keys-joiner">+</span></>}
    {parseKeySequence(sequence).map((combo, comboIndex) => (
      <React.Fragment key={comboIndex}>
        {comboIndex > 0 && " "}
        {formatKeyComboParts(combo).map((part, partIndex) => (
          <React.Fragment key={partIndex}>
            {partIndex > 0 && <span className="shortcut-keys-joiner">+</span>}
            {part}
          </React.Fragment>
        ))}
      </React.Fragment>
    ))}
    {actionId === "rate" && ` ${formatRatingDigitSlots(ratingSystem)}`}
  </span>;
}
