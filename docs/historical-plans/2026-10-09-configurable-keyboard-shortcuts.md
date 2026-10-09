> Frozen implementation plan, written 2026-10-09 before implementation. Deviations are marked inline.

# Configurable keyboard shortcuts

## Context

Every keyboard shortcut is hardcoded today, spread across five places:
- `VideoScroller`: next/previous (↓/↑) and CRT (`c`)
- `MediaSlide`: a `switch (e.key)` for d/i/e/m/o/l/s/f/p
- `useKeyboardSeeking`: ←/→ skip/hold-seek, ↑/↓ faster/slower while seeking, Space
- `useShortcutListKey`: `?`
- `useKeyboardRating`: Stash's `useRatingKeybinds` (Mousetrap, `r` + digits)

The help modal reads a static `KeyboardShortcutsInfo.md`.

Goal: users can rebind every shortcut from one new **Settings → Keyboard Shortcuts** section. Each action can have zero or more key combos, and a combo can include modifiers. Bindings are saved in the Stash config, so they sync across devices. The help modal (`?`) is generated from the same bindings, so it always shows the user's own keys.

Decisions made with the user:
- **Scope:** everything is configurable, including rating.
- **Bindings:** several combos per action, modifiers allowed. An empty list turns the shortcut off.
- **Storage:** Stash config (synced).
- **UI:** a new settings section.
- **Rating:** copy Stash's rating hook into tv-ui and maintain it there, rather than adding another stash-ui patch. This is a deliberate, user-approved exception to "never copy Stash code" and will be documented as such.

## Design

### 1. Shortcut registry: `src/helpers/keyboard-shortcuts/`

**`definitions.ts`** is the single source of truth.
- It defines a `ShortcutActionId` union and `SHORTCUT_DEFINITIONS`, ordered for display. Each definition has:
  - `id`
  - `group`: General / Playback / Navigation / Scene-Marker Actions / Display (the help's existing groups) _(Deviation, 2026-10-09, Claude: the help's existing groups are General, Playback, Scene/Marker Actions and Display, with no Navigation, so next/previous are in Playback as in the old help.)_
  - `title`, used in settings
  - `description`, used in help; reuse the wording in today's `KeyboardShortcutsInfo.md`
  - `defaults: KeyCombo[]`
  - optional `ratingSystem: "stars" | "decimal"`
  - optional `context: "seeking"`, which marks faster/slower as active only while a seek key is held, so they may share ↑/↓ with next/previous _(Deviation, 2026-10-09, Claude: a `"rating"` context was added too, for the decimal unset key: it only applies in the second after the rating key, when `matchShortcut` gives the digits and rating keys to the rating alone.)_
- The actions are:
  - **General:** `show-shortcuts`
  - **Playback:** `play-pause`, `seek-backwards`, `seek-forwards`, `seek-faster`, `seek-slower`, `toggle-looping`, `toggle-mute`
  - **Navigation:** `next`, `previous`
  - **Actions:** `rate` (the sequence prefix), `unset-decimal-rating` (`` ` ``), `delete`, `edit-tags`, `toggle-scene-info`
  - **Display:** `toggle-crt`, `toggle-fullscreen`, `toggle-landscape`, `toggle-pip`, `toggle-subtitles`
- Help rows that describe a sequence get a `helpSequence(bindings)` function. _(Deviation, 2026-10-09, Claude: the help rows are `HELP_ENTRIES` in `KeyboardShortcutsInfo/help-text.ts` rather than functions on the definitions: some rows cover several actions, and the definitions stay about settings and matching.)_ These are the rating rows (`r {1-5}`, `r 0`, `r {0-9} {0-9}`, ``r ` ``) and the hold-to-seek rows ("Hold ← or → then tap ↑ or ↓"), so their text follows the user's keys. The digits after the rating prefix stay fixed.

**`key-combos.ts`** holds pure helpers.
- `KeyCombo` is a normalised string such as `"d"`, `"Shift+d"`, `"Ctrl+Alt+k"`, `"Space"`, `"ArrowUp"`, `"?"`.
- `comboFromEvent(event)` normalises an event:
  - Letters are lowercased, with Shift kept explicit.
  - For other printable characters (`?`, `` ` ``, digits), Shift is implied by the character, so `?` stays `?`, not `Shift+?`.
  - `" "` becomes `Space`.
  - Pressing a modifier on its own returns null.
- `rotateForLandscape(key)` maps the arrow keys pressed in forced landscape back to their portrait meaning (Right→Down, Left→Up, Up→Right, Down→Left). It reproduces today's per-hook landscape tables in one place, so bindings are always stored in portrait terms.
- `formatKeyCombo(combo)` gives display text: `←`, `Space`, `Shift + D`, ⌘ on macOS.
- `findConflicts(bindings)` reports conflicts only within the same context.
- `isTypingTarget(event)` replaces the four copies of the input/textarea/`role="slider"` check.

**`src/hooks/useKeyboardShortcuts.ts`**
- It merges `tvConfig.keyboardShortcuts` over the defaults.
- It returns `bindings` and `matchAction(event, actionIds)`. _(Deviation, 2026-10-09, Claude: `matchShortcut()` and `matchShortcutKey()` are plain functions reading the store when called, rather than returned by a hook, since the listeners must never re-subscribe. `useShortcutBindings()` is the hook, for rendering.)_ `matchAction` gives the first action whose binding equals `comboFromEvent(event)`, after landscape rotation.
- It also exports a non-hook `getShortcutBindings()` that reads the store, for listeners that read the latest config without re-subscribing.
- It returns no match while `globalState.recordingShortcut` is true, so recording a key in settings never triggers the action.

### 2. Config: `src/store/tvConfig.ts`

- Add `keyboardShortcuts: Partial<Record<ShortcutActionId, KeyCombo[]>>`, defaulting to `{}`.
- Only overrides are stored. Actions added later pick up their defaults automatically, and resetting an action deletes its key.
- The key persists to the Stash config (not in `localStorageKeys`).
- No migration is needed: it's a new key.
- Add two transient keys to `globalState`:
  - `recordingShortcut: boolean`
  - `settingsSection`: the expanded Settings accordion section (see §5)

### 3. Switch the existing listeners to the registry

Keep each listener's current structure: capture phase, keyup handling, the `isCurrentVideo` gating and the rating hand-over invariant. Only the key tests change.

- **`VideoScroller`**
  - Next/previous use `matchAction`. The `keysDown` "is a left/right key held" check becomes "is a `seek-backwards`/`seek-forwards` key held", tracking the normalised key without modifiers so a keyup still matches if a modifier is released first.
  - The CRT listener uses `toggle-crt`, plus `isTypingTarget`.
- **`MediaSlide`**: the `switch (e.key)` becomes a map from action id to handler, looked up via `matchAction`. Drop the blanket "ignore any modifier" check: exact combo matching already means Ctrl+d doesn't fire `d`.
- **`useKeyboardSeeking`**
  - Remove the hardcoded landscape key tables; use the matcher instead.
  - Keyup matches on the key alone, ignoring modifiers.
  - `play-pause` replaces the `" "`/`"Spacebar"` check.
- **`useShortcutListKey`**: use `show-shortcuts`.
- **Rating**
  - Add `src/hooks/rating/useRatingKeybinds.ts`, our own copy of Stash's hook, keeping the existing behaviour:
    - star vs decimal handling
    - a 1s window for the rest of the sequence, restarted on each keystroke
    - blurring the focused element on the prefix key
    - the module-level timeout fix from our patch
  - Changes from Stash's version:
    - The prefix and decimal-unset keys come from the bindings.
    - It drops Mousetrap for the same window keydown listener and matcher as everything else.
    - It keeps the "only the enabled instance listens" contract.
  - `useKeyboardRating` calls it in place of `stash-ui`'s.
  - Leave `packages/stash-ui/patches/` untouched (ask-first area). The patched Stash hook simply becomes unused by us; the plan notes removing that hunk as an optional follow-up.
- **`useGamepad`** stays as it is. The d-pad keeps sending arrow keys, so it follows whatever the arrows are bound to. Document this.

### 4. Settings UI: `src/components/settings/KeyboardShortcutSettings/` (new)

- A new accordion section **"Keyboard Shortcuts"** in `SettingsTab`, before Help / Info. It is grouped like the help.
- Each row shows the action title, then one chip per binding (Stash's `kbd`/`Badge` look). Each chip has a × to remove that binding. A **+** starts recording.
- Recording:
  - The chip shows "Press a key…" and sets `globalState.recordingShortcut`.
  - It listens on `window` keydown in the capture phase, with `preventDefault` and `stopPropagation`.
  - Presses of a modifier alone are ignored.
  - `Escape` cancels, so Escape can't be bound; Stash's modals use it.
  - Blur or click-away also cancels.
- If the recorded combo is already used by another action in the same context, it moves to the new action. An inline note says so ("Removed from *Mute*").
- Each action that differs from its defaults gets a "Reset" link. At the bottom are a **"Reset all to default"** button (`outline-warning`, matching the action-buttons section) and a "Show keyboard shortcuts" button. _(Deviation, 2026-10-09, Claude: no "Show keyboard shortcuts" button here: Help / Info already has one, and the list links back to these settings.)_
- Use react-bootstrap components and `react-bootstrap-icons`, not FontAwesome.

### 5. Help modal: `KeyboardShortcutsInfo`

- Build the markdown from `SHORTCUT_DEFINITIONS` plus the user's bindings, with one table per group. Keep the "Ratings set on a marker apply to the marker's scene" note.
- Rows filter on `definition.ratingSystem` against Stash's `ui.ratingSystemOptions.type`, defaulting to stars as today.
- Actions with no bindings are left out.
- Keep handing the result to `MarkdownPage` as a `data:` URL.
- Add an **"Edit shortcuts"** button to the modal (header or footer). It closes the modal and opens Settings expanded at the Keyboard Shortcuts section.
  - This works through a new transient `globalState.settingsSection`, which defaults to the Channels section.
  - `SettingsTab`'s `<Accordion>` changes from `defaultActiveKey="0"` to a controlled `activeKey={settingsSection}` with `onSelect` writing it back. This keeps today's behaviour (opening on Channels) unless something asks for a section.
  - The button sets `settingsSection` to the shortcuts section, `showSettings` to true and `keyboardShortcutsOpen` to false.
  - _(Deviation, 2026-10-09, Claude: the accordion toggles also got `aria-expanded`, so whether a section is open is accessible, and testable.)_
  - Give the accordion sections named keys (e.g. `"channels"`, `"keyboard-shortcuts"`) in place of `"0"`–`"4"`, so callers don't depend on their order.
- Delete `KeyboardShortcutsInfo.md` and `filterShortcutsForRatingSystem.ts`; the registry replaces them.

## Files

- **New:**
  - `src/helpers/keyboard-shortcuts/{definitions,key-combos}.ts`
  - `src/hooks/useKeyboardShortcuts.ts`
  - `src/hooks/rating/useRatingKeybinds.ts`
  - `src/components/settings/KeyboardShortcutSettings/{index.tsx,KeyboardShortcutSettings.scss}`
- **Modified:**
  - `src/store/tvConfig.ts`, `src/store/globalState.ts`
  - `src/components/VideoScroller/index.tsx`, `src/components/slide/MediaSlide/index.tsx`
  - `src/hooks/useKeyboardSeeking.ts`, `src/hooks/useShortcutListKey.ts`, `src/hooks/rating/useKeyboardRating.ts`
  - `src/components/settings/SettingsTab/index.tsx`, `src/components/settings/KeyboardShortcutsInfo/index.tsx`
- **Docs:**
  - Rewrite `docs/keyboard-shortcuts.md`, covering:
    - the registry
    - how matching works (Shift rules, landscape rotation, contexts)
    - the copied rating hook and why it's ours
    - the gamepad note
    - "adding a shortcut = add a definition"
  - _(Deviation, 2026-10-09, Claude: also updated `docs/testing.md`'s Mousetrap gotchas and `docs/stash-ui-package.md`'s note on the rating-hook patch, both of which described Stash's hook as the one in use.)_
  - Update the `AGENTS.md` keyboard-shortcut bullet. Its "must update `KeyboardShortcutsInfo.md`" rule becomes "add or change a definition in the registry". Also note the rating-hook exception there.
  - Add `keyboardShortcuts` to `docs/state-and-config.md`.
  - Save this plan as `docs/historical-plans/2026-10-09-configurable-keyboard-shortcuts.md`.

## Tests (cite `@see docs/keyboard-shortcuts.md § …`)

- **Unit, `key-combos`:**
  - Shift and letter normalisation, `?` without Shift, Space
  - modifier-only presses → null
  - landscape rotation
  - `findConflicts` ignoring the seeking context's overlap with next/previous
- **Unit, `KeyboardShortcutSettings`:**
  - recording adds a binding
  - Escape cancels
  - the action doesn't fire while recording
  - a conflicting binding moves, with a note
  - × removes a binding
  - per-action reset and reset-all
- **Unit, help modal:** update `keyboardShortcutsInfo.test.tsx` so it:
  - shows rebound keys
  - leaves out unbound actions
  - keeps the rating-system filter
  - "Edit shortcuts" closes the modal and opens Settings with the Keyboard Shortcuts section expanded
- **Unit:** update `useShortcutListKey.test.tsx` to cover a rebound `?`.
- **Integration:**
  - The existing `keyboard-rating*.test.tsx` (including the sequence-timeout regression) must pass unchanged on the copied hook.
  - Add rebinding cases: e.g. mute moved to `Shift+m` means `m` does nothing and `Shift+M` mutes, and a rebound rating prefix still works.
- **E2E:** `keyboard-seeking.test.ts` must still pass. Add one case for rebound seek keys in forced landscape. _(Deviation, 2026-10-09, Claude: that file already had a forced-landscape test of the arrow keys turning, so the new case tests rebound seek keys in portrait.)_

## Verification

1. `yarn typecheck`, then `yarn test`. Check system load first, since other agents run tests concurrently.
2. `yarn dev`, then in the browser:
   - Open Settings → Keyboard Shortcuts and rebind mute to `Shift+M` and next to `j`.
   - Confirm the old keys stop working and the new ones work.
   - Confirm `?` shows the new keys, and that its "Edit shortcuts" button opens Settings at the Keyboard Shortcuts section.
   - Reload and check the bindings persisted.
   - Toggle forced landscape and confirm the arrow keys still rotate.
   - Reset all.
3. `yarn build`, to make sure the plugin bundle builds.
