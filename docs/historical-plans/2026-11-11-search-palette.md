> Frozen implementation plan, written 2026-11-11 before implementation, after mockups were reviewed. Deviations are marked inline.

# Search action button

## Context

The user asked for a search action button opening the `CommandPalette`, suggesting as the user types: an exact search for the text, and matching performers, tags, channels (saved scene/marker filters with a channel) and, as it turned out, studios. Each suggestion shows some detail (e.g. a performer's thumbnail and scene count). Enter does the plain search; ↓ moves to a suggestion. A search replaces the temporary channel, never adding to it as "Show scenes with this tag"'s sibling "Add to channel filter" does. The style matches Stash TV's, which follows Stash's, with mobile-friendly changes.

Mockups were reviewed first (phone and desktop frames: rich rows grouped by kind, a compact alternative, empty states). Decisions taken on review:

1. The plain search gets two rows, "Scenes matching" (first, so Enter does it) and "Markers matching".
2. Picking a channel switches to it, with no temporary channel.
3. Studios are included, as the last group.
4. Tags offer both their scenes and their markers.
5. `CommandPalette`'s `status` isn't renamed: suggestions go in `items`, which gain group headings, a leading icon, and a highlight that survives results arriving late.
6. A `search` shortcut, `/` by default.
7. Rich rows rather than compact ones.

## Plan

- **CommandPalette:** items get `group` (a heading over each run of them, `role="group"`) and `icon`. The highlight is tracked by item id: it stays on the same item while results change, and goes back to the first when the query changes. Actions get an icon-only form (the Clear button). An `inputPrefix` (the search icon). Notes (`status`) move after the results.
- **Shortcut matching:** `isTypingTarget()` counts anywhere in a command palette, so a focused palette button doesn't let shortcuts through.
- **Search state:** `globalState.searchOpen`, set by the `search` button and the `search` shortcut action (`/`). `FeedPage` renders one `SearchPalette`.
- **Data:** our own `gql` queries in tv-ui (`SearchPerformersForTv`, `SearchTagsForTv`, `SearchStudiosForTv`), not stash-ui's `stash-tv.graphql` (changing stash-ui's patch is ask-first, and only the search uses them). Debounced 250ms; 25 by name, ranked with Stash's `sortByRelevance`, best 5 per kind.
- **Filters:** `makeSearchFilter(mode, text)` (just `find_filter.q`) and a `mode` for `makeEntityFilter` (markers with a tag). Everything goes through `showTemporaryFilter()`, which already replaces the temporary channel.
- **mock-stash:** `findPerformers` and `findStudios`, and `q` matching every word against name or alias as Stash does (also for `findTags`). Conformance cases using the app's own documents.
- **Tests:** unit (palette groups and highlight, icon actions, typing guard, filters) and integration (opening, each kind of suggestion, replacing the temporary channel, channels, nothing found, closing).
- **Docs:** new `docs/search.md`; channels, keyboard shortcuts, action buttons and `AGENTS.md` updated.
