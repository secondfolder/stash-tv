# Video Player

How video playback works: Stash TV's `ScenePlayer` wraps Stash's ScenePlayer (via the stash-ui wrapper), which wraps Video.js — plus the many workarounds Stash's component requires.

**Read this when:** touching `ScenePlayer`, `MarkerPlayer`, Video.js setup/options/plugins, playback behaviour, or video-related DOM structure.

---

## Architecture

- `packages/tv-ui/src/components/ScenePlayer/index.tsx` — our ScenePlayer wrapper component
- Stash's ScenePlayer (imported from `stash-ui/wrappers/components/ScenePlayer`) — wraps Video.js
- `src/components/ScenePlayer/video.js/` — Video.js helpers (`allow-plugin-removal.ts`, `usePlayerManager.ts`, etc.)
- Feed playback is virtualized: `VideoScroller` renders multiple player instances, only visible slides mounted
- Global additions: hooks and middleware go on Video.js itself, one instance shared by every copy of our modules, so add them with `addVideoJsHook(key, …)` / `useVideoJsMiddleware(key, …)` (`video.js/global-additions.ts`), not `videojs.hook()` / `videojs.use()`. ⚠️ A module evaluated again (a hot reload in development, every boot in the integration tests) would otherwise add them again, and every copy would run on every player from then on. Under a key, only the copy added last runs
- Per-player setup: Video.js only offers global `beforesetup`/`setup` hooks, so `usePlayerManager` registers one of each at module level and dispatches to per-player callbacks (`playerBeforeSetupHook` / `playerSetupHook`), matched by the `data-player-id` on the player's container. ⚠️ A player's callbacks close over its component's props, so they're deleted when it unmounts. Otherwise every player ever shown would be kept in memory, and a later player given the same id would run them.

## Current-Player Tracking

Stash's components assume a single active player at a time. `packages/stash-ui/patches/scene-player-utils.ts` watches for `.current-video` class changes on slides inside `.VideoScroller` and keeps a module-level `VIDEO_PLAYER_ID` pointing at the focused player; Stash components read that ID. `getPlayerPosition()` (same file) returns the current player's playback time. ⚠️ It starts watching the page as it's imported, so a copy evaluated again (a hot reload, or each boot in the integration tests) first stops the previous copy's watchers. Otherwise each copy watched the page for good, keeping that copy of the app in memory (~30MB per test boot).

⚠️ **If adding new video players or changing the slide/scroller DOM structure, ensure that patch still tracks them** (it keys off `.VideoScroller` > children with `.current-video` containing a `video-js` element).

`usePlayerManager.ts` maps newly created Video.js players back to component instances by traversing up the DOM from the player's video element — there's no direct API for this.

---

## Known Stash ScenePlayer Quirks & Our Workarounds

All of these live in `ScenePlayer/index.tsx` unless noted. Understand them before touching playback code:

| Quirk in Stash's ScenePlayer | Workaround |
|---|---|
| Steals focus on mount | `videojs.hook('setup')` stubs `player.focus` to a no-op |
| Autoplays even when `autoplay=false`, if `initialTimestamp > 0` | Pass `initialTimestamp: 0` to the wrapped component and set `currentTime` ourselves once the player is created |
| Starts from `resume_time` even when `initialTimestamp` is 0 | Set `scene.resume_time = Infinity` to short-circuit its logic so `initialTimestamp` wins |
| Buggy `onComplete` handling periodically removes **all** `ended` handlers | `disableBuggyOnEndHandling()` intercepts `player.on/off` to block its internal stub; our own `onEnded` prop attaches directly and only removes its own listener |
| Preview URLs aren't recognised as "direct streams" (hardcoded URL check) → seeking issues | Rewrite `/preview` → `/preview/stream` before the wrapped component processes streams, then wrap the player's `sourceSelector` to revert the URL before Video.js uses it |
| `loop` option is immediately overwritten after init | Set `player.loop()` in a `setTimeout` after setup |
| Sets the poster on every scene change (breaks our poster timing / last-frame poster) | Stub `player.poster()` to a no-op; we control poster timing ourselves |
| Throws on unmount from `vttThumbnails` plugin | On dispose, stub the plugin's private `setupThumbnailElement` |
| Assumes various plugins exist; removing them errors | `allow-plugin-removal.ts` adds stub implementations (e.g. `vrMenu`) |
| Video.js merges `beforesetup` options, so plugin keys can't be deleted | `allow-plugin-removal.ts` replaces the `plugins` object with a string (unmergeable) in one hook, then rebuilds it (minus removed plugins) in a second hook |
| Playback rate cache not set correctly before ready | Manually set `player.cache_.lastPlaybackRate` after `defaultPlaybackRate()` |
| Taps don't produce click events on mobile (video.js#8950) | Listen for Video.js `tap` events and dispatch equivalent `MouseEvent('click')` |

Also note:

- Only a **subset of `SceneDataFragment`** is passed to the wrapped ScenePlayer to reduce network requests — see the `scene` memo in `ScenePlayer/index.tsx`
- We define our own `onEnded` prop instead of the wrapped component's `onComplete` (optional + matches the standard HTMLVideoElement event name)
- Player options are injected/modified via `modifyPlayerSetupOptions` and the `optionsToMerge` /
  `onVideojsPlayerCreated` props
- ⚠️ **A new `scene` object re-renders the player but doesn't reload the video.** Slides get live data from the Apollo cache (see [media loading](docs/media-loading.md) § "Live item data"), so the scene object changes whenever anything about it does, including the play position Stash saves every few seconds. Stash's ScenePlayer only reinitialises the source when `scene.id` changes (its source effect bails out on `scene.id === sceneId.current`). Its other `scene`-dependent effects (markers, interactive) do re-run. Don't key the player on scene data: `MediaSlide` keys `ScenePlayer` on the scene ID and `sceneStreams` only, so a remount happens only when the streams really change (e.g. toggling preview-only)
- ⚠️ **Signed stream URLs change on every refetch.** Stash versions with signed URLs (stashapp/stash#6529) add `cid`/`expires`/`signature` query params that the server regenerates whenever it resolves `sceneStreams`. Stash's save-activity mutation (every 10s of playback, and on pause) evicts all cached `findScenes` results, so the feed query refetches and every scene on that page gets new URLs. The `sceneStreams` part of the key therefore comes from `getSceneStreamsKey()` (`src/helpers/`), which drops those three params. Hashing the raw URLs remounted the player, so playback restarted every 10s. Since the player isn't remounted, it keeps the URL it loaded with, which expires after Stash's signed-URL TTL (24h by default)
- The browser's native PiP hover icon is disabled (`disablePictureInPicture`) as it interferes with our menu overlay. Our own PiP support works around this — see [Picture-in-picture](#picture-in-picture)

---

## Gestures

Tapping, holding and dragging on a slide's video plays, skips and seeks through it. Three hooks that `MediaSlide` calls (in `src/hooks/`), over pure helpers in `src/helpers/seek-speed.ts`:

- `useSeeking()`: the seek engine. `seek(speed)` seeks at a speed until `seek(null)`, showing it in the feedback overlay; `isSeeking()`. Used by both inputs below.
- `useGestureControls()`: pointer input, with `@use-gesture/react`, on the video element, or on iOS on a `div` over it (iOS ignores `user-select: none` on a Video.js video, so a long press there selects text).
- `useKeyboardSeeking()`: the arrow keys and Space (see [keyboard shortcuts](keyboard-shortcuts.md)).

- **Tap** (released within 250ms): the left third skips back, the middle plays/pauses, the right third skips forwards (`seekBackwards` / `seekForwards`: about a third of a short video, less for long ones, snapping to a nearby marker). Taps come from `pointerup`, as Video.js stops click events on touch devices. No feedback is shown. ⚠️ While a video is paused its big play button covers the middle third, so taps (and holds) there go to the button, which plays it.
- **Hold** (250ms or more) seeks until released: rewinding from the left third, paused from the middle, 1.5x from the right. Dragging sideways changes the speed by the 6th power of the distance (a tenth of the video's width changes it by 1), by at most a third of the video's duration either way (`holdSpeed()`). A drag made before the hold registers counts: the hold starts at the speed for where the pointer already is.
- **Speeds** are rounded to steps (`toDiscreteSeekSpeed()`: tenths around normal speed, then whole numbers, then 5s, 15s, 30s and 60s steps). From 0.1x up to 5x the video plays at that rate ("1.5x", play icon). Otherwise it's paused and its time is moved every 100ms ("5s" with a forward or backward icon, or a pause icon at 0), with the progress bar's thumbnail preview showing above 5 forwards or 2 backwards. Markers and previews have no thumbnails: their players get the `vttThumbnails` stub from `allow-plugin-removal.ts`, whose no-op methods the seeking calls. (It used to have only `src()`, so seeking fast threw on every time update, and letting go threw before the overlay was removed, leaving it stuck.)
- **Feedback**: the overlay shows the speed for as long as the hold lasts and is removed straight away (not faded) when it ends.
- **Ending**: letting go restores the video's paused state and playback rate. ⚠️ While seeking, the video is played and paused directly on the `<video>` element and its `pause` events are kept from Video.js (then `handleTechPlay_`/`handleTechPause_` tell Video.js how it was left). Through the Video.js player instead, its big play button shows for as long as a hold pauses the video. It also means seeking bypasses the pause-loading middleware (see [Unloading videos that aren't current](#unloading-videos-that-arent-current)), which is fine as the current slide's video is always loaded. A seek's speed is never the user's playback rate: `MediaSlide` doesn't save rate changes while `isSeeking()`, so other slides keep the user's rate. Seeking never mutes, so mute isn't touched (muting during a hold used to be undone on release).
- **Slide changes**: a gesture belongs to its slide. If the slide stops being current while it's held (the video ended, a shortcut or scrolling moved the feed), the gesture ends there, its video is left paused, and the pointer does nothing more until it's lifted. Otherwise the overlay stayed up and the old slide kept seeking.
- **The ends of the video**: playing or skipping forwards to the end moves on to the next slide. A paused video never fires its own `ended` event, so skipping triggers it. Passing a clip's end timestamp (fixed or random play length) doesn't end the slide while held, as the player is scrubbing; it moves on after release. On a looping video, skipping stops at either end of the loop and says so ("End of loop reached"). The loop ends at the end timestamp or, for items without one (markers, previews), the end of the video. It stops just short of the very end because a looping video moved to its end jumps back to its start.
- **Scrolling**: a scroll in the first 250ms (a touch swipe through the feed) cancels the tap.
- **Mouse buttons and lost presses**: only the primary button makes gestures. A context menu opened during a mouse press (e.g. Ctrl+click on macOS) ends the press without a tap, and so does the window losing focus during any press. ⚠️ Otherwise a right-click counted as a tap, and since the context menu takes the release, the press became a hold that seeked until something else ended it. Touch presses ignore `contextmenu`, as a long press can fire one.
- **Arrow keys** share the seeking: hold ← or → to seek at 2x either way, then ↑ and ↓ step the speed (`toDiscreteSeekSpeed()`'s `faster`/`slower`), or change it by one for each repeat while held.
- ⚠️ use-gesture captures the pointer, so dragging off the video (e.g. over the action buttons) doesn't end a hold.

Tests: `test/e2e/gesture-controls*.test.ts` and `test/e2e/keyboard-seeking.test.ts` (see [testing](testing.md) § "Running E2E tests"), and `test/unit/helpers/seek-speed.test.ts` for the speeds.

---

## Unloading videos that aren't current

When a slide stops being current, `MediaSlide` calls `player.cancelLoading()` (`ScenePlayer/video.js/pause-loading-plugin.ts`) so the rendered slides around it stop downloading. It pauses the video, shows its current frame as the poster, then clears the video's `src`. Playing or seeking it through Video.js loads it again (the plugin's middleware calls `enableLoading()`).

- ⚠️ **The source is unloaded a moment after `cancelLoading()`**, once the frame is showing as the poster. Enabling loading in the meantime calls the unload off. It used not to, so going back to a slide straight after leaving it unloaded the video while it was current, stopping it.
- ⚠️ Calling the `<video>` element's own `play()` bypasses the middleware, so it doesn't load an unloaded video ("The element has no supported sources").

---

## Picture-in-picture

The `picture-in-picture` action button (and the `p` shortcut) puts the current slide's video into the browser's PiP window, and PiP then follows the feed. Helpers live in `src/helpers/picture-in-picture.ts`, hooks in `src/hooks/usePictureInPicture.ts`.

- **Support:** the button hides itself unless `document.pictureInPictureEnabled` is true. That's false on Firefox Android, Android WebView, Firefox before 153, and when a permissions policy blocks PiP.
- **`disablePictureInPicture`:** every player has it set (see above), and it also blocks `requestPictureInPicture()`. Video.js 7 then returns `undefined` instead of a promise. `enterPictureInPicture()` clears it just before the request and restores it when that player fires `leavepictureinpicture`. ⚠️ Don't restore it any earlier: setting it while the video is in PiP closes the PiP window.
- **User gesture:** entering PiP from nothing has to come straight from a click or keypress handler. So the button and the shortcut call `togglePictureInPicture()` synchronously, not through state and an effect.
- **Not-yet-loaded video:** if the first request fails for a video that isn't playing (typically no metadata yet: never played, or unloaded by the pause-loading plugin), `togglePictureInPicture()` plays it, waits up to 5s for `loadedmetadata`, and retries once. The retry relies on the click's transient activation still being valid (about 5s in Chrome and Firefox), hence the timeout. If PiP still can't start, the button opens its side panel asking the user to play the video first; the `p` shortcut only logs the failure. A failed request restores `disablePictureInPicture` straight away.
- **Following the feed:** `useFollowPictureInPicture()` (called by every `MediaSlide`) moves PiP to the current slide's player when it becomes current (or its player is created) while another video is in PiP. Moving PiP needs no user gesture: the spec only requires one when nothing is in PiP yet. `document.pictureInPictureElement` goes straight from the old video to the new one, so `usePictureInPictureActive()` never sees a gap. If a browser refuses the hand-off anyway, PiP is closed so it isn't left showing the previous, now paused, video.
- ⚠️ **The new video must have metadata:** browsers refuse PiP for a video at `readyState` `HAVE_NOTHING` (`InvalidStateError`), which is common for a slide that has only just become current. The hand-off waits for `loadedmetadata`; until then the PiP window keeps showing the previous video. For the same reason, a slide that stops being current while its video is in PiP defers `cancelLoading()` (which clears the video's `src` and would close PiP) until that video leaves PiP.
- **Media Session:** while a video is in PiP, the current slide registers `nexttrack` / `previoustrack` handlers (calling `goToItem`), which Chromium shows as buttons in the PiP window. They're only registered while in PiP so OS media keys don't drive the feed otherwise. The handlers are global; hand-over between slides relies on both slides' `isCurrentVideo` changing in the same commit (see [keyboard shortcuts](keyboard-shortcuts.md) § "Rating shortcuts" for the same pattern).
- **Hidden page:** PiP is usually watched with the tab in the background, where a smooth scroll may never finish. `VideoScroller.scrollToIndex` therefore always scrolls instantly while `document.hidden`. Otherwise auto-advance would move `currentIndex` but not the virtualizer's rendered window, and slides beyond the overscan buffer would never mount.

---

## Source Selection

Stash's ScenePlayer hands the scene's streams to the Video.js `sourceSelector` plugin (`source-selector.ts` in stash-ui): `setSources()` loads `sources[0]` as the default, and its control-bar menu switches between them. Stash TV hides that menu (CSS + the `controlBar.children` override in the `beforesetup` hook) and drives the plugin directly instead:

- `src/components/ScenePlayer/video.js/source-selector-access.ts` — typed access to the plugin's runtime shape. Its `menu`/`items`/`selectedSource` are TypeScript-private in Stash's declarations but stable at runtime; the file re-applies the shape once, at its access boundary (`as unknown as`), rather than patching stash-ui.
- Reading streams: `getVideoSources(player)` / `getSelectedVideoSource(player)` — or `useSceneStreamSelection(playerRef)` (`src/hooks/`), a hook wrapping them that re-reads on `loadstart`. The current stream indicator in the control bar (`.right-controls`, rendered by `MediaSlide`) and the resolution action button both use it. **Note:** the hook assumes the `playerRef` is already guarded against disposed players (MediaSlide uses `useGetterRef` to filter these out), so the hook does not duplicate that check.
- Applying preferred resolution: `useSyncPlayerWithPreferredStream(playerRef)` owns the source-switch workflow for slide-level propagation.
- Switching: `switchSceneStream(player, source)` performs a paused-state-preserving source swap: it updates the plugin menu selection, loads the new source, restores `currentTime` on `canplay`, and only calls `play()` if the player was already playing. This avoids starting playback on preloaded offscreen slides when preferences are applied. `switchSceneStream(player, source)` is a thin alias used by UI code. Sources passed here must come from `getSceneStreamOptions` for the same player (matching is by reference).
- `ScenePlayer/index.tsx` wraps `player.sourceSelector` (`addSourceSelectorWrappers`): its `setSources` interception reverts preview URLs (see quirks table) and moves the user's `preferredStreamLabel` (tvConfig, set by the resolution action button) to the front of the list so the plugin loads it as the default. Applying the preference by *playing* the stream instead would start playback on preloaded adjacent slides.

### Preferred Stream Propagation Across Rendered Slides

The resolution action button generally only updates `tvConfig.preferredStreamLabel`; the exception being if the video
is out of sync with the preferred stream.

- `MediaSlide` used `useSyncPlayerWithPreferredStream(enabled)`; the hook applies changes via `switchSceneStream(...)`.
- Scope: apply to the current slide and rendered next slides only (`index >= currentIndex`) *at the moment the preference changes*; rendered previous slides are intentionally left unchanged.

⚠️ Components displaying stream state should refresh on the player's `loadstart` event — source switches (manual selection, error fallback, new scene) don't emit anything more specific.

⚠️ Stream labels come from the Stash server (`internal/manager/scene.go`): "Direct stream", an optional "MKV", then "{MP4|WEBM|HLS|DASH} {4K (2160p)|Full HD (1080p)|HD (720p)|…}". Persist labels, not URLs — labels are stable across scenes, URLs are per-scene. In scene/marker preview mode `sceneStreams` is replaced by a single synthetic "Direct stream" entry, so stream UIs see exactly one option there.

---

## Working with the Player

1. Our ScenePlayer wraps Video.js (via Stash's) — customise via the props above or Video.js plugins/options, not by editing Stash's component
2. Current player tracked via `VIDEO_PLAYER_ID` (see above); query playback time with `getPlayerPosition()`
3. Changes to which plugins load go through the `beforesetup` hooks — see `allow-plugin-removal.ts` first
