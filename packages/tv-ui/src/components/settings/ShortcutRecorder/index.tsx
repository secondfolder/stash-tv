import React, { useEffect, useRef, useState } from "react";
import type { RatingSystemType } from "stash-ui/dist/src/utils/rating";
import { CommandPalette, CommandPaletteToken } from "../../CommandPalette";
import { useGlobalState } from "../../../store/globalState";
import { useTvConfig } from "../../../store/tvConfig";
import {
  findClashingBindings,
  formatHeldWithKeys,
  heldWithKeys,
  formatRatingDigitSlotList,
  formatShortcut,
  shortcutPatterns,
  type ShortcutBindings,
  type ShortcutClash,
} from "../../../helpers/keyboard-shortcuts/definitions";
import { getShortcutAction, type ShortcutActionId } from "../../../helpers/shortcut-actions/actions";
import {
  comboFromEvent,
  formatKeyCombo,
  keyFromEvent,
  keyOfCombo,
  withoutHeldKeys,
  type KeyCombo,
} from "../../../helpers/keyboard-shortcuts/key-combos";
import { joinKeySequence, parseKeySequence, type KeySequence } from "../../../helpers/keyboard-shortcuts/key-sequences";
import "./ShortcutRecorder.scss";

/**
 * Why a binding clashing with one being given to an action is (or will be) taken away, e.g. `The "p" shortcut for
 * "Toggle picture-in-picture" will be removed as it starts with the same key.`
 */
export function describeClashRemoval(
  clash: ShortcutClash,
  binding: { actionId: ShortcutActionId, sequence: KeySequence },
  ratingSystem: RatingSystemType,
  bindings: ShortcutBindings,
  tense: "will" | "was",
) {
  const title = getShortcutAction(clash.actionId).title;
  const removed = `The "${formatShortcut(clash.actionId, clash.sequence, ratingSystem, bindings)}" shortcut for "${title}" ${tense === "will" ? "will be" : "was"} removed`;
  // The keys they share: all of the shorter one's (the rating's digits included)
  const length = (b: { actionId: ShortcutActionId, sequence: KeySequence }) =>
    shortcutPatterns(b.actionId, b.sequence, ratingSystem, bindings)[0]?.length ?? 0;
  const shared = Math.min(length(clash), length(binding));
  const keys = shared === 1 ? "key" : "keys";
  return clash.clash === "same"
    ? `${removed} as it uses the same ${keys}.`
    : `${removed} as it starts with the same ${keys}.`;
}

/**
 * An action's title continuing a sentence: in lower case, unless it starts with an acronym (e.g. "CRT"), so a sentence
 * using it stays in sentence case
 */
function midSentence(title: string) {
  const firstWord = title.split(/[\s/(]/)[0];
  const isAcronym = firstWord.length > 1 && firstWord === firstWord.toUpperCase();
  return isAcronym ? title : title.charAt(0).toLowerCase() + title.slice(1);
}

/**
 * A command palette recording the keys of one of an action's shortcuts: every key typed is added to the sequence,
 * except Escape (which closes it) and Tab (which moves to its buttons). A key pressed while holding another is a chord
 * with it (← + ↑). A key typed is removed by clicking it. Clashes with other shortcuts are shown as keys
 * are typed, but nothing changes until Done.
 *
 * @see docs/keyboard-shortcuts.md § "Changing shortcuts"
 */
export function ShortcutRecorder({
  actionId,
  initial,
  bindings,
  ratingSystem,
  onSave,
  onClose,
}: {
  actionId: ShortcutActionId;
  /** The sequence being changed, or null for a new one */
  initial: KeySequence | null;
  bindings: ShortcutBindings;
  ratingSystem: RatingSystemType;
  onSave: (sequence: KeySequence) => void;
  onClose: () => void;
}) {
  const forceLandscape = useTvConfig((state) => state.forceLandscape);
  const [combos, setCombos] = useState<KeyCombo[]>(() => initial ? parseKeySequence(initial) : []);
  const { title } = getShortcutAction(actionId);

  // No shortcut fires while it's open
  useEffect(() => {
    const { set } = useGlobalState.getState();
    set("recordingShortcut", true);
    return () => set("recordingShortcut", false);
  }, []);

  // The keys held down in the palette, so a key pressed while holding another is recorded as a chord (← + ↑)
  const heldKeys = useRef(new Set<string>());

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    // Escape closes the palette, and Tab moves to its buttons, so neither can be recorded
    if (event.key === "Escape" || event.key === "Tab") return;
    // Nothing else happens with the key, e.g. Space scrolling
    event.preventDefault();
    if (event.repeat) return;
    // Arrow keys are recorded as they are in portrait, so they do what they were pressed for in either orientation. Keys
    // held that are the fixed part held with these keys (a seek key, for the seek speed) aren't part of them
    const fixedHeld = heldWithKeys(actionId, bindings) ?? [];
    const held = [...heldKeys.current].filter((key) => !fixedHeld.includes(keyFromEvent({ key }, { forceLandscape }) ?? ""));
    const combo = comboFromEvent(event.nativeEvent, { forceLandscape, heldKeys: held });
    heldKeys.current.add(event.key);
    // A modifier pressed on its own is the start of a combo, and a fixed held key is only being held
    if (!combo || fixedHeld.includes(combo)) return;
    setCombos((previous) => {
      // Pressed while holding the key just typed: it becomes a chord with it, in its place
      const last = previous[previous.length - 1];
      const held = [...heldKeys.current].map((key) => keyFromEvent({ key }, { forceLandscape }));
      return last !== undefined && combo !== withoutHeldKeys(combo) && held.includes(keyOfCombo(last))
        ? [...previous.slice(0, -1), combo]
        : [...previous, combo];
    });
  };

  const handleKeyUp = (event: React.KeyboardEvent<HTMLElement>) => {
    heldKeys.current.delete(event.key);
  };

  // The keys typed, and once anything's been typed, the fixed parts of the shortcut that aren't its own keys: before
  // them the keys held while pressing them (a seek key, for the seek speed), and after them the rating's digits
  const heldWith = formatHeldWithKeys(actionId, bindings);
  /** A token in the bar: a key typed (and where in what's been typed), or a fixed part */
  type Token = { comboIndex: number | null, label: string, heldWithNext?: boolean };
  const tokens: Token[] = [
    ...(heldWith && combos.length ? [{ comboIndex: null, label: heldWith, heldWithNext: true }] : []),
    ...combos.map((combo, comboIndex) => ({ comboIndex, label: formatKeyCombo(combo) })),
    ...(actionId === "rate" && combos.length
      ? formatRatingDigitSlotList(ratingSystem).map((label) => ({ comboIndex: null, label }))
      : []),
  ];

  const sequence = joinKeySequence(combos);
  const otherBindings = { ...bindings, [actionId]: bindings[actionId].filter((other) => other !== initial) };
  const alreadyHas = combos.length > 0 && otherBindings[actionId].includes(sequence);
  const clashes = combos.length && !alreadyHas
    ? findClashingBindings({ ...otherBindings, [actionId]: [...otherBindings[actionId], sequence] }, ratingSystem, actionId, sequence)
    : [];

  return <CommandPalette
    show
    onClose={onClose}
    className="ShortcutRecorder"
    label={`Shortcut for "${title}"`}
    placeholder={`Type shortcut to ${midSentence(title)}`}
    inputContent={tokens.map((token, index) => (
      <React.Fragment key={index}>
        {/* The keys are typed one after another, but the keys held with them are held while pressing them */}
        {index > 0 && <span className="shortcut-recorder-then">{tokens[index - 1].heldWithNext ? "+" : " then "}</span>}
        {token.comboIndex === null
          ? <CommandPaletteToken className="shortcut-recorder-key">{token.label}</CommandPaletteToken>
          : <CommandPaletteToken
            className="shortcut-recorder-key"
            removeLabel={`Remove ${token.label}`}
            onRemove={() => setCombos((previous) => previous.filter((_, other) => other !== token.comboIndex))}
          >
            {token.label}
          </CommandPaletteToken>}
      </React.Fragment>
    ))}
    onInputKeyDown={handleKeyDown}
    onInputKeyUp={handleKeyUp}
    status={alreadyHas
      ? <span className="text-muted">Already one of this shortcut's keys.</span>
      : clashes.map((clash) => (
        <span key={`${clash.actionId} ${clash.sequence}`} className="shortcut-recorder-warning text-warning">
          {describeClashRemoval(clash, { actionId, sequence }, ratingSystem, bindings, "will")}
        </span>
      ))}
    actions={[
      { label: "Cancel", onClick: onClose },
      // In the warnings' colour when Done will take keys from other shortcuts
      { label: "Done", variant: clashes.length ? "warning" : "primary", onClick: () => onSave(sequence), disabled: !combos.length },
    ]}
  />;
}
