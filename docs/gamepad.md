# Gamepad

How a gamepad (game controller) controls Stash TV: what its controls are, how they're mapped to shortcut actions, how it's read, and the settings for choosing what each control does.

A gamepad does the same **shortcut actions** as the keyboard (see [keyboard shortcuts](keyboard-shortcuts.md)): every action in `SHORTCUT_ACTIONS` (`src/helpers/shortcut-actions/actions.ts`) but rating (see [Rating](#rating)) can be given to a control, and the listeners handling them don't know which was used. A new shortcut action is automatically available to gamepads.

## Controls

`src/helpers/gamepad/controls.ts` lists the controls of the browser's [standard gamepad mapping](https://w3c.github.io/gamepad/#remapping):
- the buttons: face buttons (south, east, west, north), shoulders (LB, RB) and triggers (LT, RT), the d-pad, the stick presses (L3, R3), and the menu buttons (select, start, home, touchpad)
- each stick's four **directions** (`left-stick-up`…), so a stick can be used as four more buttons

Every control can be pressed (given actions). The **stick directions and triggers** can also be read for how far they're pushed or pressed (`isAnalogControl()`), for seeking (see [Analog seeking](#analog-seeking)).

Controls are named as the controller names them: Xbox's (A, B, X, Y, LB…) or PlayStation's (✕, ○, □, △, L1…). Which is decided by the name the browser gives the controller (`controllerLayout()`): Sony's (its vendor ID `054c`, or "DualSense"/"DualShock"/"PlayStation") are PlayStation's, anything else Xbox's.

## Bindings

What the controls do is a `GamepadBindings` (`src/helpers/gamepad/bindings.ts`):
- `buttons`: each control's actions
- `analog`: the stick directions and triggers read as how far they're pushed or pressed, seeking forwards or backwards (`analog-seek-forwards`/`analog-seek-backwards`). A control is one or the other (`withControlAction()`/`withAnalogAction()`), and a control seeking is never pressed. Each direction of a stick is its own control, so ← can seek while → does something else, or both can seek the same way.

**Held with.** On a keyboard, speed up and slow down are ↑ and ↓ pressed while holding a seek key (`heldWith`, see [keyboard shortcuts](keyboard-shortcuts.md) § "Held keys"). A gamepad does the same:
- A control has at most one plain action and at most one `heldWith` action (`controlActions()`).
- Pressed while a control for one of the `heldWith` action's actions is held, it does that. Otherwise it does its plain action (`resolveControlPress()`).
- So the standard preset's d-pad ↑ is "previous media", but "speed up" while d-pad ← or → (or a trigger) is held, just as on a keyboard.

**The user's choice** is tvConfig's `gamepadMapping`: `{ preset, custom }`.
- `preset` is one of the presets or `"custom"`.
- `custom` is the user's own bindings. It's kept when they go back to a preset, so it's still there if they return.
- `resolveGamepadBindings()` gives the bindings to use, leaving out any action or control the app doesn't have. The mapping syncs through Stash's config like the keyboard's, so it may have been saved by another version.

### Presets

`src/helpers/gamepad/presets.ts`. Both share the face and menu buttons:
- A (✕): play/pause. B (○): scene info. X (□): edit tags. Y (△): looping.
- Select and the touchpad: play/pause. Start: fullscreen.

They differ in the rest:

| | Standard (the default) | Sticks |
|---|---|---|
| D-pad ↑ / ↓ | Previous / next (speed up / slow down while seeking) | Scene info / subtitles |
| D-pad ← / → | Rewind / fast forward (tap to skip, hold to seek) | Mute / looping |
| LB / RB | Mute / looping | Rewind / fast forward |
| LT / RT | Rewind / fast forward | — |
| Left stick | — | ↑ / ↓ previous / next, ← / → seeks backwards / forwards at a speed set by how far it's pushed |

The standard preset keeps what gamepads did before they were configurable (the d-pad as the arrow keys, select playing/pausing).

### Changing a preset

Changing a preset changes what someone's gamepad does under their thumbs, so it's done deliberately:
- `test/unit/helpers/gamepad-presets.test.ts` holds a copy of every preset as released (written out, not a snapshot, which `-u` would quietly rewrite), so changing one fails it until the copy's updated by hand.
- **A change that could upset someone used to the old preset** (an action moved to another control, or taken away) also adds a tvConfig migration step (see [state & config](state-and-config.md) § "Migrations") calling `keepOldPreset(state, presetId, oldBindings)` (`src/helpers/gamepad/preset-changes.ts`) with the preset's old bindings. Anyone who has that preset chosen and has used a gamepad is moved onto a custom mapping of the old bindings, so nothing changes for them; they can choose the preset again to get the new one.
- **A change that only adds** (an action for a control that had none) needs no migration, so everyone gets it.
- Whether someone has used a gamepad is tvConfig's `gamepadUsed`, set by `useGamepad()` once a gamepad has connected (and the config's loaded, so it's saved). A fake one doesn't count. Without it, everyone would be moved, since the default preset is saved along with the rest of their settings, and people who've never used a gamepad would never get an improved preset.
- It syncs through Stash, so the migration runs once for a user, not on each of their devices.

## Reading the gamepad

Browsers don't send events for gamepad input, so gamepads are polled. `useGamepad()` (`src/hooks/`, called once by `App`):
- reads every gamepad once a frame (`requestAnimationFrame`), but only while one's connected
- keeps `gamepadState` (`src/store/`) up to date: whether one's connected, its layout, and the controls held down (which the settings light up)
- remembers in tvConfig's `gamepadUsed` that one's been connected (see [Changing a preset](#changing-a-preset))
- reads the mapping from the store every frame, so a change in the settings applies at once

What changed since the last frame is worked out by `readGamepad()` (`src/helpers/gamepad/reader.ts`), a pure function so it can be tested without a gamepad:
- **Buttons** send their actions as they're pressed and as they're released. A release is sent with the actions its press was, even if what the control does has changed since (a d-pad ↑ pressed as "speed up" releases "speed up").
- **Stick directions** are pressed once pushed past 0.5 and released once back within 0.3, so one held near the threshold doesn't flicker. A direction is only pressed if it's the way the stick is mostly pushed, so a diagonal can't press two. It isn't pressed while another direction of the same stick is seeking either.
- **Controls bound to seeking** (stick directions, and triggers by their `value`) are read for how far they're pushed or pressed, 0 within the deadzone (0.2, `analogDeadzone` in `seek-speed.ts`). The one pushed furthest seeks: its amount (negative to seek backwards) is sent whenever it changes by more than 0.02, and 0 once none is. A stick direction isn't read while another direction of the same stick is held as a button, so pushing up for the previous media doesn't seek a little too.
- **A gamepad that's gone** has everything it held released, so a seek can't carry on forever.
- Each gamepad's state is kept apart, so two gamepads don't interfere.

The actions are sent as a `window` event (`GAMEPAD_ACTION_EVENT`, `src/helpers/shortcut-actions/input.ts`), which `onShortcut()` hands to its listeners as it does key presses (see [keyboard shortcuts](keyboard-shortcuts.md) § "Where shortcuts live"). Nothing is pressed while a shortcut's keys are being typed into the settings, as for the keyboard.

There's no turning for forced landscape: a gamepad doesn't turn with the screen, so d-pad ↑ is always the previous media. (When the d-pad sent arrow keys, it was turned so that the keyboard's own turning cancelled it out.)

## Analog seeking

A stick direction or trigger bound to seeking works like a hold on the video (see [video player](video-player.md) § "Gestures"), with how far it's pushed or pressed in place of a drag. `useShortcutSeeking()` handles it, with `onAnalogSeek()`:
- **Flicked** (let go of within 250ms, the gestures' `holdDelay`), it skips back or forwards like a tap.
- **Held**, it seeks at `analogSeekSpeed()` (`src/helpers/seek-speed.ts`): 1.5x either way just past the deadzone, as a hold from the left or right of the video is, plus the 4th power of how much further it's pushed (a quarter of the rest of the way adds 1, all of the way 256), by at most a third of the video's duration. The speed follows the control as it moves, and seeking ends when it's let go of.

## Rating

Rating is the one shortcut action a gamepad can't do: it's the rating key followed by the rating's digits, which a gamepad can't type. So it's left out of the actions a control can be given (`GAMEPAD_ACTION_IDS`), and out of a saved mapping that has it (`resolveGamepadBindings()`). "Unset rating" works from a gamepad as it does from the keyboard.

## Settings

**Settings → Game Controller** (`src/components/settings/GamepadSettings/`) is only there while a gamepad is connected.
- **The presets and Custom** are buttons, each with a small `GamepadDiagram` of the controller's front showing what it does. Choosing Custom the first time starts it as a copy of the mapping chosen before.
- **Two large diagrams** label each control with what it does (the actions' `shortTitle`s), and light up the controls held down, so pressing a control shows which it is: the controller's front, and under it its top edge with the shoulders and triggers.
- **With Custom chosen**, every control is listed by group (the groups spaced apart, each heading nearer its controls than the group above), each its name with a dropdown beside it taking the rest of the line. Each is named without what its group's heading already says (`controlShortLabel()`): the d-pad's buttons and the sticks' directions by just their arrows, a stick's press as "Press (L3)". The dropdown has every action but speed up and slow down (which only do anything while a seek control is held, and stay in the presets for the d-pad). Choosing one gives the control just that action, so a control copied from a preset that also sped up or slowed down while seeking (the standard preset's d-pad ↑ and ↓) no longer does. For a stick direction or trigger, the Playback group also has **Fast forward** and **Rewind**, seeking at a speed set by how far it's pushed or pressed ("faster the further it's pushed", or "the harder it's pressed"), shown as just "Fast forward"/"Rewind" once chosen. The row of a control held down is lit up. **Reset to…** replaces the custom mapping with a preset's.

`GamepadDiagram` (`src/components/GamepadDiagram/`) is an inline SVG drawn in JSX, in one of two views (`view`):
- **Front** (the default): every control but the shoulders and triggers, in an outline shaped like a real controller (grips reaching well below the middle).
- **Top**: the controller's top edge seen from above, its front towards the bottom: the shoulders along the front, the triggers behind them. The shoulders and triggers are drawn here because they can't be seen from the front; drawn above the front view's outline they looked like they were floating.

It's shown at about half its drawn size in the narrow settings panel, so its controls are drawn larger than a real controller's and its labels are large (24 high, coming out about 12px). It's drawn as the connected controller is laid out (`gamepadState.layout`, see [Controls](#controls)):
- **PlayStation:** the d-pad above both sticks, a touchpad near the top with Share and Options either side of it, the PS button between the sticks.
- **Xbox:** the left stick above the d-pad, the Guide button with View, Share and Menu in a row under it.
- The face buttons, shoulders and triggers have that controller's names on them (✕○□△ and L1/L2, or A/B/X/Y and LB/LT).

The labels:
- **Down the sides**, for the controls either side of the middle, **in clusters**: the labels for one cluster of controls (the d-pad, a stick, the face buttons) are together, centred on it, with a gap before the next cluster's, so each reads as one. The gap is as big as there's room for (down to none), and the labels can go below the grips to make room; the diagram is as tall as its labels need. A label's line starts at the edge of a control with a name on it (a face button, a shoulder), so it doesn't run over the name. A stick direction's line ends inside the stick, short of its edge, towards the way it's pushed. Lines have no dot at their end.
- **In a row above the controller**, for the controls in its middle (Share, Options, the touchpad, View, Menu, Guide), in the same order as they are, so their lines don't cross. One low in the middle (the PS button, between the sticks) is labelled below the controller instead, as its line up would cross the others.
- **Only a control's own action** is shown, not what it does while holding a seek control (speeding up or slowing down), which would crowd the diagram. A control given only that shows it.
- **A control seeking** is labelled "Fast fwd" or "Rewind", and a jump forwards or backwards (tap to skip, hold to seek at 2x) "Jump fwd" or "Jump back", so the two read differently.
- **Hovering** over a control, its label or its line turns all three light purple (`--purple` mixed with white, so it stands out on the dark controller), to show which goes with which. A control held down is yellow (`--yellow`), as is its label. Labels and their lines are drawn over the controls, but a line lets the mouse through to them: it's hovered over by a wider, invisible line under the controls. So a line crossing a control never takes the hover from it. A control that does nothing has no label, so just it lights up. With Custom chosen, the control's field lights up too (until it's no longer hovered over), and hovering over a field lights up its control and label in the diagram (but not the field itself, which the mouse is already over): the settings share one hovered control between the diagrams and the fields (`hovered`/`onHoveredChange`), with where it's hovered over.
- **Clicking** a control or its label, with Custom chosen, scrolls the settings to its field, which lights up in the same purple for 1.5s and then fades out over 1s (`onControlClick`). With a preset chosen there are no fields, so clicking does nothing.
- **A stick** is drawn in five parts that light up on their own: its middle, for its press (L3/R3), and a quarter of the ring around it for each direction. So hovering over a direction's label, field or quarter, or pushing that way, lights up just that quarter, and the press just the middle.

## Trying it without a gamepad

Browsers only report a real gamepad once it's been used, so **Settings → Developer Options → Fake gamepad** connects a pretend one (Xbox or PlayStation), so the Game Controller settings show and can be tried. `useFakeGamepad()` (`src/hooks/`, called by `App`) puts it in the first slot of `navigator.getGamepads()` and sends `gamepadconnected`, and choosing None takes it away again. The choice is tvConfig's `fakeGamepad`, kept on the device (localStorage) rather than in Stash, so it lasts through reloads without reaching other devices.

While it's connected, its controls can be worked from the browser's console:
- `fakeGamepad.press("south")` presses a control and lets go of it.
- `fakeGamepad.hold("dpad-right", true)` holds one down (`false` lets go).
- `fakeGamepad.push("left-stick-right", 0.8)` pushes a stick that way, or presses a trigger, 0 to 1 of the way.

The E2E tests use a fake gamepad of their own (`test/e2e/helpers/gamepad.ts`), added before the page loads.

The gamepad icon in the player's control bar only says that a gamepad has connected: it shows for a few seconds and isn't a button.
