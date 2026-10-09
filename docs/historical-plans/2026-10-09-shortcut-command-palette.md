> Frozen implementation plan, written 2026-10-09 before implementation. Deviations are marked inline. Follows [keyboard shortcut sequences](2026-10-09-keyboard-shortcut-sequences.md).

# Recording shortcut keys in a command palette

## Context

Keyboard shortcuts are configurable and can be key sequences (uncommitted work). Today keys are recorded inline in the settings: **+** records one key, and a **then…** button on the selected chip adds each next key.

The user wants a different UI: a **generic, prop-customisable command palette component**, used to record a shortcut's keys.

Decisions:
- **Adding a key:** **+** opens the palette, with the placeholder "Type shortcut" and **Done** and **Clear** buttons.
  - Every key typed is added to the sequence.
  - Done saves it; Clear empties it.
- **Rating:** as soon as anything has been typed, the read-only number range (`{1-5}` / `{0-9} {0-9}`) is shown at the end of the typed keys.
- **Editing:** clicking an existing chip opens the palette with its keys filled in. Done replaces that binding.
  - The chip selection and **then…** go away.
- **Clashes:** warned about live as keys are typed (e.g. "Done will remove `g m` from "Mute/unmute", as `g` starts it"). They're only applied on Done.

## Design

### 1. `CommandPalette` (`src/components/CommandPalette/`, new, generic)

A palette that drops down from the top of the screen. It's built on our `containers/Modal` (react-bootstrap), so it gets Stash's look, Escape, the backdrop, focus trapping and focus returning on close. _(Deviation, 2026-10-09, Claude: Escape is handled by the palette itself, by `event.key`, with the modal's `keyboard` off. react-bootstrap only recognises Escape by `keyCode`, which userEvent doesn't set, so it couldn't be tested. The content is in a `Modal.Body`, and the input has `.text-input`, as Stash gives modal bodies, not `.modal-content`, its card background, and dark inputs that class.)_ Styles are colocated (`CommandPalette.scss`): the dialog sits near the top of the screen, and the input uses Stash's `.form-control` look.

```ts
type CommandPaletteProps = {
  show: boolean;
  onClose: () => void;              // Escape, the backdrop
  label: string;                    // accessible name of the dialog
  placeholder: string;
  /** Text mode (default): a text field */
  query?: string;
  onQueryChange?: (query: string) => void;
  /** Or custom contents in place of the text field (e.g. keys typed), in a focusable role="textbox" */
  inputContent?: ReactNode;
  /** Every key pressed in the input, before the palette's own handling. preventDefault() stops that handling */
  onInputKeyDown?: (event: React.KeyboardEvent) => void;
  /** Read-only content after the input's own */
  inputSuffix?: ReactNode;
  /** Results under the input (filtered by the caller); ↑/↓ move between them, Enter or a click picks one */
  items?: { id: string; label: ReactNode; description?: ReactNode; disabled?: boolean; onSelect: () => void }[];
  emptyText?: ReactNode;            // when items is [] (e.g. "No matches")
  status?: ReactNode;               // notes under the input (role="status")
  actions?: { label: string; onClick: () => void; variant?: ButtonVariant; disabled?: boolean }[];  // footer buttons
  /** Whether a backdrop fades in behind it, slightly blurring and darkening the page. Default true */
  backdrop?: boolean;
  className?: string;
};
```

**Backdrop**
- `backdrop` (default `true`) is passed to the Modal as its `backdrop`, with `backdropClassName="CommandPalette-backdrop"`.
- In the scss, `.CommandPalette-backdrop` is:
  - a translucent dark background, e.g. `rgba(0, 0, 0, 0.35)`, at full opacity once shown, rather than Bootstrap's 0.5-opacity black;
  - `backdrop-filter: blur(3px)` (plus the `-webkit-` prefix for Safari).
- It fades in (and out) with Bootstrap's `.fade`/`.show` transition, slowed slightly. The blur fades with it, since it's on the same element.
- With `backdrop={false}` there's no dimming or blur. Clicking outside the palette still closes it: react-bootstrap only closes on a backdrop click, so the palette handles clicks on the `.modal` element outside the dialog itself. _(Deviation, 2026-10-09, Claude: rather than handling clicks itself, it keeps react-bootstrap's backdrop but makes it unseen (`.unseen`), which keeps its click-outside closing.)_
- The settings' `ShortcutRecorder` uses the default (backdrop on).

**Behaviour**
- The input is focused on open, and the placeholder shows while it's empty.
- In custom-input mode the field is `role="textbox"` with `aria-placeholder`. It takes `inputContent`, and `onInputKeyDown` sees the keys first.
- Items are a `role="listbox"` of `role="option"`s, with the highlighted one marked by `aria-activedescendant`.

**Our use and future uses**
- Our use is custom-input mode, with no items.
- The text-and-items mode makes it a real command palette for future uses: searching actions, channels…
- Add a Storybook story with both modes (it's reusable). _(Deviation, 2026-10-09, Claude: the story was added, but Storybook doesn't build at all (before this change too: `.storybook` and its stories glob point at `./src` from the repo root), so the palette was checked with Playwright screenshots of the app instead.)_

### 2. `ShortcutRecorder` (`src/components/settings/ShortcutRecorder/`, new)

Wraps `CommandPalette` to record one sequence for an action.

**Props**
- `actionId`, `initial: KeySequence | null` (editing or adding), `bindings`, `ratingSystem`, `onSave(sequence)`, `onClose`

**Recording**
- It holds `combos: KeyCombo[]`, starting from `initial`.
- `onInputKeyDown`: every key except Escape (closes) and Tab/Shift+Tab (moves focus to the buttons) is recorded:
  - `preventDefault`, so Space doesn't scroll and Enter doesn't press anything.
  - Repeats and a modifier on its own are ignored.
  - The combo comes from `comboFromEvent(event, { forceLandscape })` and is appended.

**What it shows**
- `inputContent`: each combo as a key token (`formatKeyCombo`, Stash's `.tag-item` look).
- `inputSuffix`: for `rate`, once `combos.length > 0`, the muted `formatRatingDigitSlots(ratingSystem)`.
- `status`:
  - the clashes, from `findClashingBindings()` against the bindings with the edited sequence left out, each worded like today's notes but in the future tense ("Done will remove …")
  - "Already one of this shortcut's keys" when the action already has the sequence
- Actions:
  - **Clear**: empties `combos` and refocuses the input. Disabled when empty. _(Deviation, 2026-10-09, Claude: refocusing is the palette's generic `focusInput` option on an action.)_
  - **Done**: `onSave(joinKeySequence(combos))`. Disabled when empty.

**While it's open**
- It sets `globalState.recordingShortcut`, so no shortcut fires: the existing guard in `matchShortcut`.
- This replaces the settings' window capture listener.

### 3. `KeyboardShortcutSettings` changes

- Remove the inline recording, the recording button, chip selection and **then…** (its `recording`/`selected` state and window listener).
- **+** sets `editing = { actionId, sequence: null }`. A chip's keys become a button, "Change `g m` for "Mute/unmute"", which sets `editing = { actionId, sequence }`. Both render one `ShortcutRecorder`.
- `onSave` reuses today's `record()` logic, adapted from appending one combo to saving a whole sequence: replace the edited sequence or append; take the clashing bindings from their actions; and keep the after-save note under the row (the same wording as now).
- The rating chips keep their muted range suffix. The row warnings (`describeClashes`) stay.
- Update the intro text: "Press + then type the keys…".

## Files

- New:
  - `src/components/CommandPalette/{index.tsx,CommandPalette.scss,CommandPalette.stories.tsx}`
  - `src/components/settings/ShortcutRecorder/{index.tsx,ShortcutRecorder.scss}`
- Modified: `src/components/settings/KeyboardShortcutSettings/{index.tsx,KeyboardShortcutSettings.scss}` (drop `.selected`/then… styles)
- Reused: `comboFromEvent`/`formatKeyCombo` (`key-combos.ts`), `joinKeySequence`/`parseKeySequence`/`formatKeySequence` (`key-sequences.ts`), `findClashingBindings`/`formatRatingDigitSlots`/`formatShortcut` (`definitions.ts`), `containers/Modal`
- Docs:
  - `docs/keyboard-shortcuts.md` § "Changing shortcuts": rewrite around the palette, Escape/Tab not recordable, live clash warnings
  - `AGENTS.md`: add `CommandPalette` to the component hierarchy (Settings & UI Overlays) as a reusable component
  - Save this plan as `docs/historical-plans/2026-10-09-shortcut-command-palette.md`

## Tests

- **Unit `commandPalette.test.tsx`:**
  - the placeholder shows while it's empty, and the input is focused on open
  - text mode reports the query
  - ↑/↓ and Enter pick an item, and clicking picks one
  - `emptyText`
  - custom-input mode gives `onInputKeyDown` the keys
  - the suffix and status render
  - action buttons, including disabled ones
  - Escape calls `onClose`
  - a backdrop is rendered by default and not with `backdrop={false}`
  - clicking outside closes it either way
- **Unit `keyboardShortcutSettings.test.tsx`** (rewritten for the palette):
  - + opens the palette with "Type shortcut"
  - typing `g` `m` shows both keys, and Done saves `g m`
  - Clear empties it, and Done is disabled when empty
  - Escape changes nothing
  - Tab moves focus to the buttons rather than being recorded
  - the rating range shows only after the first key
  - a clash is warned about live and applied on Done, with the note
  - clicking a chip opens it prefilled, and Done replaces it
  - no shortcut fires while the palette is open
  - × and reset still work
- **Integration `keyboard-shortcuts-settings.test.tsx`:** the mute flow becomes + → type `Shift+M` → Done.
- The other suites are unchanged; run `yarn test`, `yarn test:e2e` and `yarn typecheck`.

## Verification

`yarn typecheck`, `yarn test`, `yarn test:e2e` (check load first), `yarn build`. Then:
- In Storybook, check both palette modes, with and without the backdrop. The backdrop should fade in, blurring and darkening the page.
- In `yarn dev`, Settings → Keyboard Shortcuts:
  - + on Mute, type `g m`, Done. Then `g m` mutes.
  - Click the chip and change it.
  - + on Rate: the range appears after the first key.
  - Typing `g` while `g m` exists shows the warning, and Done applies it.
