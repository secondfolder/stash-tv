# Media Loading (Scenes & Markers)

How Stash TV loads and paginates scenes/markers from the Stash API, and how each slide keeps its data up to date.

**Read this when:** touching `useMediaItems`, `useLiveMediaItem`, `useMediaItemFilters`, feed data loading, pagination, preview-only modes, or the media modifier function.

---

## Architecture

The feed is split into two halves:

- **The list** (`useMediaItems()`, `src/hooks/useMediaItems.ts`): an ordered list of `MediaItemRef`s, i.e. which entities are in the feed (`{ id, entityType, cacheId }`), never their data.
- **The data** (`useLiveMediaItem(ref)`, `src/hooks/useLiveMediaItem.ts`): each `MediaSlide` reads its entity from the Apollo cache with `useFragment`.

The Apollo cache is the only copy of any scene/marker data, so every update to it (a rating, tags, o-count, the play position being saved) shows up without extra syncing code. This is Apollo's recommended "parent holds references, children read fragments" pattern.

### Why the list lives outside the Apollo cache

Stash's mutation hooks deliberately evict list queries after a change: `evictQueries(cache, [FindScenesDocument, …])` followed by `cache.gc()` (stashapp/stash#3912). After a mutation the client can't tell whether a filtered or sorted list still matches, so Stash drops it and the next render refetches it. That's right for Stash's own list pages, but a feed must not drop or reshuffle items already loaded.

⚠️ **This happens constantly during playback.** Stash's ScenePlayer saves activity (play position/duration) every few seconds via `useSceneSaveActivity`, which evicts every cached `findScenes` result. Anything relying on a cached list query, such as a `useQuery` for the feed or an Apollo field-policy `merge`, gets wiped or refetched each time. ⚠️ **Do not move pagination into Apollo cache merging.** It was tried before (a custom `keyArgs`/`merge` policy plus a wrapper that blocked these deletes) and was unreliable.

So pages are fetched with one-shot `client.query({ fetchPolicy: "network-only" })` calls. There's no watched list query for an eviction to trigger a refetch of, and `getApolloClient.ts` keeps Apollo's default cache policies.

⚠️ **Loaded entities are retained.** `cache.gc()` deletes entities nothing references, and once the list queries are evicted that's every loaded item. `useMediaItems` calls `cache.retain(cacheId)` when an item enters the feed and `cache.release(cacheId)` when it leaves (deleted, or the feed is reset). Fragment watches (`useFragment`) do **not** retain on their own.

### The feed store (module-level)

`useMediaItems()` is called from several components (FeedPage, SettingsTab, VideoScroller), so the list lives in one module-level Zustand store rather than per-hook state. Per-instance copies previously diverged (e.g. one copy losing a deleted item while another didn't).

The feed is keyed by a hash of the filter's contents plus the page size, not by filter object identity: each caller of `useMediaItemFilters()` builds its own (equal) filter object, so identity comparisons would make the callers keep resetting each other.

### Live item data

`MediaSlide` (default export) is a thin wrapper: `useLiveMediaItem(mediaItemRef)`, then renders `MediaSlideContent` with the full `MediaItem`. `useLiveMediaItem`:

- reads `SceneData` for scenes, or a local `MarkerForTv` fragment (`SceneMarkerData` + `scene { SceneData }`, matching `FindSceneMarkersForTv`) for markers. Both are defined in `src/helpers/mediaItem.ts`
- returns the same object until that entity's data changes, so a background update re-renders only that one slide
- keeps returning the last complete item if the entity disappears from the cache (e.g. it was just deleted and the slide is about to be removed), so the slide doesn't blank out
- refetches the item's scene (`FindScene`) whenever its fragment goes incomplete. Some Stash mutations evict the fields they changed instead of updating them. For example, creating, editing or deleting a marker evicts its scene's `scene_markers`, expecting a watched query to refetch them. The feed has no watched queries, so without this the slide would keep showing the old markers forever. Deleting a scene also refetches the other rendered slides' scenes, since Stash's delete evicts fields they share (e.g. tag and performer counts). The deleted scene itself isn't refetched: its slide is removed first.
- applies the preview-only rewrite (see [Preview-only modes](#preview-only-modes))

⚠️ **Background updates must re-render, never remount.** The play position is saved every few seconds while a scene plays. A re-render keeps component state, such as an open tag editor's unsaved selection (`EditTagSelectionForm` holds it in `useState`). A remount would lose it. Keep `MediaSlide`/`ScenePlayer` keys based on IDs, not data. Video reloads are covered in [video player](docs/video-player.md).

### Data flow

1. **Initial load:** when the filter (or page size) changes, the first `useMediaItems()` instance to notice resets the feed and fetches page 1
2. **Pagination:** VideoScroller calls `loadMoreMediaItems()` when the current item is within 5 of the end. The next page starts at `loaded items + skipped markers` (see below), so deleting an item, which shifts every later item back one place on the server, neither skips nor repeats items. When that offset isn't on a page boundary the fetched page overlaps what's loaded, and duplicates are dropped
3. **End of list:** no more fetches once the offset reaches the server's reported `count`
4. **Filtering:** applied via GraphQL variables from the active channel's source, resolved to a saved filter by `useMediaItemFilters()` (see [channels](channels.md))
5. **Mutations:** updates (rating, tags, o-count, play count…) go to the Stash API and update the Apollo cache, and the affected slide re-renders via `useLiveMediaItem`
6. **Deletion:** `removeMediaItem(id)` drops the entry (and releases it) after Stash's delete dialog confirms

Markers whose start time is past the end of their scene are skipped (`markerIsPlayable`). Their IDs are kept in `skippedIds` because they still occupy positions in the server's list.

### The `MediaItem` type

`MediaItem` (defined in `src/helpers/mediaItem.ts`, re-exported from `useMediaItems.ts`) is a discriminated union. Narrow it before accessing `entity`:

```ts
// ✅ CORRECT — narrow the union with a type predicate before use
const isScene = (item: MediaItem): item is Extract<MediaItem, { entityType: "scene" }> =>
  item.entityType === "scene";
if (isScene(item)) item.entity.title;

// ❌ WRONG — accessing entity without narrowing the union first
item.entity.title; // TS error: entity is a union of scene and marker fragments
```

`useMediaItems()` returns `MediaItemRef[]`. Only slides (and the helpers below) deal in full `MediaItem`s.

---

## Preview-only modes

`scenePreviewOnly` / `markerPreviewOnly` play only a scene's preview (or a marker's stream). Rather than teach ScenePlayer about previews, `makeMediaItemPreviewOnly()` (`src/helpers/makeMediaItemPreviewOnly.ts`) rewrites the item so the preview is its only "stream". It also estimates the duration and clears `resume_time`, captions and markers.

Stash doesn't report preview lengths, so `useTrackPreviewLengths()` (`src/hooks/usePreviewLengths.ts`) records each preview video's real duration when its metadata loads. Until then the duration is estimated from Stash's preview segment config. The rewrite is applied per slide in `useLiveMediaItem`, memoised so unrelated updates don't create new objects.

---

## Media items modifier

Users can define custom JavaScript functions to filter/transform media items (power-user feature, only with dev options on):

- Stored as a string in config (`mediaItemsModifierFunction`)
- Parsed at runtime via `getFunctionFromString()` (`src/helpers/getFunctionFromString.ts`)
- Given full `MediaItem`s read from the cache when the list changes (`cache.readFragment`). It isn't re-run when an item's data later changes. Its result is mapped back to refs, and `maxMedia` is applied after it

---

## Debugging Media Loading Issues

1. Check `useMediaItemFilters()` — is the correct filter selected?
2. Check the Apollo Client query — use the browser dev tools GraphQL tab
3. With dev options on: `window.mediaItems` / `window.modifiedMediaItems` (the list before/after the modifier) and `window.tvCurrentMediaItem` (the current slide's live, preview-rewritten item)
4. Enable debug logging: `showDebugInfo: ['render-debugging']` in tvConfig
5. Check `VITE_APP_PLATFORM_URL` is correctly set

## Testing Media Loading

- [media-loading.test.tsx](packages/tv-ui/test/integration/media-loading.test.tsx) — first page loads and renders
- [background-updates.test.tsx](packages/tv-ui/test/integration/background-updates.test.tsx) — live data on later-page slides after Stash's evictions, no refetch on eviction, unsaved tag edits and the player surviving background updates
- [create-marker-button.test.tsx](packages/tv-ui/test/integration/create-marker-button.test.tsx) and [create-marker-button-defaults.test.tsx](packages/tv-ui/test/integration/create-marker-button-defaults.test.tsx) — a marker created, edited or deleted from a slide shows on it straight away (Stash evicts the scene's markers)
- [delete-media-item.test.tsx](packages/tv-ui/test/integration/delete-media-item.test.tsx) — deleting moves on to the next item and keeps every remaining item reachable across a shifted page boundary, and doesn't refetch the deleted scene
- [keyboard-rating.test.tsx](packages/tv-ui/test/integration/keyboard-rating.test.tsx) — includes a rating shown on a slide from page 2
- [stream-rewriting.test.tsx](packages/tv-ui/test/integration/stream-rewriting.test.tsx) — turning on preview-only for scenes plays the preview; the rewrite itself is unit tested in [makeMediaItemPreviewOnly.test.ts](packages/tv-ui/test/unit/helpers/makeMediaItemPreviewOnly.test.ts)
- [getFunctionFromString.test.ts](packages/tv-ui/test/unit/helpers/getFunctionFromString.test.ts) — modifier function parsing

See [Testing](docs/testing.md) for full test suite details.

## Related docs

- [Testing](docs/testing.md) — How to test media loading and pagination
- [State & config](docs/state-and-config.md) — Config options that affect media loading
- [Video player](docs/video-player.md) — Why a new scene object doesn't reload the video
