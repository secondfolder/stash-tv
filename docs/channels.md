# Channels

The user's own list of things the feed can show. Each channel is made of one or more **sources** (for now, exactly one), and each source supplies media: every scene, every marker, a filter saved in Stash, or a temporary filter (see "Temporary channel").

**Read this when:** touching `channels` / `startupChannel` / `lastViewedChannelId` in tvConfig, `src/components/channels/`, the Channels section of the Settings tab, or how `useMediaItemFilters()` picks what the feed shows.

---

## Data model

Lives in `src/components/channels/channel-config.ts` and is stored in tvConfig through Stash config, so it syncs across devices (all but the temporary channel, which isn't stored at all).

```ts
channels: ChannelConfig[]                 // the user's ordered list, default: one "All scenes" channel
startupChannel: "last-viewed" | "first"   // default "last-viewed"
lastViewedChannelId?: string

type ChannelConfig = { id: string; sources: ChannelSource[] }
type ChannelSource =
  | { type: "stash-saved-filter"; savedFilterId: string; randomise: boolean }
  | { type: "all"; entityType: "scene" | "marker"; randomise: boolean }
  | { type: "temporary-filter"; filter: TemporaryFilter; randomise: boolean }

// A filter held in the channel, in the same shape as a Stash saved filter
type TemporaryFilter = Pick<GQL.SavedFilter, "mode" | "name" | "find_filter" | "object_filter">
```

- **Channel `id` is generated** (`generateConfigId()`) and never derived from a source, since the same filter can be in more than one channel.
- **Sources are a tagged union in an array.** That leaves room for channels that combine several sources, and for new kinds of source (as `temporary-filter`, a filter stored inline in the same shape as a Stash `SavedFilter`, was added), without migrating stored config. The UI and `channelConfigSchema` currently allow exactly one source.
- **`randomise` belongs to each source, not the channel.** It controls the order of that source's own media, so in a channel that combines sources, one can be shuffled while another keeps its sort. How sources are combined would be a separate, channel-level setting. A source whose Stash filter is already sorted randomly ignores it (the modal says "Filter sort order is random" instead of offering the switch).
- **References, not copies.** A Stash filter source stores only its id (a temporary filter is the exception: it's held in the source, as it isn't saved anywhere else). Its name and type are looked up live from `availableSavedFilters` (`getChannelSourceInfo()`), so renaming a filter in Stash shows up straight away.

## Sources

Every source resolves to a Stash `SavedFilter` object, so the rest of `useMediaItemFilters()` (`convertSavedToSearchableFilter`) works the same for every kind:

- `stash-saved-filter`: fetched from Stash by id (`FindSavedFilter`)
- `all`: `makeEmptySavedFilter(mode)`, a filter with no criteria. This is also what the feed falls back to when there are no channels and Stash has no default scene filter
- `temporary-filter`: the filter it holds

### Missing filters

If a channel's Stash filter has been deleted, the channel stays in the list, shown as "Missing filter", so the user can edit or delete it. It is never dropped silently. If it's the active channel, `useMediaItemFilters()` reports an error saying the filter no longer exists.

## Active channel

The **active channel** is the one the feed is showing. It's transient state (`activeChannelId` in `useMediaItemFilters`' module-level store), separate from the persisted `lastViewedChannelId`:

- Clicking a channel in the Settings tab, or choosing one with the `change-channel` action button (see [action buttons](action-buttons.md) § "Per-Button Behaviour"), calls `setActiveChannel(id)`. That makes it active and records it as last viewed. Adding a channel also makes it active.
- Editing the active channel reloads the feed. Changing what a source points at refetches its filter (keyed by `getSourceTargetKey()`). Changing only `randomise` re-sorts without refetching the filter.
- Deleting the active channel moves to the first remaining channel.
- New users start with a single "All scenes" channel (`id: "all-scenes"`, from tvConfig's defaults). The UI won't delete the last channel, so there's always one to show.
- If `channels` is somehow empty (e.g. edited by hand), the feed falls back to Stash's default scene filter, then to every scene.

## Temporary channel

A channel showing a filter that isn't saved anywhere, for showing something for now without adding to the user's list (e.g. "Show scenes with this tag" in a tag's popover, see [entity popovers](entity-popovers.md)). Its source is a `temporary-filter`.

- **There's only ever one, and it's always last.** `useTvConfig`'s `set("channels", …)` runs every new list through `normalizeChannels()`, which keeps only the last temporary channel (the newest, as it's added at the end) and moves it to the end. So nothing else (adding a channel, reordering) has to take care to keep it there.
- **It's never persisted.** tvConfig's `partialize` drops it (`persistedChannels()`) before the config is stored, so it's gone once Stash TV is closed, and never syncs to another device. It lives in the same `channels` list as the others otherwise, so everything listing channels (the Settings tab, the `change-channel` button) shows it with no special handling.
- **It never becomes the last viewed channel.** `setActiveChannel()` doesn't record it in `lastViewedChannelId`, so on the next load the last channel the user chose before it is shown.
- `showTemporaryFilter(filter)` (from `useMediaItemFilters()`) replaces the temporary channel, if there is one, with one showing the given filter, and switches the feed to it. Its id is always `TEMPORARY_CHANNEL_ID`, so replacing it while it's showing keeps it the active channel and just reloads the feed (its target key, `getSourceTargetKey()`, includes the whole filter).
- Its name is the filter's `name`, with the `Scenes: ` / `Markers: ` prefix of a saved filter.

### Filtering by an entity

`src/components/channels/temporary-filter.ts` makes the temporary channel's filters from entities (a tag, so far):

- `makeEntityFilter(entityType, entity)`: every scene with it. It's in the shape Stash saves filters in, its criterion in Stash's UI shape (`{ value: { items: [{ id, label }], excluded, depth }, modifier }`), which is what `ListFilterModel.configureFromSavedFilter` reads. A tag's depth is 0: just that tag, not its sub-tags.
- `addEntityToFilter` adds another of that kind, the criterion requiring all of them (`INCLUDES_ALL`). `canAddEntityToFilter` says whether that's possible: the filter must already filter by that kind of entity, requiring all of them (a single one with `INCLUDES` is the same), and not already this one.
- `removeEntityFromFilter` takes one out, dropping the criterion once there's none left. `canRemoveEntityFromFilter` allows it only if the filter would still filter by something.
- A filter's name is what it requires, joined with " & " (e.g. "Alpha & Beta"), so the channel is listed as "Scenes: Alpha & Beta".
- Each kind of entity's criterion is in `entityCriteria`: adding a kind of entity to filter by is adding it there.

## Startup channel

`getStartupChannel()` picks the channel to show on load:

- `"last-viewed"`: `lastViewedChannelId`, if that channel still exists, otherwise the first channel
- `"first"`: the first channel in the list

⚠️ With `"first"`, starting up doesn't overwrite `lastViewedChannelId`. Only an explicit switch does, so changing back to `"last-viewed"` still remembers the last channel the user chose.

## Settings UI

`src/components/settings/ChannelSettings/` renders the list at the top of the Settings tab's Channels section.

- Rows show the source's name. Saved filters get a `Scenes: ` or `Markers: ` prefix to tell them apart; "All scenes" / "All markers" have none.
- A row has no delete button while it's the only channel. The temporary channel doesn't count towards that, as it won't be there next time: a saved channel can't be deleted while it's the only saved one, but the temporary channel always can.
- The temporary channel has a "Temporary" badge after its name, and no edit button or drag handle (it can only show a filter made for it, and it's always last). It's in a list of its own under the others (`.temporary-channel-list`), not the one they're dragged about in. ⚠️ In the same list, dragging a channel below it crashed the page: framer-motion's `Reorder` kept moving the channel there as `normalizeChannels()` kept moving it back.
- The active channel has an accent bar down its left edge and a bold name. Its text isn't recoloured.

The list and modal use the same shared list and modal components as the action-button list (see [action buttons](action-buttons.md) § "Settings Integration"):

- `ConfigList` / `ConfigListItem` / `AddConfigItemButton` for the reorderable list. "Add channel" uses the `primary` button variant (like "Show Guide") so it stands out, where the action-button list's many add options use the default `link` variant
- `ChannelSettingsModal`, built on `ConfigItemModal`, for adding and editing. It contains a `ChannelSourceSelect` and the source's randomise switch. `ChannelSourceSelect` is a Scenes / Markers button group plus a dropdown listing "All scenes" or "All markers" first, then that type's saved filters. Switching type clears the chosen source, since it belongs to the other type. ⚠️ Our "All scenes" / "All markers" option is left out when Stash already has a filter of that type with the same name (case-insensitive, e.g. a common "All Scenes" filter), so the list doesn't show two near-identical entries. It still shows when it's the channel's current source.

## Migration

tvConfig v3 replaced the single `currentFilterId` and global `isRandomised` with channels. If a filter was selected, it becomes one channel with a `stash-saved-filter` source (carrying the old `isRandomised`) and is set as last viewed. Otherwise `channels` isn't set, so the user gets the default "All scenes" channel.
