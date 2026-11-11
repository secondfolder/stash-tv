# Search

The search palette: a `CommandPalette` (see [keyboard shortcuts](keyboard-shortcuts.md) § "The command palette") where the user types what they're looking for and picks from suggestions, which the feed then shows.

**Read this when:** touching `src/components/SearchPalette/`, the `search` action button or shortcut, or what a search shows in the feed.

---

## Opening it

- The `search` action button (`SearchActionButton`, in the default stack above `change-channel`) and the `search` shortcut (`/` by default, as many sites use) both set `globalState.searchOpen`. `FeedPage` renders the one `SearchPalette`, so it's the same palette whichever slide it was opened from.
- The shortcut's listener is in `SearchPalette`. It `preventDefault`s the key, so `/` isn't typed into the field once it has focus, and Firefox's quick find doesn't open.
- Closing it (Escape, a click outside, or picking something) empties it, so it's empty the next time it's opened.
- While it's open no shortcut fires, from its field or its buttons (`isTypingTarget()` counts anywhere in a command palette, see [keyboard shortcuts](keyboard-shortcuts.md) § "Matching").

## Suggestions

What's typed is suggested as the first two rows, then what it matches, each kind under its own heading (`CommandPaletteItem.group`):

| Row | Shows | Picking it |
| --- | --- | --- |
| Scenes matching "…" | — | Searches scenes for the text (`makeSearchFilter`) |
| Markers matching "…" | — | Searches markers for the text |
| **Channels** | Whether it's a saved filter or temporary, whether it's in random order, and "Showing" for the one the feed is showing | Switches the feed to it (`setActiveChannel`), with no temporary channel |
| **Performers** | Image, disambiguation, favourite heart, the alias that matched (if their name didn't), otherwise country and age; scene count | Their scenes |
| **Tags** | Image (an icon if it has none of its own), as Stash's tag badge; the alias that matched, or its first parent; scene count | Its scenes |
| **Markers by tag** | The same tags again, only those with markers; marker count | Its markers |
| **Studios** | Logo on a light tile (logos are usually dark on a transparent background); the alias that matched, or its parent studio; scene count | Its scenes and its sub-studios' |

- **Enter picks the first row**, searching scenes for the text, so typing and pressing Enter is a plain search. ↓ moves to the others.
- Channels are matched by name, in the app (`getChannelName()`, so as they're listed elsewhere). The rest come from Stash.
- Performers, tags and studios are searched for with Stash's `q` (name or alias, every word matching one of them) once typing pauses for 250ms (`useSearchResults`), with queries of our own (`search-queries.ts`, named `…ForTv`). They're written in tv-ui rather than stash-ui's `stash-tv.graphql`, as only the search uses them. Mock-stash has conformance cases for them, importing the same documents.
- **Ranking:** each query fetches the first 25 matches by name, which are then ranked as Stash's own selects rank theirs (`sortByRelevance`: exact name, then names starting with it, then aliases…), keeping the best 5 of each kind. Stash's selects fetch more (its `maxOptionsShown`, 200), but the search also fetches counts, which Stash works out for each one.
- Each kind appears as soon as its query answers. The results for what was typed before stay until then (Apollo's `previousData`), so the list doesn't empty and refill with every key. "Searching…" shows under the list while results are still to come.
- With results arriving late, the palette keeps the highlighted row as it is if it's still there, so the highlight doesn't jump while the user is moving through the list. Typing something new highlights the first row again.
- Images marked `default=true` are Stash's placeholders. Tags and studios show an icon in their place; performers keep Stash's silhouette, as Stash's own performer select does.
- Each row is at least 44px tall, for touch. The field's text is 16px, or iOS zooms in when it's focused.
- With nothing matching but the text itself, a note says so under the two search rows.

## What it shows

Everything but a channel is shown in the **temporary channel** with `showTemporaryFilter()`, which always replaces whatever the temporary channel showed. Unlike a tag's popover, the search never adds to that filter. The feedback overlay then names the channel for 3 seconds (e.g. "Scenes: Carol Chase", "Scenes: “sunset”"), as `change-channel`'s cycling does. See [channels](channels.md) § "Searching" for the filters.
