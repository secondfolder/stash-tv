# Auto-hide the UI after mouse inactivity

## Context

Today the UI only hides when the user toggles the `ui-visibility` action button, which flips the persisted `tvConfig.uiVisible`. That value drives `hide-controls` on each `MediaSlide`, the `active` class on `ActionButtonStack`, the folder popover's `hide` class and `FeedbackOverlay`'s `muted` class. The UI then fades through the `.hide-on-ui-hide` / `.dim-on-ui-hide` CSS in `MediaSlide.scss`.

The goal is to fade the UI out automatically, as video players do, once a **mouse** user has been idle for a while, and to bring it back on any interaction. Touch use is unchanged. The explicit button keeps working as it does now.

Decisions made with the user:
- **Delay:** a setting (with an Off option), defaulting to video.js's own `inactivityTimeout` default of **2s**.
- **Don't auto-hide while:**
  - the pointer is over UI controls;
  - the current video is paused;
  - a blocking panel is open: Settings, the keyboard shortcuts modal, the guide overlay, any Bootstrap modal, or the scene info panel *in editing mode*. Action-button side panels, open folders and the normal scene info panel do **not** block it.
- **Cursor** is hidden over the feed while the UI is auto-hidden.
- **Clicking the dimmed Show/Hide UI button while auto-hidden only wakes the UI.** It doesn't toggle the setting.

## Design

Two separate things decide whether the UI shows:
- `tvConfig.uiVisible` is the user's explicit, persisted choice, and stays unchanged.
- A new transient `globalState.uiIdle` is set by the auto-hide hook and never persisted.

What's shown is `uiVisible && !uiIdle`.

### 1. State
- `src/store/globalState.ts`: add `uiIdle: boolean` (default `false`).
- `src/store/tvConfig.ts`: add `uiAutoHideDelay: number` (seconds; `0` = off), default `2`. Stored in Stash config, the default backend; it isn't added to `localStorageKeys`.

### 2. `useUiVisible()` hook: `src/hooks/useUiVisible.ts`
Returns `{ uiVisible, uiIdle, shown }`, where `shown = uiVisible && !uiIdle`. Replace the reads of `uiVisible` that drive display with `shown`:
- `src/components/slide/MediaSlide/index.tsx`: `hide-controls: !shown`, plus a new `ui-idle` class when `uiIdle`, for the cursor.
- `src/components/action-buttons/ActionButtonStack/index.tsx`: the stack's `active` class (line 89) and the folder popover's `hide` class (line 225).
- `src/components/FeedbackOverlay/index.tsx`: `muted`.

`UiVisibilityActionButton` keeps showing and toggling the persisted `uiVisible`, since its state is the user's choice.

### 3. `useUiAutoHide()` hook: `src/hooks/useUiAutoHide.ts`, called once from `FeedPage`
Window listeners, all in the capture phase, active only once `tvConfigLoaded`, while `uiVisible` is true and the delay is above 0:
- **Mouse mode:** a `pointermove` / `pointerdown` with `pointerType === "mouse"` enters mouse mode and restarts the timer. A touch or pen pointer event leaves mouse mode: it clears the timer and sets `uiIdle` to false. (Check that `useViewportRotate`'s remapping of `pointermove` keeps `pointerType`.)
- **Other interaction** (`keydown`, `wheel`) wakes the UI and, in mouse mode, restarts the timer.
- **Hovering controls:** on each pointer event, record whether `event.target.closest(UI_CONTROLS_SELECTOR)` matched. The selector covers `.hide-on-ui-hide`, `.dim-on-ui-hide`, `.vjs-control-bar`, `.ActionButtonStack` and `.SceneInfo.active`; put it in `src/constants`. While hovering one, no timer runs.
- **When the timer fires:** set `uiIdle` to true unless blocked. Blocked means any of:
  - the current video is paused: `.MediaSlide.current-video video`'s `paused`;
  - `showSettings`, `keyboardShortcutsOpen`, `showGuideOverlay` or `sceneInfoDraft !== null`;
  - `document.body.classList.contains("modal-open")`.

  If blocked, stay shown. Every way a blocker goes away is itself an interaction (a click, Escape) or a `play`, so the timer restarts then and nothing needs polling.
- **Playing resumes:** a capture-phase `play` listener on `document`, filtered to the current slide's video, restarts the timer in mouse mode, covering auto-advance and gamepad play.
- **A press that wakes the UI doesn't also activate the control under it.** A `pointerdown` that sets `uiIdle` to false marks the press, and a capture-phase `click` on a `UI_CONTROLS_SELECTOR` target from that press is swallowed (`stopPropagation` + `preventDefault`). Clicks on the video itself still play and pause. This is what makes the button "just wake" (mainly for a touch after mouse use, since moving a mouse onto the button already wakes the UI). Hidden controls can't be clicked anyway (`visibility: hidden`).
- Turning `uiVisible` off, setting the delay to 0, or unmounting clears the timer and sets `uiIdle` to false.

### 4. CSS: `src/components/slide/MediaSlide/MediaSlide.scss`
`.MediaSlide.ui-idle, .MediaSlide.ui-idle * { cursor: none; }`. The fade reuses the existing `hide-controls` rules, so there's no new transition.

### 5. Setting UI: `src/components/settings/SettingsTab/index.tsx`, UI section
Add an "Auto-hide UI" `Select` beside "Left-handed UI" with the options Off / 1s / 2s / 3s / 5s / 10s, and help text: "When using a mouse, fade out the UI after this long without any interaction."

### 6. Docs
- `docs/action-buttons.md`: extend the `hide-on-ui-hide` convention note to say that classes also hide on mouse inactivity, and link the new section.
- New section "UI visibility & auto-hide" in `docs/state-and-config.md`: the two-source model, the `useUiVisible` rule (read `shown`, never `uiVisible`, for display), the blockers, the swallowed waking click, and mouse-only detection.
- `AGENTS.md`: add `useUiVisible()` / `useUiAutoHide()` to Key Hooks, list the auto-hide under Notable Features, and add `uiIdle` to the `globalState.ts` bullet.

## Tests
- **Unit:** `test/unit/hooks/useUiAutoHide.test.tsx` with fake timers (`setTimeout` / `clearTimeout` only, as in `docs/testing.md`), dispatching `PointerEvent`s. It covers:
  - mouse idle hides after the delay;
  - touch never hides;
  - a keypress or mouse move wakes the UI;
  - hovering a control, a paused video, `showSettings`, `sceneInfoDraft` and `modal-open` each block hiding;
  - delay 0 and `uiVisible: false` do nothing;
  - the waking click on a control is swallowed but a click on the video isn't.

  Each test cites `@see docs/state-and-config.md § "UI visibility & auto-hide"`.
- **Unit:** extend `toggleActionButtons.test.tsx` if needed; the button's persisted toggle behaviour is unchanged.
- **E2E:** `test/e2e/ui-auto-hide.test.ts` (Playwright). Move the mouse over the video, wait past 2s, and check that the action buttons are hidden and the cursor is `none`. Then move the mouse and check they're back. Also check that resting over an action button keeps them visible.

## Verification
- `yarn typecheck`, `yarn --cwd packages/tv-ui test`, `yarn test:e2e` (check system load first).
- Manual run with `yarn dev`:
  - With a mouse, the UI fades after 2s and the cursor goes. Moving, scrolling or pressing a key brings both back.
  - A paused video, hovering the buttons, the Settings tab open and the scene info editor open each keep the UI.
  - Touch emulation in DevTools never auto-hides.
  - The explicit Hide UI button still works and persists.
