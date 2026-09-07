# Media Loading (Scenes & Markers)

How Stash TV loads, paginates, and accumulates scenes/markers from the Stash API.

**Read this when:** touching `useMediaItems`, `useMediaItemFilters`, `mediaItemState`, feed data loading, pagination, or the media modifier function.

---

## Architecture

### `useMediaItems()` (`src/hooks/useMediaItems.ts`)

The central pagination hook, called from multiple independent components (FeedPage, SettingsTab, VideoScroller). Responsibilities:

- Lazy-loading pagination with configurable page size (`pageSize` config, default 5; first load is 20 items)
- Media accumulation per filter in a module-level Zustand store
- Applying the user's custom media modifier function
- Preview-only modes (`scenePreviewOnly` / `markerPreviewOnly`) — implemented by rewriting scene streams so the preview is the only "stream" ScenePlayer sees

### `useMediaItemsAccumulatorStore` (module-level)

All loaded items live in a module-level Zustand store (`items: Map<string, MediaItem>`), **not** in Apollo cache and not in per-hook-instance state.

⚠️ **Do not move pagination logic to Apollo cache merging.** This was previously done with a custom `keyArgs`/merge policy in `getApolloClient.ts` and proved unreliable under mutation races — e.g. deleting a scene while another scene's watch-time/view-count mutation (fired automatically just from scrolling) was still in flight. The query's reported item count would silently stop growing even though further pages kept being requested. Each page fetch is now a fully independent, one-shot `fetchMore()` whose result we merge into our own store. `getApolloClient.ts`'s `findScenes`/`findSceneMarkers` fields are back to Apollo's default (unmerged) policy — don't change this without a very good reason.

### Why module-level (not per-hook state)?

The multiple components calling `useMediaItems()` must share one source of truth — per-hook-instance state previously let copies diverge (e.g. VideoScroller's copy correctly losing a deleted item while FeedPage's copy kept growing untouched).

### Data flow

1. **Initial load:** `useMediaItems()` fetches the first page
2. **Pagination:** when the user scrolls near the end (`ITEMS_BEFORE_END_ON_FETCH` remaining), the next page is fetched; `pagesLoadedBeyondFirst` only advances on a *completed* `fetchMore()` response (not on call count or `items.size`, which are prone to duplicate calls and driven down by deletions)
3. **Accumulation:** pages merged into the store's `items` map
4. **Filtering:** applied via GraphQL variables from the selected saved filter
5. **Mutations:** updates (play count, tags, etc.) sent back to the Stash API
6. **Cache invalidation:** handled via Apollo's refetch patterns

### The `MediaItem` type

`MediaItem` (defined in `useMediaItems.ts`) is a discriminated union — narrow it before accessing `entity`:

```ts
// ✅ CORRECT — narrow the union with a type predicate before use
const isScene = (item: MediaItem): item is Extract<MediaItem, { entityType: "scene" }> =>
  item.entityType === "scene";
if (isScene(item)) item.entity.title;

// ❌ WRONG — accessing entity without narrowing the union first
item.entity.title; // TS error: entity is a union of scene and marker fragments
```

---

## Custom Media Modifier Functions

Users can define custom JavaScript functions to filter/transform media items (power-user feature):

- Stored as a string in config (`mediaItemsModifierFunction`)
- Parsed at runtime via `getFunctionFromString()` (`src/helpers/getFunctionFromString.ts`)
- Applied to the media list before display

---

## Debugging Media Loading Issues

1. Check `useMediaItemFilters()` — is the correct filter selected?
2. Check the Apollo Client query — use the browser dev tools GraphQL tab
3. Check `useMediaItems()` store state — `window.mediaItems` / `window.modifiedMediaItems` in the console
4. Enable debug logging: `showDebugInfo: ['render-debugging']` in tvConfig
5. Check `VITE_APP_PLATFORM_URL` is correctly set

## Testing Media Loading

Media loading behavior is tested in:
- Integration tests: [test/integration/media-loading.test.tsx](packages/tv-ui/test/integration/media-loading.test.tsx) — verifies first page loads and renders against mock API
- Unit tests: [test/unit/helpers/getFunctionFromString.test.ts](packages/tv-ui/test/unit/helpers/getFunctionFromString.test.ts) — tests modifier function parsing

See [Testing](docs/testing.md) for full test suite details.

## Related docs

- [Testing](docs/testing.md) — How to test media loading and pagination
- [State & config](docs/state-and-config.md) — Config options that affect media loading
- [Release process](docs/release-process.md) — Versioning and deployment flow
