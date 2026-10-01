# Keyboard shortcuts

How Stash TV's keyboard shortcuts are wired, and the rules for adding or changing one.

## Where shortcuts live

- **Feed navigation** (`↑`/`↓`, and `←`/`→` in forced landscape) and the CRT toggle (`c`) — `VideoScroller`, as plain `window` keydown listeners.
- **Per-slide shortcuts** (seeking, play/pause, delete, tag edit, info, mute, looping, subtitles, fullscreen, picture-in-picture, landscape) — `MediaSlide`, as `window` keydown listeners registered only while `isCurrentVideo` is true. Seek listeners use the capture phase so Video.js never sees the arrow keys.
- **Help** (`?`) — `FeedPage`, a `window` keydown listener mirroring Stash's `?` (which opens Stash's manual). It sets `globalState.keyboardShortcutsOpen`, which also backs the Settings → "Show Keyboard Shortcuts" button, so the modal is rendered by `FeedPage` rather than inside `SettingsTab`.
- **Rating** — `useKeyboardRating()` (`src/hooks/rating/`), which reuses Stash's `useRatingKeybinds` (Mousetrap). See [Rating shortcuts](#rating-shortcuts).

Shortcuts ignore key events from text inputs, textareas and sliders so typing in a form never triggers them.

## Help text

The user-facing list is `src/components/settings/KeyboardShortcutsInfo/KeyboardShortcutsInfo.md`, shown from Settings → "Show Keyboard Shortcuts". It is grouped into tables (Playback, Navigation, Scene/marker actions, Display) like Stash's own `KeyboardShortcuts.md` manual page.

Shortcuts that only apply to one of Stash's rating systems (stars vs decimal) carry a trailing `<!-- rating-system: stars -->` / `<!-- rating-system: decimal -->` tag on their table row. `KeyboardShortcutsInfo` drops rows tagged for the other system (per Stash's `ui.ratingSystemOptions.type`, defaulting to stars), strips the tags, and hands the result to Stash's `MarkdownPage` as a `data:` URL, since that component only accepts a URL to fetch.

⚠️ **Any change that adds, removes or rebinds a shortcut must update this help text in the same change.** Where a shortcut matches one of Stash's, reuse the wording from Stash's manual (`packages/stash-ui/stash/ui/v2.5/src/docs/en/Manual/KeyboardShortcuts.md`) so users see the same description in both apps.

## Rating shortcuts

`r {1-5}` / `r 0` (stars) and `r {0-9} {0-9}` / ``r ` `` (decimal) set or unset the rating of the current slide's scene; which form applies follows Stash's configured rating system (`ui.ratingSystemOptions.type`). A marker slide rates its parent scene, matching the rate action button.

Design:

- Stash's `useRatingKeybinds` registers **global** Mousetrap bindings, and Mousetrap keeps one callback per key. If every mounted `MediaSlide` bound them, whichever slide bound last would win (often not the current one), and an off-screen slide unmounting would unbind the keys for everyone.
- So `useKeyboardRating(scene, { enabled })` is safe to call from every slide: only an `enabled` instance binds, and a disabled one neither binds nor unbinds — it's inert. `MediaSlide` passes `enabled: isCurrentVideo`.
- ⚠️ Callers must keep at most one instance enabled at a time. Hand-over between slides relies on both slides' `isCurrentVideo` changing in the same React commit (React 17 runs all effect cleanups before any new effects), which `VideoScroller` guarantees by deriving it from a single `currentIndex`.
- Stash's hook unsets with `NaN`; `useKeyboardRating` maps that to `null` before calling `useSetRating`.
- After `r`, Stash's hook binds the digit keys and unbinds them again after 1 second (in decimal mode the first digit restarts that window, so each keystroke gets a full second). It blurs the focused element first so the video player doesn't treat the digits as seek keys.
- ⚠️ We patch `useRatingKeybinds` (in `packages/stash-ui/patches/stash-tv.patch`): upstream starts a fresh 1s timeout on every `r` without cancelling the previous one, so a second rating started ~0.8–1s after the first was silently dropped when the old timeout fired mid-sequence. The patch keeps a single module-level timeout (module-level because the Mousetrap bindings are global, so a sequence started on one slide must cancel the timeout from another slide's sequence) and cancels it whenever a new sequence starts. Worth upstreaming to Stash, which has the same bug.
