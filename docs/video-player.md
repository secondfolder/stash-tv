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
