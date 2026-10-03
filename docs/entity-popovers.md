# Entity Popovers

A popover showing a Stash entity's card (a tag's, for now), its title linking to the entity in Stash, with buttons to show its scenes in the feed. It opens from the entity's name in the scene info panel.

**Read this when:** touching `src/components/entity-popovers/`, adding a popover for another kind of entity, or changing what clicking a tag in the scene info panel does.

---

## Structure

| Path | Purpose |
|---|---|
| `EntityPopover/` | The popover itself, for any entity: opening and closing, placement, the card, and its buttons (`EntityPopoverAction`) |
| `entity-actions.tsx` | `EntityActions`: the buttons every entity's popover has (see "Actions") |
| `TagPopover/` | A tag's popover: `TagPopoverCard` (our version of Stash's `TagPopover.tsx`) and `TagPopover` |
| `helpers.ts` | `hasDefaultImage()` (see "Cards") |

`EntityPopover` takes a `label` (its accessible name, e.g. the tag's name), a `card`, the `actions` (`EntityPopoverAction`s, or a component rendering them), and a render function for what opens it. That function is given props to spread onto that element (`EntityPopoverTriggerProps`: its ref, click and hover handlers, and `aria-expanded`). In the info panel the element is a link to the entity in Stash, so a modified click (ctrl/cmd/shift, or a middle click) still opens Stash in a new tab, as it always has. A plain click opens the popover instead.

The card and actions are rendered only while the popover is open, so they can fetch what they show (`useFindTag`) and use hooks freely without every tag on every slide paying for them.

### Adding a popover for another entity

1. Wrap the entity's Stash card in `packages/stash-ui/wrappers/components/` (in `WithBrowserRouter`, as its links need a router: see [stash-ui package](stash-ui-package.md) § "Wrapper Customisations").
2. Add the entity to `entityCriteria` in `src/components/channels/temporary-filter.ts` (the criterion its scenes are filtered by, and whether it's hierarchical).
3. Add `<Entity>Popover/` here, like `TagPopover/`: its card, and `EntityPopover` with `EntityActions` for it.

## Opening and closing

- **Hovering** over what opens it opens it after 500ms (as Stash's popovers do), and leaving it (or the popover) closes it after 200ms, long enough to move onto the popover.
- **Clicking** opens it straight away and keeps it open until a click outside it (`useOutsideClickModifier`'s backdrop, only while it's been clicked open, so a click elsewhere while it's merely hovered does what it would otherwise). Clicking again closes it. Clicked open, it's the app's open popover (`useCurrentOpenPopover`, shared with action buttons' side panels), so only one is open at a time.
- It closes when one of its buttons is clicked, and once it's been scrolled off screen (`useOffscreenModifier`).

## Placement

It opens above what opened it if it fits there, otherwise below if it fits there, otherwise on whichever side has more room (`aboveOrBelowModifier`). Popper's own `flip` falls back to the first placement when neither fits, however little room that side has. Room is measured within the slide, clear of the progress bar (the preventOverflow modifier's boundary and padding, as for side panels).

- Its buttons are on the side nearest what opened it: below the card when it's above, above the card when it's below (`flex-direction: column-reverse` on `.bs-popover-bottom`).
- When there isn't room for all of it, it's limited to the room there is (`setMaxSizeModifier`) and scrolls as a whole, card and buttons together (only up and down: `overflow-x: hidden`). ⚠️ An earlier version scrolled just the card, keeping the buttons in view, but a card scrolling inside the popover read as part of it scrolling.

## Cards

The card is Stash's own (`TagCard`, via its stash-ui wrapper), as Stash's popovers show it. Links in it (its title, its counts…) open the page in Stash in a new tab rather than navigating Stash TV: `EntityPopover` catches clicks on them (`onClickCapture`) and opens `getStashUrl()` of their path. A button inside a link (the card's favourite button is one) is left to do what it does.

- **No stand-in image.** An entity without an image of its own gets one from Stash anyway (its `image_path` has `default=true`, see `hasDefaultImage()`). The card is shown without it (`.no-image` hides the image's link). Its favourite button, shown over the image, stays, beside the name.
- The favourite button of an entity that isn't one is always shown, where Stash shows it only while the card's hovered over, which a touch screen can't do.

## Actions

`EntityActions` gives every entity's popover the same buttons. There's no "Open in Stash" button: the card's title already links to the entity's page in Stash (see "Cards"). The info panel passes `onOpenInStash` to pause the video as a link in the card is opened, as its other links to Stash do.

- **Show scenes with this tag** (or the like): replaces the temporary channel with one showing the scenes that have the entity, and switches the feed to it (`showTemporaryFilter`, see [channels](channels.md) § "Temporary channel"). Always scenes, even when the feed is showing markers: the panel shows the scene's tags, and markers can't be filtered by everything a scene can (e.g. its studio).
- **Add to channel filter**: shown when the temporary channel already filters by that kind of entity, requiring all of them, and not this one. Adds it, so the channel shows scenes with all of them.
- **Remove from channel filter**: shown when the temporary channel's filter requires this entity and would still filter by something without it (another of that kind of entity, or another criterion). Without that, it would show everything.

How the filters are made: [channels](channels.md) § "Filtering by an entity".
