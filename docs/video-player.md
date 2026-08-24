# Video Player

How video playback works: Stash TV's `ScenePlayer` wraps Stash's ScenePlayer (via the stash-ui wrapper), which wraps Video.js — plus the many workarounds Stash's component requires.

**Read this when:** touching `ScenePlayer`, `MarkerPlayer`, Video.js setup/options/plugins, playback behaviour, or video-related DOM structure.

---

## Architecture

- `packages/tv-ui/src/components/ScenePlayer/index.tsx` — our ScenePlayer wrapper component
- Stash's ScenePlayer (imported from `stash-ui/wrappers/components/ScenePlayer`) — wraps Video.js
- `src/components/ScenePlayer/video.js/` — Video.js helpers (`allow-plugin-removal.ts`, `usePlayerManager.ts`, etc.)
- Feed playback is virtualized: `VideoScroller` renders multiple player instances, only visible slides mounted

## Current-Player Tracking

Stash's components assume a single active player at a time. `packages/stash-ui/patches/scene-player-utils.ts` watches for `.current-video` class changes on slides inside `.VideoScroller` and keeps a module-level `VIDEO_PLAYER_ID` pointing at the focused player; Stash components read that ID. `getPlayerPosition()` (same file) returns the current player's playback time.

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
- Player options are injected/modified via `modifyPlayerSetupOptions` and the `optionsToMerge` / `onVideojsPlayerCreated` props
- The browser's native PiP hover icon is disabled (`disablePictureInPicture`) as it interferes with our menu overlay

---

## Working with the Player

1. Our ScenePlayer wraps Video.js (via Stash's) — customise via the props above or Video.js plugins/options, not by editing Stash's component
2. Current player tracked via `VIDEO_PLAYER_ID` (see above); query playback time with `getPlayerPosition()`
3. Changes to which plugins load go through the `beforesetup` hooks — see `allow-plugin-removal.ts` first
