> Frozen implementation plan, written 2026-10-09 before implementation. Deviations are marked inline.

# Gamepad settings & configurable controller mapping

## Context

Gamepad support today is hardcoded in `packages/tv-ui/src/hooks/useGamepad.ts`:
- The d-pad sends fake arrow-key `KeyboardEvent`s, so it does whatever the arrows are bound to and stops working if the user rebinds them.
- Select (8) and the touchpad (17) fire custom play/pause events (`src/events.ts`).
- The sticks do nothing.

Keyboard shortcuts were just made configurable (commit 3e32ccff). That commit added key sequences, chords via `heldWith`, rating as `r {digits}`, `unset-rating` as an ordinary action, and the command palette recorder.

The user wants:
- A **Gamepad** settings section, shown only while a gamepad is connected.
- **Presets** to choose from, each with a small diagram: **Standard** and **Sticks**.
- **Custom** mapping, where every control can be given any action a keyboard shortcut can do.
- On a stick, **analog seeking**: how far the stick is pushed sets the seek speed, like the seek gesture. It isn't on/off like a key.

Decisions from the user:
- **Rating:** the gamepad "Rate" action opens the rate button's panel on the current slide, since a gamepad can't type the digits.
- **Gamepad icon:** it keeps its current flash-on-connect and is **not** made clickable. The "click the icon to open settings" requirement is dropped.
- **Presets:** only Standard and Sticks. In Sticks, the left stick does both next/previous (vertical) and analog seek (horizontal).
- **Code location:** code that isn't keyboard-specific doesn't live under `keyboard-shortcuts/`.

## Approach

### 1. Split the action registry from the keyboard, and add an input-agnostic layer

**New `src/helpers/shortcut-actions/`**, for what's shared by every input device:
- **`actions.ts`:** the action registry, moved out of `keyboard-shortcuts/definitions.ts`.
  - It holds `SHORTCUT_GROUPS`, `ShortcutGroup` and `SHORTCUT_ACTIONS` (`group`, `title`, `heldWith`, plus a new `shortTitle` for diagram callouts, e.g. "Next" or "Rewind").
  - It also holds `ShortcutActionId`, `SHORTCUT_ACTION_IDS` and `getShortcutAction()`.
- **`input.ts`:** `onShortcut(phase: "press" | "release", handler, { capture? })`, which returns a cleanup function. The handler gets a `ShortcutTrigger`:
  ```ts
  type ShortcutTrigger = {
    match<Id extends ShortcutActionId>(ids: readonly Id[]): Id | null;
    repeat: boolean;
    source: "keyboard" | "gamepad";
    digits: string[];   // the rating's digits; keyboard only, [] from a gamepad
    handled(): void;    // keyboard: preventDefault + stopPropagation
  };
  ```
  - **Keyboard adapter:** wraps keydown/keyup.
    - Press uses `matchShortcut()` and `shortcutDigits()`. The tracker already resolves each event once, with sequences, chords, typing targets and recording all handled.
    - Release uses `matchShortcutKey()`, plus an `isTypingTarget()` check.
  - **Gamepad adapter:** listens for a `window` CustomEvent `GAMEPAD_ACTION_EVENT`. Its detail is either:
    - `{ kind: "press" | "release", actionIds }`: the actions the gamepad resolved for a control (see §2, "held with").
    - `{ kind: "analog-seek", value }`: a deflection from -1 to 1, where 0 means released.

**`keyboard-shortcuts/` stays keyboard-only:**
- `definitions.ts` keeps `KEYBOARD_DEFAULTS` (`Record<ShortcutActionId, …>`, the `defaults` taken from today's entries), bindings and overrides, patterns, clashes, rating digit slots and formatting.
- It imports the registry from `shortcut-actions/actions.ts`.
- Only `definitions.ts` reads `.defaults` today, so the split is internal to it.
- About 10 importers move to `actions.ts` for ids, groups and titles. No re-export shim is left behind.

**Listeners moved onto `onShortcut`.** Each keeps its logic and only changes its event source:
- `VideoScroller`: next/previous and toggle-crt.
- `MediaSlide`'s `handlers` map.
- `useKeyboardSeeking`, renamed to `useShortcutSeeking`. It also handles analog seek (§3).
- `useShortcutListKey`.
- `useKeyboardRating`, renamed to `useRatingShortcuts`:
  - Its keyboard `rate` uses `trigger.digits`.
  - `unset-rating` works from any source.
  - Gamepad `rate` is ignored here and handled by the rate button (§4).

**Removed:**
- `src/events.ts`, and MediaSlide's `TOGGLE_VIDEO_EVENT`/`PAUSE_VIDEO_EVENT` listener.
- The fake `KeyboardEvent`s, and the landscape d-pad tables. Mapping controls straight to actions keeps today's net behaviour (d-pad up = previous in both orientations) with no rotation step.

### 2. Gamepad controls, bindings and presets

**New `src/helpers/gamepad/`:**
- **`controls.ts`:** the controls of the W3C standard mapping.
  - Digital controls:
    - Face buttons: south, east, west, north (buttons 0–3).
    - LB, RB, LT, RT (4–7); select (8), start (9), L3 (10), R3 (11), d-pad up/down/left/right (12–15), home (16), touchpad (17).
    - Stick directions, e.g. `left-stick-up`.
  - Analog controls: the stick axes `left-stick-x`, `left-stick-y`, `right-stick-x`, `right-stick-y`.
  - Each control has its index, a group, and labels for Xbox (A/B/X/Y, LB…) and PlayStation (✕○□△, L1…). Which set shows depends on `gamepad.id`, with Xbox as the fallback.
- **`bindings.ts`:**
  - Type:
    ```ts
    type GamepadBindings = {
      buttons: Partial<Record<DigitalControlId, ShortcutActionId[]>>;
      axes: Partial<Record<AxisControlId, "analog-seek">>; // binding an axis disables its two directions
    };
    ```
  - **Held with (the gamepad's version of the keyboard's chords):** a control has at most one plain action and at most one action with `heldWith` (speed up or slow down).
    - Pressed while a control bound to one of that action's `heldWith` actions is held on the gamepad (a seek control), it does the `heldWith` action. Otherwise it does the plain one.
    - So d-pad ↑ is "previous", or "speed up" while ←/→ is held, just as ↑ and ←+↑ are on a keyboard.
    - `resolveControlPress(bindings, control, heldControls)` gives the actions to dispatch.
  - Every action can be picked, `unset-rating` included, since it's now an ordinary action.
- **`presets.ts`:**
  - **Standard** (the default; d-pad and face buttons do what they do today):
    - D-pad ↑/↓: previous/next, or speed up/slow down while ←/→ is held. D-pad ←/→: seek backwards/forwards (tap to skip, hold to seek).
    - A: play/pause. B: toggle scene info. X: edit tags. Y: rate.
    - LB: mute. RB: looping. LT/RT: seek backwards/forwards.
    - Select: play/pause (as today). Start: fullscreen. Touchpad: play/pause.
    - Sticks: unbound.
  - **Sticks:**
    - Left stick: Y is previous/next, X is analog seek.
    - The d-pad is freed for ↑ scene info, ↓ subtitles, ← mute, → looping.
    - Face buttons, shoulders and menu buttons as in Standard.
- **tvConfig:** add `gamepadMapping: { preset: "standard" | "sticks" | "custom"; custom: GamepadBindings | null }`.
  - Default: `{ preset: "standard", custom: null }`.
  - Synced via Stash config like `keyboardShortcuts`. No storage-routing change and no migration needed.
  - Choosing Custom the first time copies the active preset into `custom`. Switching back to a preset keeps `custom`.

### 3. The poller (`useGamepad` rewrite)

- **Polling:** it runs a rAF loop only while a gamepad is connected, not all the time as now.
- **Previous state is kept per gamepad index.** This fixes today's single shared map, where two pads interfere with each other.
- **Buttons, including triggers:**
  - It detects press and release edges using `pressed`, then dispatches `resolveControlPress()`'s actions.
  - A release dispatches whatever its press dispatched.
- **Stick directions:**
  - The dominant axis wins, so a diagonal flick can't fire both next and seek.
  - A direction presses at a deflection of 0.5 and releases at 0.3.
  - Directions are ignored while that stick's other axis is analog-seeking.
- **Analog axes:**
  - The deadzone is 0.2.
  - It dispatches `analog-seek` whenever the value moves by more than about 0.02, and 0 when the stick returns to the deadzone.
- It reads bindings from `useTvConfig.getState()` each frame, so changes in settings apply immediately.
- It publishes the controls currently pressed (`pressedControls`, set only on change) and the label set to `gamepadState`. The settings highlight from these.
- *Deviation (2026-10-09, Claude): the per-frame logic is a pure `readGamepad()` in `src/helpers/gamepad/reader.ts`, so it's tested without a gamepad. Stick directions along an axis bound to seeking are never "down", so the settings don't light them up alongside the axis.*
- **Analog seek**, in `useShortcutSeeking`, mirrors the tap-or-hold rule:
  - Released within `holdDelay`, it is a skip in that direction.
  - Otherwise it calls `seeking.seek(stickSeekSpeed(value, duration))` on each update and `seek(null)` on release.
  - New pure `stickSeekSpeed()` goes in `src/helpers/seek-speed.ts`, beside `holdSpeed`. It follows the gesture's curve: ±1.5x just past the deadzone, rising steeply towards full deflection, clamped to a third of the duration.

### 4. Gamepad "Rate" opens the rate panel

- `RateSceneActionButton` listens, only for the current slide, with `onShortcut("press")` where `source === "gamepad"` and the action is `rate`.
  - It opens its side panel through `PopoverPanel`'s toggle.
  - If the button is in a folder, it opens the folder first via `mediaItemState.openFolderId`.
- *Deviation (2026-10-09, Claude): `ActionButtonStack` handles it instead. Inside a closed folder only the button's icon-only preview is mounted, and only the stack knows whether the button exists at all. It opens the folder, then sets `mediaItemState.sidePanelRequest` to the button's config id. `ActionButtonBase` knows its id from a new `ActionButtonIdContext` and passes the request to `PopoverPanel` (`openRequested`).*
- If the rate button isn't in the user's stack, feedback says "Add the Rate scene button to rate with a gamepad" (`useFeedback`).

### 5. Settings section

- Add `"gamepad"` to `SettingsSection` (`src/store/globalState.ts`).
- In `SettingsTab`, add a `Gamepad` accordion section after Keyboard Shortcuts, rendered only when `useGamepadStatus().isConnected`. It follows the existing conditional pattern for the developer options.
- **New `src/components/settings/GamepadSettings/`** (index.tsx + scss):
  - **Preset picker:** a row of cards (Standard, Sticks, Custom), each a small `GamepadDiagram` plus a name. Built as react-bootstrap buttons with `active` and `aria-pressed`, like `SceneInfoEditor`'s ButtonGroup.
  - **Active mapping:** a large `GamepadDiagram` with a callout per bound control.
  - **When Custom:**
    - A list of controls, grouped (Face, Shoulders & triggers, D-pad, Left stick, Right stick, Menu).
    - Each control has a `Select` (the existing `settings/Select`) of actions grouped by `SHORTCUT_GROUPS`, plus "None".
    - Digital controls get a secondary "While holding seek" select, offered only for `heldWith` actions and labelled from those actions' titles.
    - Each stick axis has an "Analog seek | Directions" toggle.
    - A row highlights while its control is pressed.
    - "Copy from preset…" and "Reset" buttons.
    - *Deviation (2026-10-09, Claude): a single "Start again from…" dropdown of the presets does both.*
- **New `src/components/GamepadDiagram/`:**
  - An inline-SVG controller outline (standard layout), drawn in JSX.
  - It takes bindings, an optional set of pressed controls, and a `size` (`"small"` for cards without callouts, `"large"` with callouts).
  - Callouts use `shortTitle`, plus "Seek (analog)".
  - Colours come from Bootstrap or Stash CSS variables.
  - Add a Storybook story.

### 6. Docs

- **New `docs/gamepad.md`:**
  - controls and labels
  - the bindings model and "held with"
  - presets
  - poller thresholds
  - the analog seek curve
  - rate opening the panel
  - the settings section
  - why there's no landscape rotation

  Add its row to the AGENTS.md doc table.
- **`docs/keyboard-shortcuts.md`:**
  - "The registry": now `shortcut-actions/actions.ts` with keyboard defaults in `keyboard-shortcuts/definitions.ts`.
  - "To add a shortcut": add `shortTitle`, then the action is automatically pickable for gamepads.
  - "Where shortcuts live": listeners use `onShortcut()`, which feeds keyboard and gamepad alike.
  - Replace the ⚠️ Gamepads note with a link to `gamepad.md`.
  - "Rating shortcuts": `useRatingShortcuts` naming, and the gamepad rate exception.
- **`docs/state-and-config.md`:** add `gamepadMapping`.
- **`docs/video-player.md` § Gestures:** mention stick seeking, which shares `useSeeking`.
- **`AGENTS.md`:**
  - update the `useGamepad()` description
  - rename `useKeyboardSeeking()` to `useShortcutSeeking()` in the Gestures bullet
  - note in the keyboard shortcuts bullet that listeners use `onShortcut()` rather than raw keydown
- Copy this plan to `docs/historical-plans/2026-10-09-gamepad-settings.md`.

## Critical files (under `packages/tv-ui/`)

- `src/helpers/shortcut-actions/{actions.ts,input.ts}` (new), `src/helpers/keyboard-shortcuts/definitions.ts`, `src/hooks/useKeyboardShortcuts.ts`
- Importers of the registry: `settings/KeyboardShortcutSettings`, `KeyboardShortcutsInfo/help-text.ts`, `ShortcutKeys`, `ShortcutRecorder`, `MediaSlide`, `store/tvConfig.ts`, and their tests
- `src/hooks/useKeyboardSeeking.ts` (renamed to `useShortcutSeeking.ts`), `src/hooks/rating/useKeyboardRating.ts` (renamed to `useRatingShortcuts.ts`), `src/hooks/useShortcutListKey.ts`, `src/helpers/seek-speed.ts`
- `src/components/VideoScroller/index.tsx`, `src/components/slide/MediaSlide/index.tsx`, `src/events.ts` (deleted)
- `src/hooks/useGamepad.ts` (rewrite), `src/store/gamepadState.ts`, `src/hooks/useGamepadStatus.ts`
- `src/components/action-buttons/buttons/RateSceneActionButton.tsx`
- `src/helpers/gamepad/*`, `src/components/GamepadDiagram/`, `src/components/settings/GamepadSettings/` (all new), `src/components/settings/SettingsTab/index.tsx`
- `src/store/tvConfig.ts`, `src/store/globalState.ts`

## Verification

- **Unit tests:**
  - `resolveControlPress`: plain vs held-with, and an axis binding disabling its directions.
  - Preset vs custom resolution.
  - `stickSeekSpeed` in `seek-speed.test.ts`.
  - The stick reader (hysteresis, dominant axis, deadzone) as a pure function.
  - `onShortcut` with both adapters.
- **Hook test:** `useGamepad`, with `navigator.getGamepads` stubbed (`test/setup.ts`) and fake rAF. It checks:
  - press and release edges, kept per pad
  - d-pad ↑ dispatches previous, or speed up while ← is held
  - analog updates and release
- **Component tests:**
  - The Gamepad section shows only when connected.
  - Choosing a preset persists `gamepadMapping`.
  - Custom: a select updates bindings, and Copy from preset works.
  - The diagram renders callouts.
- **Integration tests:**
  - Gamepad play/pause and next on the current slide.
  - Gamepad "rate" opens the rate panel.
  - Gamepad unset-rating.
- **Regressions:** the existing keyboard suites still pass after the `onShortcut` refactor and the registry split:
  - `keyboard-shortcuts.test.ts`
  - `useKeyboardShortcuts.test.ts`
  - the keyboard-rating integration tests
  - `keyboardShortcutSettings.test.tsx`
  - `e2e/keyboard-seeking.test.ts`
- Run `yarn typecheck` and `yarn test` from the repo root, after checking system load.
- **Manual:** `yarn dev` with a real controller.
  - The section appears on connect.
  - The presets work.
  - Left-stick seek speed scales with deflection.
  - Custom remapping applies live.
  - Forced landscape keeps d-pad up = previous.
