import { useEffect, useMemo } from "react";
import { useConfigurationContext } from "stash-ui/dist/src/hooks/Config";
import { defaultRatingSystemOptions } from "stash-ui/dist/src/utils/rating";
import { useTvConfig } from "../store/tvConfig";
import { useGlobalState } from "../store/globalState";
import {
  comboMatchesStep,
  resolveShortcutBindings,
  shortcutPatterns,
  type ShortcutBindings,
} from "../helpers/keyboard-shortcuts/definitions";
import { SHORTCUT_ACTION_IDS, type ShortcutActionId } from "../helpers/shortcut-actions/actions";
import {
  comboFromEvent,
  isTypingTarget,
  keyFromEvent,
  keyOfCombo,
  withoutHeldKeys,
  type KeyCombo,
} from "../helpers/keyboard-shortcuts/key-combos";
import { lastKeyOfSequence } from "../helpers/keyboard-shortcuts/key-sequences";

/**
 * The user's keyboard shortcuts, and matching key events against them.
 *
 * Listeners match with `matchShortcut()` when the event happens, which reads the latest bindings (and whether the
 * screen is in forced landscape) from the store, so they needn't be re-added when the user changes a binding.
 *
 * @see docs/keyboard-shortcuts.md § "Matching"
 */

/** Every action's key sequences, re-rendering when the user changes them */
export function useShortcutBindings(): ShortcutBindings {
  const overrides = useTvConfig((state) => state.keyboardShortcuts);
  const ratingSystem = useGlobalState((state) => state.ratingSystem);
  return useMemo(() => resolveShortcutBindings(overrides, ratingSystem), [overrides, ratingSystem]);
}

/** Every action's key sequences, as they are now */
export function getShortcutBindings(): ShortcutBindings {
  return resolveShortcutBindings(useTvConfig.getState().keyboardShortcuts, useGlobalState.getState().ratingSystem);
}

/** Keeps `globalState.ratingSystem` in step with Stash's configuration, for matching shortcuts outside React */
export function useSyncRatingSystem() {
  const { configuration } = useConfigurationContext();
  const ratingSystem = configuration?.ui?.ratingSystemOptions?.type ?? defaultRatingSystemOptions.type;
  useEffect(() => {
    useGlobalState.getState().set("ratingSystem", ratingSystem);
  }, [ratingSystem]);
}

/* ------------------------------- Held keys -------------------------------- */

/** The keys held down now (`KeyboardEvent.key`s), so a key pressed while holding another can match a chord (`← + ↑`) */
const heldKeys = new Set<string>();

/**
 * Keeps track of the keys held down, until the function returned is called. Called once for the app, by
 * `useHeldKeyTracking`.
 */
export function trackHeldKeys(): () => void {
  const handleKeyDown = (event: KeyboardEvent) => {
    heldKeys.add(event.key);
  };
  const handleKeyUp = (event: KeyboardEvent) => {
    heldKeys.delete(event.key);
    // On macOS no other key's release comes while ⌘ is held, so they'd look held for good
    if (event.key === "Meta") heldKeys.clear();
  };
  // Keys let go of while the page didn't have focus never send their release
  const forget = () => heldKeys.clear();
  window.addEventListener("keydown", handleKeyDown, { capture: true });
  window.addEventListener("keyup", handleKeyUp, { capture: true });
  window.addEventListener("blur", forget);
  return () => {
    window.removeEventListener("keydown", handleKeyDown, { capture: true });
    window.removeEventListener("keyup", handleKeyUp, { capture: true });
    window.removeEventListener("blur", forget);
    forget();
  };
}

/** Keeps track of the keys held down, for shortcuts that are keys pressed while holding another */
export function useHeldKeyTracking() {
  useEffect(() => trackHeldKeys(), []);
}

/* -------------------------------- Tracker --------------------------------- */

/** How long the next key of a sequence may take */
const SEQUENCE_KEY_TIMEOUT_MS = 1000;

/** What a key press is for: the actions whose sequences it completed, and the digits typed into the rating's */
type Resolution = { actions: ReadonlySet<ShortcutActionId>, digits: string[] };
const NOTHING: Resolution = { actions: new Set(), digits: [] };

/** Each key press's resolution, worked out by the first listener to ask, so every listener gets the same one */
const resolutions = new WeakMap<KeyboardEvent, Resolution>();
/** The combos typed so far of a sequence not yet complete */
let typed: KeyCombo[] = [];
let sequenceTimeout: ReturnType<typeof setTimeout> | undefined;
/** The key that completed the last match, and what it matched, so its repeats while it's held match the same */
let lastMatch: { key: string, resolution: Resolution } | null = null;

/**
 * Forgets a sequence part way through. ⚠️ Keep the name: the integration tests hold the window for a sequence's next key
 * open by recognising this function handed to `setTimeout` (test/integration/helpers/keyboard-rating.ts)
 */
function endSequence() {
  typed = [];
}

function resetSequence() {
  clearTimeout(sequenceTimeout);
  endSequence();
}

/** What the combos typed complete or start, if anything */
function attempt(combos: KeyCombo[]): Resolution | "started" | null {
  const bindings = getShortcutBindings();
  const ratingSystem = useGlobalState.getState().ratingSystem;
  const actions = new Set<ShortcutActionId>();
  let digits: string[] = [];
  let started = false;
  for (const actionId of SHORTCUT_ACTION_IDS) {
    for (const sequence of bindings[actionId]) {
      for (const pattern of shortcutPatterns(actionId, sequence, ratingSystem, bindings)) {
        if (combos.length > pattern.length || !combos.every((combo, index) => comboMatchesStep(combo, pattern[index]))) continue;
        if (combos.length < pattern.length) {
          started = true;
          continue;
        }
        actions.add(actionId);
        if (actionId === "rate") digits = combos.filter((_, index) => "digits" in pattern[index]);
      }
    }
  }
  // A complete match wins over waiting for a longer one (the settings don't let one sequence start another)
  return actions.size ? { actions, digits } : started ? "started" : null;
}

function resolve(event: KeyboardEvent): Resolution {
  if (useGlobalState.getState().recordingShortcut || isTypingTarget(event)) return NOTHING;
  const chord = comboFromEvent(event, { forceLandscape: useTvConfig.getState().forceLandscape, heldKeys });
  // A modifier pressed on its own may be the start of a combo
  if (!chord) return NOTHING;
  if (event.repeat && lastMatch?.key === keyOfCombo(chord)) return lastMatch.resolution;
  lastMatch = null;

  // The key with the other keys held (a chord, like ← + ↑), but if no shortcut has that chord, the key on its own: the
  // last key of a sequence often goes down before the one before it comes up when typing quickly
  const plain = withoutHeldKeys(chord);
  const combos = plain === chord ? [chord] : [chord, plain];
  // Either the key carries on the sequence typed so far, or, if it doesn't, it may start a new one
  const candidates = combos.flatMap((combo) => typed.length ? [[...typed, combo], [combo]] : [[combo]]);
  for (const candidate of candidates) {
    const result = attempt(candidate);
    if (result === "started") {
      typed = candidate;
      clearTimeout(sequenceTimeout);
      sequenceTimeout = setTimeout(endSequence, SEQUENCE_KEY_TIMEOUT_MS);
      // The rest would otherwise reach the video player if it has focus, which seeks with digits
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
      return NOTHING;
    }
    if (result) {
      resetSequence();
      lastMatch = { key: keyOfCombo(chord), resolution: result };
      return result;
    }
  }
  resetSequence();
  return NOTHING;
}

function resolutionOf(event: KeyboardEvent): Resolution {
  let resolution = resolutions.get(event);
  if (!resolution) {
    resolution = resolve(event);
    resolutions.set(event, resolution);
  }
  return resolution;
}

/**
 * Which of the given actions a key press is for, or null for none: the first whose sequence it completes. Arrow keys
 * pressed in forced landscape count as the arrow they'd be in portrait. Never matches while typing in a text field
 * or while a shortcut's key is being recorded in the settings.
 */
export function matchShortcut<Id extends ShortcutActionId>(event: KeyboardEvent, actionIds: readonly Id[]): Id | null {
  const { actions } = resolutionOf(event);
  return actionIds.find((actionId) => actions.has(actionId)) ?? null;
}

/** The digits typed into the rating's sequence, for a key press completing it */
export function shortcutDigits(event: KeyboardEvent): string[] {
  return resolutionOf(event).digits;
}

/**
 * Which of the given actions a key release is for, or null for none: the first with a sequence ending in the key.
 * Only the key counts, not the modifiers held, so a held shortcut still ends if a modifier is let go of first.
 */
export function matchShortcutKey<Id extends ShortcutActionId>(event: KeyboardEvent, actionIds: readonly Id[]): Id | null {
  const key = keyFromEvent(event, { forceLandscape: useTvConfig.getState().forceLandscape });
  if (!key) return null;
  const bindings = getShortcutBindings();
  return actionIds.find((actionId) => bindings[actionId].some((sequence) => lastKeyOfSequence(sequence) === key)) ?? null;
}
