> Frozen implementation plan, written 2026-10-09 before implementation. Deviations are marked inline. Follows [configurable keyboard shortcuts](2026-10-09-configurable-keyboard-shortcuts.md).

# Keyboard shortcut sequences

## Context

Configurable shortcuts are built (uncommitted): each action has a list of key combos (`Shift+d`, `?`…), and rating is a special case with its own module-level "window" (`rating-sequence.ts`) after the `r` key.

The user wants any action to take either a single combo or a Mousetrap-style **sequence** (`g i`, `Ctrl+k s`).

Decisions made with the user:
- **UI is option 1, "then…":**
  - **+** records one combo and finishes the moment it's pressed, as now.
  - A **then…** button next to a chip adds a next key to it.
- **Rating** shows its number range at the end of its chips, read-only (`r {1-5}`, `r {0-9} {0-9}`), so it's clear a number follows. Only the part before the range can be edited, and it can itself be a sequence.
- **Unsetting the rating** becomes a separate action, an ordinary sequence, for both rating systems.

## Design

### 1. Bindings are sequences

**Format**
- A binding becomes a `KeySequence`: combos separated by spaces, Mousetrap style.
  - E.g. `d`, `g i`, `Ctrl+k s`.
  - The space bar is `Space`, so a space always separates combos.
- Existing single-combo bindings are already valid sequences, so nothing needs migrating. Nothing is released yet anyway.

**Helpers** in `key-combos.ts` (or a new `key-sequences.ts` beside it): _(Deviation, 2026-10-09, Claude: they're in a new `key-sequences.ts`.)_
- `parseSequence` / `formatKeySequence`: labels joined with spaces, e.g. `g i`
- `lastKeyOfSequence`, for key releases

**Rating**
- The `rate` action's bindings are only the part before the digits.
- Its full pattern is that, then digit slots: one digit `{1-5}` for stars, or two digits `{0-9}` for decimal.
- `00` is 10.0, as now.

**Unset rating**
- `unset-decimal-rating` is replaced by **`unset-rating`**.
- Its defaults depend on the rating system: `r 0` for stars (as now), and ``r ` `` for decimal, since `r 0` would start `r 0 0`.
  - Definitions get `defaults: KeySequence[] | Record<RatingSystemType, KeySequence[]>`.
  - `resolveShortcutBindings(overrides, ratingSystem)` picks the right ones.
- The `rating` context and `ratingSystem`-only actions go away. Every action now applies to both rating systems.

**Rating system outside React**
- Matching needs Stash's rating system outside React.
- Add a transient `globalState.ratingSystem`, kept in sync from `useConfigurationContext()` by a small hook called in `FeedPage`. It defaults to stars.

### 2. One sequence tracker for matching (`src/hooks/useKeyboardShortcuts.ts`)

`rating-sequence.ts` is replaced by a general **sequence tracker** (module state).

**Resolving each key press**
- The first `matchShortcut` call for an event resolves it, and the result is cached per event (a `WeakMap`). Every listener then sees the same result whatever order they run in.
- To resolve, append the event's combo (turned for forced landscape) to the keys typed so far, then:
  1. **The keys typed so far complete one or more bindings.** The result is those actions, plus the digits typed into a rating's slots. Then reset.
  2. **They're the start of a binding.** Nothing matches yet, and the tracker waits for the next key.
    - Each key gets 1s; the timer's handler stays named `endSequence` for the rating test helper.
    - When it starts waiting, it blurs the focused element, as the rating key does today, so Video.js doesn't take the digits.
  3. **Neither.** Reset, and try the key again on its own as the start of a new sequence, so `r` then `m` still mutes.
- Exact matches win immediately. The settings never let one binding start another (below), and a clash that slips in anyway is shown as a warning (§3).
- A **key repeat** (`event.repeat`) of the key that completed the last match resolves to the same actions. Holding a seek key keeps matching, so its repeats still never reach Video.js.

**API**
- `matchShortcut(event, ids)` keeps its signature.
- New `shortcutDigits(event)` gives the rating digits.
- `matchShortcutKey` compares a release with each binding's last key.
- `VideoScroller`'s "is a seek key held" check uses the last key too.

**Rating**
- `useRatingKeybinds` shrinks to a listener: on `rate`, it sets the rating from `shortcutDigits`; on `unset-rating`, it unsets. _(Deviation, 2026-10-09, Claude: being that small, it was folded into `useKeyboardRating` and `useRatingKeybinds.ts` deleted. The settings and help read the rating system from `globalState.ratingSystem` too, so everything uses the one copy.)_
- It no longer contains code copied from Stash, so drop the AGENTS.md "copied code" exception.
- ⚠️ This changes what happens after a rating. Stash's keeps the digits live for 1s, so a further `5` rates again. Now a sequence ends once it's complete, and each rating starts with the rating key.

**Contexts and conflicts**
- `seeking` actions still only apply while a seek key is held. Their callers filter, as now.
- `findConflicts(bindings, ratingSystem)`: two bindings clash if one equals the other or **starts** it, comparing combos step by step, with a digit slot matching any digit in its range.
  - An exact match across different contexts is allowed (↑ for previous and for speeding up).
  - One binding starting another always clashes, whatever the context.

### 3. Settings UI (`KeyboardShortcutSettings`)

**Chips**
- Each chip shows its sequence (`g i`). Rating chips end in a muted, read-only range span (`{1-5}` / `{0-9} {0-9}`) per Stash's rating system.
- A chip's label is a button. Pressing it selects the chip (`aria-pressed`).

**Adding keys**
- **+** records a combo, as now. The new chip becomes the selected one.
- The selected chip shows a **then…** button ("Add a next key to `g`").
  - It records one more combo onto that chip's sequence, in place.
  - The chip stays selected, so it can be extended again.
- Escape cancels a step and leaves the sequence as it was.
- Selecting another chip, or recording elsewhere, moves the selection.

**Conflicts**
- After each step, bindings that clash with the new one are taken from their actions, with the note as now. E.g.: "`g` was removed from "Toggle CRT effect"" or "`g x` was removed from …, as `g` starts it".
- A row whose bindings clash anyway (e.g. after Stash's rating system changes) shows a warning under it, from `findConflicts`. _(Deviation, 2026-10-09, Claude: `describeClashes()` describes a clash under both rows involved, with "so one of them needs changing", since when the rating's digits are involved only some of the longer sequence may be blocked.)_

**Rows**
- The `rate` row is titled "Rate (then type the rating)".
- The new "Unset rating" row is shown for both rating systems.

### 4. Help text (`help-text.ts`)

- Sequences show as one code span: `` `g i` ``.
- The rating rows are as now (`r {1-5}`). "Unset rating" is now one row from `unset-rating`'s bindings, for both systems.

## Files

- `src/helpers/keyboard-shortcuts/key-combos.ts` (or a new `key-sequences.ts`): sequence parsing, formatting and last key
- `src/helpers/keyboard-shortcuts/definitions.ts`:
  - `unset-rating`, with defaults per rating system
  - drop the `rating` context
  - `resolveShortcutBindings(overrides, ratingSystem)` and `findConflicts` with prefixes and digit slots
- Delete `src/helpers/keyboard-shortcuts/rating-sequence.ts`
- `src/hooks/useKeyboardShortcuts.ts`: the tracker, `shortcutDigits`, and the rating-system sync hook
- `src/hooks/rating/useRatingKeybinds.ts`: simplified, as in §2
- `src/hooks/useKeyboardSeeking.ts`, `src/components/VideoScroller/index.tsx`: use the last key of the seek bindings
- `src/store/globalState.ts`: `ratingSystem`
- `src/pages/Feed/index.tsx`: call the sync hook
- `KeyboardShortcutSettings` (+ scss): chip selection, **then…**, the range suffix, clash warnings
- `KeyboardShortcutsInfo/help-text.ts`
- Docs:
  - `docs/keyboard-shortcuts.md`: Key combos → Key sequences, Matching (the tracker), Changing shortcuts (then…), and Rating shortcuts rewritten (the digit slots; a sequence ends once complete; the old window behaviour is gone)
  - `AGENTS.md`: drop the copied-code exception
  - `docs/testing.md`: the rating-window gotcha (it now holds the tracker's timer)
  - Save this plan as `docs/historical-plans/2026-10-09-keyboard-shortcut-sequences.md`

## Tests

- **Unit, sequences:**
  - parse and format
  - clashes: exact, one starting another, digit slots per rating system, and the same exact key allowed across contexts
- **Unit, tracker** (fake timers):
  - a sequence completes
  - it waits after a key that starts one
  - a key that doesn't continue starts afresh
  - it resets after 1s
  - a repeat keeps its match
  - forced landscape applies at every step
  - the digits are captured
- **Unit, settings:**
  - then… extends a chip
  - Escape leaves it as it was
  - a clash with a longer binding removes it, with a note
  - the rating chip shows the range read-only, per rating system
  - Unset rating is listed for both systems
- **Unit, help:** a sequence binding, and the unset row
- **Integration:**
  - The rating tests keep passing. The `r 0` test drops its `endRatingWindows()` step, since a sequence now ends once complete.
  - Add: a sequence shortcut (mute on `g m`) fires and `g` alone doesn't, and a rebound unset key.
- **E2E:** the keyboard seeking tests (including holding with repeats) still pass.

## Verification

`yarn typecheck`, `yarn test`, and `yarn test:e2e` (check load first). Then in `yarn dev`:
- Give mute `g m` via + then then….
- Check that `g m` mutes and `m` doesn't.
- Check the rating chip shows `r {1-5}`.
- Check that unset rating works in both rating systems.
