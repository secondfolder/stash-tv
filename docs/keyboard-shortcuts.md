# Keyboard shortcuts

How Stash TV's keyboard shortcuts are wired, how users change them, and the rules for adding or changing one.

## The registry

Every shortcut is an **action** in `SHORTCUT_DEFINITIONS` (`src/helpers/keyboard-shortcuts/definitions.ts`). An action has:
- a title, shown in the settings
- a group (General, Playback, Scene/Marker Actions, Display), the same groups as the help
- its default keys, either one set or one per rating system (`unset-rating` is `r 0` for stars, but ``r ` `` for decimal, where `r 0` starts `r 0 0`)
- optionally, `heldWith`: actions whose keys are held down while pressing this one's (see [Held keys](#held-keys))

The user's keys are tvConfig's `keyboardShortcuts`, which is synced through Stash's config like most settings. It holds **only the actions the user has changed**: an action left out has its defaults. So a new action, or a new default, reaches users who never touched it. Resetting an action deletes its entry (`withActionBindings()` does this whenever an action is given its defaults). An empty list turns a shortcut off.

To add a shortcut:
1. Add an action to `SHORTCUT_DEFINITIONS`.
2. Add a row for it to `HELP_ENTRIES` (see [Help text](#help-text)).
3. Handle it in a listener with `matchShortcut(event, [actionId])` (see [Where shortcuts live](#where-shortcuts-live)).

Settings list every action, so nothing else needs to change.

## Key sequences

A binding is a **key sequence**: one or more key combos pressed one after another, written Mousetrap style with a space between them. Examples: `d`, `g i`, `Ctrl+k s`. The space bar is written `Space`, so a space always separates combos. `src/helpers/keyboard-shortcuts/key-sequences.ts` parses and formats them.

### Key combos

A combo is a normalised string of modifiers (`Ctrl`, `Alt`, `Meta`, `Shift`, in that order), then any other keys held down while it's pressed (a **chord**, in alphabetical order), then the key, joined with `+`. Examples: `d`, `Shift+d`, `Ctrl+Alt+k`, `Space`, `ArrowUp`, `?`, `g+m` (m pressed while holding g). `src/helpers/keyboard-shortcuts/key-combos.ts` turns events into combos (`comboFromEvent()`) and combos into labels (`formatKeyCombo()`).

- The key is `KeyboardEvent.key`, so it follows the keyboard layout: `?` is `?` wherever it is on the keyboard.
- **Shift:** letters are lower case with Shift written (`Shift+d`). Any other character already says whether Shift was held (`?`, not `Shift+/`), so Shift isn't written for it. Named keys write Shift (`Shift+ArrowUp`).
- Modifiers must match exactly: `d` doesn't fire on Ctrl+D, so browser shortcuts keep working.
- A modifier pressed on its own isn't a combo; it's the start of one.
- ⚠️ On macOS, Alt (⌥) changes the character typed, so ⌥D is recorded as `Alt+∂`. That works where it was recorded, but may not on a computer with another OS or layout, since bindings sync.
- Labels show letters in lower case, like Stash's own shortcut list, and macOS's modifier symbols (⌃⌥⌘⇧) on a Mac.
- In text (help, warnings, accessible names) a combo's parts are joined with ` + ` (`g + m`). The settings' chips (`ShortcutKeys`) join them with a faint `+` and no spaces (`g+m`), as it isn't a key itself.

### Held keys

`trackHeldKeys()` (via `useHeldKeyTracking()`, called by `FeedPage`) keeps track of the keys held down, so a key pressed while holding another is matched as a chord.
- **Falling back:** if no shortcut has the chord, the key is matched on its own. When typing quickly, a sequence's next key often goes down before the one before it comes up, and that mustn't break it.
- **Stuck keys:** held keys are forgotten when the page loses focus (their release never comes), and when ⌘ is let go of (on macOS no other key's release comes while ⌘ is held).
- **`heldWith`:** a definition can say its keys are pressed while holding another action's keys. Its own binding is just the key pressed (↑), and the held part follows those actions' keys:
  - It's expanded to one chord per held key (`ArrowLeft+ArrowUp`, `ArrowRight+ArrowUp`) for matching and clashes (`shortcutPatterns()`).
  - It's shown as a fixed part before the keys: `{←/→}+↑` (`formatHeldWithKeys()`).
  - Speed up and slow down use it, held with the seek keys. Rebinding seek to `j`/`l` makes speed up `{j/l}+↑` with no other change. They only do anything while rewinding or fast forwarding: `useKeyboardSeeking` ignores them otherwise.
  - Since ↑ held with a seek key is a different combo from ↑ alone, it never goes to the previous media while seeking.
  - An action whose `heldWith` actions have no keys between them can't be used, so the settings hide it (the seek speed with no seek keys). It comes back with its keys when they get some.

## Matching

`src/hooks/useKeyboardShortcuts.ts`:
- `matchShortcut(event, actionIds)` gives which of the actions a key press is for.
- `shortcutDigits(event)` gives the digits typed into the rating's sequence.
- `matchShortcutKey(event, actionIds)` is for key releases. It compares only the key with the last key of each sequence, so a held shortcut still ends if a modifier is let go of first.
- `useShortcutBindings()` gives the resolved bindings for rendering.

**The sequence tracker** (module state) works out what each key press is for:
- The first `matchShortcut` call for an event resolves it, and the result is cached for that event. Every listener asking about the same press gets the same answer, whatever order they run in.
- It reads the bindings, forced landscape and the rating system from the stores when called, so listeners never need re-adding when the user changes a binding.
- The press's combo is added to the combos typed so far, then:
  1. **They complete sequences:** the press is for those actions (all of them; each listener picks the ones it handles), and the sequence is reset.
  2. **They start a sequence:** nothing matches yet.
     - The tracker waits up to **1s for the next key**, each key getting a second of its own.
     - It blurs the focused element, so the video player can't take the keys (Video.js seeks with digits).
  3. **Neither:** the key is tried again on its own, as the start of a new sequence. So `r` then `m` still mutes.
- A complete match wins at once. A longer sequence it starts can never be typed, which is why the settings don't allow one sequence to start another.
- A **key repeat** of the key that completed the last match gives the same match, so a held shortcut (a seek key) keeps matching. Its repeats never reach Video.js.

Rules:
- **Forced landscape:** arrow keys are matched as they would be in portrait (`rotateForLandscape()`: → is ↓, ← is ↑, ↑ is →, ↓ is ←), at every step of a sequence, since the screen is turned 90° counter-clockwise. Bindings are always stored in portrait terms; the settings record a key pressed in landscape the same way.
- **Clashes:** `findClashingBindings()` (`definitions.ts`) compares what's typed step by step, with the rating's digits as slots (see [Rating shortcuts](#rating-shortcuts)) and `heldWith` bindings in each of their chords. Two bindings clash if they're **the same**, or one **starts** the other.
- **Not while recording:** nothing matches while a key is being recorded in the settings (`globalState.recordingShortcut`).
- **Not while typing:** nothing matches for events from text inputs, textareas, selects, contenteditable elements and sliders (`isTypingTarget()`), so typing in a form never triggers a shortcut or carries on a sequence.
- **Rating system:** the tracker needs Stash's rating system outside React, so `useSyncRatingSystem()` (called by `FeedPage`) copies it from Stash's configuration (`ui.ratingSystemOptions.type`, stars by default) into `globalState.ratingSystem`. The settings and help read it from there too.

## Where shortcuts live

The listeners, each using `matchShortcut`:

- **Next/previous and the CRT toggle**: `VideoScroller`, as plain `window` keydown listeners.
- **Per-slide shortcuts** (delete, tag edit, info, mute, looping, subtitles, fullscreen, picture-in-picture, landscape): `MediaSlide`, as `window` keydown listeners registered only while `isCurrentVideo` is true. An action → handler map.
- **Seeking and play/pause** (seek backwards/forwards, speed up/slow down while seeking, play/pause): `useKeyboardSeeking()` (`src/hooks/`), called by `MediaSlide`, likewise only while `isCurrentVideo`.
  - Its listeners use the capture phase, so Video.js never sees the arrow keys.
  - Holding is about the last key of the sequence.
  - It shares its seeking with gestures (see [video player](video-player.md) § "Gestures").
- **Help**: `useShortcutListKey()` (`src/hooks/`), called by `FeedPage`. It's a `window` keydown listener, `?` by default, mirroring Stash's `?` (which opens Stash's manual).
  - It sets `globalState.keyboardShortcutsOpen`, which also backs the Settings → "Show Keyboard Shortcuts" button, so the modal is rendered by `FeedPage` rather than inside `SettingsTab`.
- **Rating**: `useKeyboardRating()` (`src/hooks/rating/`). See [Rating shortcuts](#rating-shortcuts).

⚠️ **Gamepads:** `useGamepad()` turns the d-pad into arrow key events, so the d-pad does whatever the arrow keys are bound to. If the user moves next/previous or seeking off the arrows, the d-pad stops doing them.

⚠️ **Video.js's own hotkeys** (Stash's `handleHotkeys`: arrows, Space, m, f, l, digits…) still apply while the player itself has focus. Our seeking listener captures the keys it's bound to before Video.js sees them, so those never reach it. But a key the user has unbound can.

## Changing shortcuts

The **Settings → Keyboard Shortcuts** section (`src/components/settings/KeyboardShortcutSettings/`) lists every action by group. Each binding is a chip (Stash's `.tag-item` badge) showing its sequence, with a × to remove it. The rating's chips end in its digits (`r {1-5}` or `r {0-9} {0-9}`), shown like the rest of the keys, so it's clear a number is typed after them.

Keys are typed into a **command palette**: `ShortcutRecorder` (`src/components/settings/ShortcutRecorder/`), built on the generic `CommandPalette` (`src/components/CommandPalette/`).
- **+** opens it to add a binding. Clicking a chip's keys opens it with them filled in, to change that binding.
- It shows "Type shortcut to …" with the action's title (in lower case, unless it starts with an acronym, so the placeholder is in sentence case) until a key is typed. Every key typed (with its modifiers) is added to the sequence, shown as key badges with "then" between them. A modifier pressed on its own isn't a key.
- Clicking a key typed removes it (hovering over it darkens it and shows an ×), and typing carries on.
- For the rating action, once anything's been typed, its digits follow as tokens of their own (`then {1-5}`, or `then {0-9} then {0-9}`). They're fixed: they can't be removed, and hovering over them shows nothing. Only the keys before them are saved.
- A key pressed while holding the key just typed becomes a chord with it, in its place (hold `g`, press `m`: `g + m`).
- For an action with `heldWith` (the seek speed), once anything's been typed, the held part comes first as a fixed token joined by `+` (`{←/→} + ↑`). Holding a seek key while typing, as when using the shortcut, doesn't record it.
- **Done** saves the sequence (adding it, or in place of the one changed), and is disabled while nothing's been typed. **Cancel** closes it, changing nothing, as Escape does. Both sit at the end of the bar.
- **Escape** closes it, changing nothing, and **Tab** moves to its buttons. So neither can be part of a shortcut (Stash's modals use Escape too).
- While it's open, `globalState.recordingShortcut` is set, so no shortcut fires (see [Matching](#matching)). The keys it takes are `preventDefault`ed, so Space doesn't scroll and Enter doesn't press anything.

**Clashes** (see [Matching](#matching)):
- **As keys are typed**, the palette lists the bindings that clash with them and would be taken away, e.g. 'The "g m" shortcut for "Mute/unmute" will be removed as it starts with the same key' (or 'keys', for as many as they share; 'as it uses the same key' for exactly the same keys). Nothing changes until Done, which turns the warnings' colour while there are any.
- **On Done**, those bindings are taken from their actions, and a note under the action says so.
- Clashes can still come about without the settings, e.g. when Stash's rating system changes and a stars `r 0` now starts a decimal `r 0 0`. A row whose bindings clash shows a warning under it (`describeClashes()`).

An action the user has changed gets a **Reset** button. **Reset all to default** clears `keyboardShortcuts`.

The settings accordion is controlled by `globalState.settingsSection` (Channels by default), so other parts of the app can open Settings at a section. The help modal's **Edit shortcuts** button does this, opening Settings at Keyboard Shortcuts.

### The command palette

`CommandPalette` is generic, for anything that wants a palette: searching commands, channels…
- It's a react-bootstrap modal (our `containers/Modal`) dropping down from near the top of the screen. It's **just a bar**, not a window: the input, then any `inputSuffix`, then the `actions` as buttons. Notes (`status`) and results (`items`) go in a panel hanging from the bottom of the bar with no gap, a little narrower than it, and only shown when there's something in it. The bar keeps its rounded corners. The bar and panel have Stash's card background (`$card-bg`). Only the bar is outlined while the input has focus. The palette appears at once, without Bootstrap's fade and slide down; only the backdrop is animated.
- **Text mode** (the default): a text field (`query`/`onQueryChange`) with results under it (`items`, filtered by the caller). ↑ and ↓ move between the results, and Enter or a click picks one.
- **Custom input:** `inputContent` replaces the text field with any content, in a focusable `role="textbox"`. `onInputKeyDown` gets its key presses first; ShortcutRecorder records keys this way.
- `inputSuffix` (read-only content after the input), `status` (notes), and `actions` (buttons in the bar; `focusInput` puts focus back in the input afterwards, e.g. after an action that disables itself).
- **`CommandPaletteToken`**: a token for a custom input (Stash's tag badge). Given `onRemove`, it's removed by clicking it: hovering darkens it and shows an ×, clicking it leaves focus in the input, and Tab skips it. Without `onRemove` it's fixed, looking the same with nothing on hover.
- **`backdrop`** (default true): a backdrop that fades in (0.45s, slower than it fades out, at 0.25s), darkening the page and blurring it slightly (`.CommandPalette-backdrop`). ⚠️ Not blurred in Firefox: on macOS it can draw a playing video as an OS overlay, which `backdrop-filter` can't blur, so some videos blurred and others didn't. A palette unmounted rather than given `show={false}`, as `ShortcutRecorder` is, disappears at once. Without it the backdrop is still there but unseen, as react-bootstrap only closes a modal on a click outside through its backdrop.
- **Focus is trapped in it:** Tab and Shift+Tab go round its own controls, from the last back to the first and the other way, and never reach the page behind. react-bootstrap's `enforceFocus` only brings focus back once it has left, so the palette handles Tab itself.
- ⚠️ **It handles Escape itself, by `event.key`**, with the modal's `keyboard` off. react-bootstrap only recognises Escape by the legacy `keyCode`, which userEvent leaves at 0 in tests.

## Help text

The shortcut list (`?`, or Settings → Help / Info → "Show Keyboard Shortcuts") is generated from the user's bindings. `shortcutHelpMarkdown()` (`src/components/settings/KeyboardShortcutsInfo/help-text.ts`) writes a markdown table per group, like Stash's own `KeyboardShortcuts.md` manual page:
- It works from `HELP_ENTRIES`, each about one or more actions.
- An entry is left out if one of its actions has no keys.
- Entries describing more than a key press write it with the user's keys: holding a seek key, or the rating's keys then its digits for the rating system.

`KeyboardShortcutsInfo` hands the markdown to Stash's `MarkdownPage` as a `data:` URL, since that component only accepts a URL to fetch. Its footer's **Edit shortcuts** button opens the settings section (see [Changing shortcuts](#changing-shortcuts)).

⚠️ **Any change that adds or removes a shortcut action, or changes what one does, must update `HELP_ENTRIES` in the same change.** Where a shortcut matches one of Stash's, reuse the wording from Stash's manual (`packages/stash-ui/stash/ui/v2.5/src/docs/en/Manual/KeyboardShortcuts.md`), so users see the same description in both apps.

## Rating shortcuts

The rating action's keys (`r` by default) then digits set the rating of the current slide's scene. A marker slide rates its parent scene, matching the rate action button.
- **Stars:** one digit, `{1-5}`.
- **Decimal:** two digits, `{0-9} {0-9}`, with `00` for 10.0.

Which applies follows Stash's configured rating system. The digits are slots in the action's pattern (`shortcutPattern()`), so they take part in matching and clashes like any other key. The digits can't be changed; the keys before them can, and can be a sequence (`g r`).

**Unset rating** is an action of its own, an ordinary sequence: `r 0` for stars and ``r ` `` for decimal by default.

`useKeyboardRating(scene, { enabled })` (`src/hooks/rating/`) listens for both actions, turning the digits (`shortcutDigits()`) into a rating100 as Stash's own shortcuts do:
- It's safe to call from every slide: only an `enabled` instance listens. `MediaSlide` passes `enabled: isCurrentVideo`.
- ⚠️ Callers must keep at most one instance enabled at a time. Hand-over between slides relies on both slides' `isCurrentVideo` changing in the same React commit (React 17 runs all effect cleanups before any new effects), which `VideoScroller` guarantees by deriving it from a single `currentIndex`.

How this differs from Stash's own `useRatingKeybinds`, which Stash TV used to use:
- Stash's hardcodes its keys and binds them with Mousetrap. Ours go through the tracker like every other shortcut.
- **A rating's sequence ends once it's complete.** Stash's keeps the digits live for a second after `r`, so a further `5` rates again; ours needs the rating key again.
- Stash's started a fresh 1s timeout on every `r` without cancelling the previous one, so a second rating started ~0.8–1s after the first was silently dropped. The tracker has only one timeout, restarted on every key. (Our stash-ui patch fixes the same bug in Stash's copy, which is worth upstreaming.)
- ⚠️ The tracker's timeout handler must stay named `endSequence`: the integration tests recognise it to hold the window for a next key open (`test/integration/helpers/keyboard-rating.ts`).
