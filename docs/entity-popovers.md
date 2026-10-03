# Entity Popovers

A popover showing a Stash entity's card (a tag's, performer's or studio's), its title linking to the entity in Stash, with buttons to show its scenes in the feed. It opens from the entity's name in the scene info panel.

**Read this when:** touching `src/components/entity-popovers/`, adding a popover for another kind of entity, or changing what clicking a tag, performer or studio in the scene info panel does.

---

## Structure

| Path | Purpose |
|---|---|
| `EntityPopover/` | The popover itself, for any entity: opening and closing, placement, the card, and its buttons (`EntityPopoverAction`) |
| `entity-actions.tsx` | `EntityActions`: the buttons every entity's popover has (see "Actions") |
| `EntityPopoverCard.tsx` | A card once it's fetched: a loading indicator until then, or the error (smaller than Stash's `ErrorMessage`, which is made for a page) |
| `TagPopover/` | A tag's popover: `TagPopoverCard` (our version of Stash's `TagPopover.tsx`) and `TagPopover` |
| `PerformerPopover/` | A performer's popover, with Stash's `PerformerCard` (their age given at the scene's date, as on Stash's scene page) |
| `StudioPopover/` | A studio's popover, with Stash's `StudioCard`. The studio field gives one to each studio in its chain of parent studios |
| `helpers.ts` | `hasDefaultImage()` (see "Cards") |

`EntityPopover` takes a `label` (its accessible name, e.g. the tag's name), a `card`, the `actions` (`EntityPopoverAction`s, or a component rendering them), and a render function for what opens it. That function is given props to spread onto that element (`EntityPopoverTriggerProps`: its ref, click and hover handlers, and `aria-expanded`). In the info panel the element is a link to the entity in Stash, so a modified click (ctrl/cmd/shift, or a middle click) still opens Stash in a new tab, as it always has. A plain click opens the popover instead.

The card and actions are rendered only while the popover is open, so they can fetch what they show (`useFindTag`) and use hooks freely without every tag on every slide paying for them.

### Adding a popover for another entity

1. Wrap the entity's Stash card in `packages/stash-ui/wrappers/components/` (in `WithBrowserRouter`, as its links need a router: see [stash-ui package](stash-ui-package.md) § "Wrapper Customisations").
2. Add the entity to `entityCriteria` in `src/components/channels/temporary-filter.ts` (the criterion its scenes are filtered by, its modifier, its depth if it's hierarchical, and whether a filter can require more than one of it).
3. Add `<Entity>Popover/` here, like `PerformerPopover/`: its card (fetched, in `EntityPopoverCard`), and `EntityPopover` with `EntityActions` for it.
4. Use it in the info panel's field, giving it the field's `onExternalLinkClick` as `onOpenInStash`, but not in the editor's pills (`preview`).

## Opening and closing

- **Hovering** over what opens it opens it after 500ms (as Stash's popovers do), and leaving it (or the popover) closes it after 200ms, long enough to move onto the popover.
- **Clicking** opens it straight away and keeps it open until a click outside it (`useOutsideClickModifier`'s backdrop, only while it's been clicked open, so a click elsewhere while it's merely hovered does what it would otherwise). Clicking again closes it. Clicked open, it's the app's open popover (`useCurrentOpenPopover`, shared with action buttons' side panels), so only one is open at a time.
- It closes when one of its buttons is clicked, and once it's been scrolled off screen (`useOffscreenModifier`).

## Placement

It opens above what opened it if it fits there, otherwise below if it fits there, otherwise on whichever side has more room (`aboveOrBelowModifier`). Popper's own `flip` falls back to the first placement when neither fits, however little room that side has. Room is measured within the slide, clear of the progress bar (the preventOverflow modifier's boundary and padding, as for side panels).

- Its buttons are on the side nearest what opened it: below the card when it's above, above the card when it's below (`flex-direction: column-reverse` on `.bs-popover-bottom`).
- When there isn't room for all of it, it's limited to the room there is (`setMaxSizeModifier`) and scrolls as a whole, card and buttons together (only up and down: `overflow-x: hidden`). ⚠️ An earlier version scrolled just the card, keeping the buttons in view, but a card scrolling inside the popover read as part of it scrolling.

## Cards

The card is Stash's own (`TagCard`, `PerformerCard`, `StudioCard`, via their stash-ui wrappers), as Stash's popovers show it, its background and shadow taken off so it blends into the popover. Links in it (its title, its counts…) open the page in Stash in a new tab rather than navigating Stash TV: `EntityPopover` catches clicks on them (`onClickCapture`) and opens `getStashUrl()` of their path. A button inside a link (the card's favourite button is one) is left to do what it does.

- **No stand-in image, for tags and studios.** An entity without an image of its own gets one from Stash anyway (its `image_path` has `default=true`, see `hasDefaultImage()`). The card is shown without it (`.entity-card-no-image` hides the image's link, `a:has(> img)`, as a tag's favourite button is in a link of its own). Its favourite button, shown over the image, stays, beside the name. A performer's card keeps Stash's stand-in (a silhouette): their rating, country flag and favourite button are shown over the image, and would pile up on their name without it.
- A performer's card is narrower than in Stash's lists (14rem rather than 20rem, and a studio's 16rem), as its image is portrait and the popover has to fit above or below a name in the panel.
- The favourite button of an entity that isn't one is always shown, where Stash shows it only while the card's hovered over, which a touch screen can't do.

## Actions

`EntityActions` gives every entity's popover the same buttons. There's no "Open in Stash" button: the card's title already links to the entity's page in Stash (see "Cards"). The info panel passes `onOpenInStash` to pause the video as a link in the card is opened, as its other links to Stash do.

- **Show scenes with this tag** (or the like): replaces the temporary channel with one showing the scenes that have the entity, and switches the feed to it (`showTemporaryFilter`, see [channels](channels.md) § "Temporary channel"). Always scenes, even when the feed is showing markers: the panel shows the scene's tags, and markers can't be filtered by everything a scene can (e.g. its studio).
- **Add to channel filter**: shown when there's a temporary channel whose filter doesn't already require this entity. Adds it, so the channel shows scenes with it as well as what it showed (e.g. "Show scenes with this performer", then "Add to channel filter" on a tag, shows that performer's scenes with that tag). Not shown when the filter already filters by that kind of entity but doesn't require all of them, or, for a studio, already has a studio: a scene has only one, and Stash only allows "includes" for them.
- **Remove from channel filter**: shown when the temporary channel's filter requires this entity and would still filter by something without it (another of that kind of entity, or another criterion). Without that, it would show everything.

How the filters are made: [channels](channels.md) § "Filtering by an entity".
