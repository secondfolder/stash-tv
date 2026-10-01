# Simplify feed data loading: list of references + live reads with `useFragment`

## Context

The rating fix layered `watchFragment` subscriptions on top of an accumulator that already copies entities out of Apollo. That gives two copies of the data (Apollo's normalized cache and our store) kept in sync by hand. `useMediaItems.ts` (491 lines) has four overlapping paths: a page‑1 `useQuery`, one-shot `fetchMore` for later pages, merging into the store, and the watch layer.

Review findings:
1. **Two sources of truth.** The store holds entity *copies*, so every cache update has to be copied back in. That's the root cause of the original rating bug.
2. **The watch fix breaks after any playback.** Stash's `useSceneSaveActivity` fires periodically during playback and runs `evictQueries([FindScenesDocument])` + `cache.gc()` (`StashService.ts:885-911`). That deletes every `findScenes` field, and GC then removes page‑2+ `Scene` entities, which nothing references any more. Fragment watches don't retain entities (`InMemoryCache.prototype.watch`). After that, those slides stop updating again.
3. **Page 1 is refetched over the network after every activity save.** It's a cache-first `useQuery` whose field keeps getting evicted.
4. **Duplicated scene/marker branches** in `useMediaItems`.
5. **Stale closures.** `useMediaItemTags`/`useSceneUpdate` build mutation inputs from the rendered `scene` (`tag_ids: [...scene.tags, id]`), so editing with stale data drops earlier edits. Live data fixes this for free.
6. **All slides re-render on any change.** The preview-only `map(makeMediaItemPreviewOnly)` re-creates every item.

**Why the list stays outside the Apollo cache (no Stash patch).** Stash evicts list queries on purpose (stashapp/stash#3912): after a mutation it can't tell whether a filtered or sorted list still matches. That's correct for Stash's lists, but a feed shouldn't drop or reshuffle items already loaded. No upstreamable change would remove the eviction for lists whose filter depends on the changed field. So tv-ui keeps its own *ordered list of references* and reads entity data from the cache. This follows Apollo's recommended pattern: the parent holds references, children read them with `useFragment` and re-render only when their own data changes.

**Re-render safety we rely on (to be covered by tests):**
- `EditTagSelectionForm` keeps unsaved tags in `useState(initialTags)`, so they survive re-renders. Only a remount loses them.
- Stash's `ScenePlayer` reloads the source only when `scene.id` changes (`ScenePlayer.tsx:~548`).
- `MediaSlide`/`ScenePlayer` keys are id-based.

## Approach

### 1. Tests first
In `test/integration/background-updates.test.tsx`, plus keeping the two rating tests in `keyboard-rating.test.tsx`. Confirm the first two fail on the current code before changing anything.
- **Rating survives a playback eviction.** Go to slide 6 (page 2) and rate it. Simulate an activity save: `cache.modify` `resume_time` plus `evictQueries(cache, [GQL.FindScenesDocument])` from `stash-ui/dist/src/core/StashService`, which also runs `gc()`. Rate again and assert the displayed rating updates.
- **No refetch on eviction.** After a simulated activity save, `integration.server.getRequestCounts()` shows no extra scene-list request.
- **Unsaved tag edits survive a background update.** Press `e` to open the tag editor and pick a tag without saving. Apply a `resume_time` cache update to that scene. Assert the pick is still there and the `ScenePlayer` DOM node is the same, i.e. it didn't remount.

### 2. `useMediaItems.ts`: the list only
- **Store:** `{ filterKey, refs: MediaItemRef[], pagesLoaded, fetchInFlight, loading, error }`.
  - `MediaItemRef = { id, entityType, cacheId }`. These are references only, with no copies of entity data, so there's nothing to keep in sync.
  - `filterKey` = `hashObject(filter, pageSize)`.
- **Return value:** `useMediaItems()` returns `mediaItems: MediaItemRef[]`.
  - `VideoScroller`, `FeedPage` and `SettingsTab` only use `id`/length, so they barely change.
  - The dev modifier function and `maxMedia` run on full items read with `cache.readFragment` per ref whenever the list recomputes. That means current cache data, but not a live subscription. Results are mapped back to refs.
  - A ref whose entity is gone from the cache is skipped. That matches Apollo's own handling of dangling references in lists.
- **Entity adapter** per type: `{ query, filterVar, extract(result), toMediaItem }`. This replaces the duplicated branches. Markers keep `mapMarker`/`markerIsValid`.
- **One `loadPage`** for all pages, page 1 included. It uses `client.query({ fetchPolicy: "network-only" })`, and drops the response if `filterKey` changed while in flight. This removes the page‑1 `useQuery`, `apolloMediaItems`, the merge effect, `fetchMore`, `mergeMediaItemsIntoStore`, and all `watchFragment`/`hashObject` code.
- **Retain/release:** the store's add action calls `cache.retain(cache.identify(entity))`; remove and reset call `release`. This is the documented public InMemoryCache API, not a cache policy, and it stops Stash's `gc()` deleting entities we still show.
- **Filter change:** an effect calls `resetAndLoad(filterKey)`. It does nothing if `filterKey` hasn't changed, which makes it safe across the 3 hook instances.
- **Preview-only rewrite moves out of the list:** `makeMediaItemPreviewOnly` becomes a pure exported helper, and `previewLengths` moves into a small module-level zustand store. The existing `loadedmetadata` listener stays and writes to it.
- The return shape is unchanged, so `FeedPage`, `SettingsTab` and `VideoScroller` don't change.

### 3. `useLiveMediaItem(ref)` (new, `src/hooks/useLiveMediaItem.ts`)
- `useFragment({ fragment, fragmentName, from: ref.cacheId })`:
  - scenes use `GQL.SceneDataFragmentDoc`
  - markers use a local `MarkerForTv` fragment: `...SceneMarkerData` plus `scene { ...SceneData }`, defined with `gql` in tv-ui, so no `patches/` change is needed
- If `complete`: build the MediaItem (`mapMarker` for markers), memoised on the fragment data's identity.
- If it's incomplete (the entity was deleted, so `removeMediaItem` is about to drop the slide), keep returning the last complete item from a ref. That way the slide doesn't blank out for a frame.
- Apply `makeMediaItemPreviewOnly` when preview-only is on, memoised on the item and its preview length.
- `MediaSlide` takes a `mediaItemRef` prop and calls the hook once at the top: `const mediaItem = useLiveMediaItem(props.mediaItemRef)`. Then `props.mediaItem` → `mediaItem` throughout. Update `MediaSlide.stories.tsx` to seed the cache or pass a ref. Children (`ActionButtonStack`, `SceneInfo`, `ScenePlayer`, tag/rating hooks) automatically get live data.
- Apollo returns the same object when data hasn't changed, so only the slide whose entity changed re-renders, and nothing remounts.

### 4. Leave alone
- `getApolloClient.ts` (default policies) and `useSceneUpdate`'s optimistic response, which is standard Apollo.
- `stash-ui` patches.
- Trade-off to state in the docs: the dev modifier function sees cache data as of the last list recompute, not live updates.

### 5. Docs
- `docs/media-loading.md`: rewrite Architecture/Data flow. Cover the references list, live reads via `useLiveMediaItem`, `retain`/`release`, and why the list lives outside the cache. Add a ⚠️ about Stash's `evictQueries` + `gc` and its reason (#3912). Note when the modifier's data is read.
- `docs/video-player.md`: add a gotcha. Background updates must re-render, not remount. Stash reloads only on `scene.id` change; keep slide and player keys id-based.
- Save this plan as `docs/historical-plans/2026-10-01-media-items-single-source-of-truth.md`.

## Critical files
- `packages/tv-ui/src/hooks/useMediaItems.ts` (rewrite, ~491 → ~300 lines)
- `packages/tv-ui/src/hooks/useLiveMediaItem.ts` (new, ~60 lines)
- `packages/tv-ui/src/components/slide/MediaSlide/index.tsx` (`mediaItemRef` prop; mechanical `props.mediaItem` → `mediaItem`) and its stories
- `packages/tv-ui/src/components/VideoScroller/index.tsx` (pass `mediaItemRef`)
- `packages/tv-ui/test/integration/background-updates.test.tsx` (new), `keyboard-rating.test.tsx`
- `docs/media-loading.md`, `docs/video-player.md`

## Verification
- `yarn --cwd packages/tv-ui test`: the new tests pass. The 2 earlier failures in `keyboard-rating.test.tsx` were already failing before this work; report them separately.
- `yarn typecheck`; `yarn --cwd packages/repo test` (docs validation).
- Manual (`yarn dev`):
  1. Scroll past slide 5, rate, let it play for 30s+, then rate again. The rating should update both times.
  2. Mid-playback, open the tag editor and pick tags without saving, then wait. The picks should stay and the video shouldn't reload.
  3. Delete an item and keep scrolling. Loading should continue.
  4. Switch filters A → B → A. A should be freshly loaded.

## Deviations during implementation

_Recorded 2026-10-01 by Claude (implementing agent), at the time of implementation._

- **Feed keyed by filter content, not identity.** The plan compared the filter object by identity. Each `useMediaItems()` caller gets its own equal filter object from `useMediaItemFilters()`, so they kept resetting each other's feed in a refetch loop. The feed is keyed by `hashObject({ entityType, generalFilter, entityFilter, pageSize })` instead.
- **Pagination by offset instead of a page counter.** The user asked for a test of what `12d7f98e` fixed (deleting a scene). With a page size of 2 it showed that deleting an item skipped a later one: "page N" starts one item later on the server once something before it is deleted. The next page is now derived from `loaded refs + skipped markers`, and overlapping items are dropped. Unplayable markers are tracked in `skippedIds` so they still count towards the offset.
- **`MediaSlide` split rather than edited in place.** The default export is a thin wrapper that calls `useLiveMediaItem` and renders the unchanged component, now exported as `MediaSlideContent`. That avoided a `props.mediaItem` → `mediaItem` rename throughout. Stories use `MediaSlideContent`.
- **The o-count test replaces the planned rating-after-eviction test.** A rating's optimistic response rewrites the whole scene into the cache, which masks a garbage-collected entity. O-count only patches fields, so it reproduces the bug reliably.
- **Test harness fixes found on the way:** the harness `afterEach` now calls RTL `cleanup()` before resetting the document. Hook order meant a failed test's app was unmounted after the reset and crashed the next boot ("Unexpected token 0px"). Also, `StashService` must be imported dynamically in tests (it creates a client at import time). Both are recorded in `docs/testing.md`.
- **`stream-rewriting.test.tsx`** now asserts on `window.tvCurrentMediaItem`, because the preview rewrite moved from the list to each slide. `MediaSlide` updates that dev global when its item changes.
