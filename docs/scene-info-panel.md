# Scene Info Panel

**Read this when:** touching the scene info panel (`src/components/slide/SceneInfo/`), adding a field it can show, or changing how it's customised.

---

## Overview

The panel across the bottom of a slide showing the scene's details. It's opened with the `show-scene-info` action button or the `i` key (`globalState.sceneInfoOpen`, shared by every slide). On marker slides it shows the marker's scene.

Which fields it shows, on which lines, and which of them are right-aligned, is up to the user and persists in `tvConfig.sceneInfoLayout` (Stash plugin config, so it syncs across devices).

## Structure

| Path | Purpose |
|---|---|
| `index.tsx` | The panel: its edit button, and its fields laid out on their lines (each line a `.field-line` flexbox with its left fields and its right-aligned ones side by side, each in a `.line-fields` box wrapping on its own, at least 2em apart, the right-aligned box pushed to the right by `margin-left: auto` and laid out from the line's end: `row-reverse`, so the first right-aligned field is at the end and rows wrap starting there, mirroring the left fields) |
| `fields/` | One file per field, each exporting its definition (`defineField`: its id, name, component, options, and whether it's repeatable), listed in order in `fields/index.tsx` (`sceneInfoFields`), which everything else about the fields (`sceneInfoFieldIds`, `sceneInfoFieldLabels`, `sceneInfoFieldOptionSchemas`, `SceneInfoFieldOptions`…) is derived from. A field's component gets its own options and renders its value or `null` when the scene has none. `SceneInfoField` renders a field by id. `shared.tsx` has what they share (`Field`, `labelProps`) |
| `field-options.tsx` | Declaring options (`choice`, `toggle`, `labelOption`), and the defaults and validation derived from them |
| `default-layout.ts` | The default layout, in a module of its own: the tvConfig store imports it, and must not import the fields (see the ⚠️ below) |
| `SceneInfoEditor.tsx` | The edit mode: its toolbar (the name / value switch, Reset, Cancel, Save), the fields' pills in a `LineLayoutEditor`, and their options buttons |
| `SceneInfoFieldOptionsModal.tsx` | A field's options dialog, opened from its pill, with the controls for each field's options |
| `scene-info-config.ts` | Field ids and names, the layout type (a `LineLayoutEditor` `Layout`) and default, repeatable fields' instances, the fields' options and their defaults (`resolveFieldOptions`), and `fieldsNotInLayout` |

## Fields

Studio (with its parent studios), title (linking to the scene in Stash, and pausing the video when clicked), performers, date, details, tags, groups, studio code, director, rating, duration, resolution, frame rate, play count, o-count, file path and URLs, and spacers (see "Spacers"). Some can be shown more than one way (see "Field options"). Fields are their own size (the panel's text size): there's no smaller size set for them.

- A field renders nothing when the scene has no value for it, so its line takes no space (or is shorter). The exceptions are the rating and o-count shown as controls, which show without a value too, so one can be given.
- The date is formatted as on the scene's page in Stash (`FormattedDate` with the `long` format, e.g. "14 February 2025"), and the frame rate with Stash's own message ("24 fps").
- The rating, as a control (the default), is Stash's `RatingSystem` via its stash-ui wrapper (stars or a number, following the rating system set in Stash), which sets the rating. As with the rate scene action button, hovering the current rating's star shows "Clear" where the rating's shown, and with no rating the stars show (none, or one too small for a star), nothing's shown beside them (not even the rating a hovered star would give). That's on the side away from the fields beside it (`valueSide`: after the stars in a left field, before them in a right-aligned one), so the stars don't move as it comes and goes. As text it's out of 5 or 10.
- The o-count, as a control (the default), is a button with the o-counter icon and the count, which behaves as the o-counter action button does: its icon is an outline until the scene's been marked since the slide was shown, a click marks it (and turns the icon solid), and once marked a click opens the o-counter's −/+ controls above it. Both share `useOCounter` and `OCounterControls`, and the slide's `preIncrementOCounterValue`, so they agree on whether the scene's been marked.
- The resolution shows its name (`TextUtils.resolution`, e.g. "1080p") or its dimensions ("1920×1080").
- The play count and the o-count shown as text are labelled with an icon (the default: an eye and the o-counter's splash) or their name. The performers are labelled with a person icon (the default) or their name, or not labelled, and the resolution isn't labelled (the default) or is labelled with an icon (`assets/resolution.svg`) or its name (`labelProps`, the icons from the field's "Label" option). The icon has the field's name for screen readers and as its tooltip. The play count's and o-count's icons are outlines while their count is 0 and solid once it isn't. With their icon they're shown at 0 too (the outline says so), and with their name only once they're more than 0.
- The details are cut short after 3 lines (`-webkit-line-clamp`) unless always shown in full. Only when they don't all fit are they clickable, to show the rest and to cut them short again. Each slide has its own.
- The tags are cut short after 2 rows unless all always shown, every row shown in full: the rows are measured from where the tags are laid out (`offsetTop`, with a `ResizeObserver`), and the list's `max-height` ends at the second row's bottom. A "Show N more" link below them (in the text's colour) (at the end they're aligned to), counting the tags hidden, shows every tag, which then stay shown for that slide. They're only cut short if at least 2 tags would be hidden (`minHiddenTags`): the button would take about as much room as one tag. ⚠️ An earlier version showed a third row faded out under "Show more", which took the room of a row without being readable.
- In the editor's pills, the values aren't interactive (`preview`): the rating's control is disabled, and the o-count's button, the details and "Show more" aren't clickable.
- Values that don't explain themselves (a number, a code) show the field's name first (`Field`'s `showLabel`) or an icon standing in for it (`Field`'s `icon`).
- A line's fields, and the line's two sides, are centred vertically on it (`align-items: center`), so values of different heights (a title, stars, icons) line up.
- What's in a right-aligned field is right-aligned too (`text-align: right`, and the end of the row for the fields that are flexboxes, like tags), in the panel and in the editor's pills showing values.
- Clicking or hovering over a tag opens its popover (`TagPopover`, see [entity popovers](entity-popovers.md)): its card (its title linking to the tag in Stash), and buttons to show its scenes in the feed. A modified click (e.g. ctrl/cmd) still opens it in Stash, as each tag is a link to it. Not in the editor's pills.
- Clicking or hovering over a performer opens their popover (`PerformerPopover`), and over a studio (or one of its parents) its popover (`StudioPopover`), in the same way.
- Tags are spaced by their list's `gap` alone: Stash's margin around each `.tag-item` is removed. They're outlined in the text's colour, on no background, rather than Stash's filled badges.
- Fields render only while they're in the layout, so a hidden field's work (e.g. fetching the studio's parent studios) doesn't happen.

To add a field: add a file for it in `fields/` exporting its `fieldDefinition` (`defineField({ id, label, component })`, see `shared.tsx`), and list it in `sceneInfoFields` (`fields/index.tsx`), where it is in the list being where it's listed among the unused fields. It starts out of the default layout, among the unused fields.

⚠️ Importing the fields imports their components, some of which import Stash's API client (`StashService`), which connects as it's imported. So the tvConfig store imports the default layout from `default-layout.ts`, not `scene-info-config.ts` (which imports the fields), and unit tests of the config mock `StashService`.

## Field options

Fields that can be shown more than one way have an options button (FontAwesome's pen-to-square, a little bigger than the ×) on their pills on the lines (`.field-options`, beside the ×), which opens their options dialog (`SceneInfoFieldOptionsModal`, built on `ConfigItemModal`). The unused fields' pills don't have one: they're buttons themselves.

| Field | Options (default first) |
|---|---|
| Rating | Shown as a rating control or as text |
| O-count | Shown as a button, like the o-counter action button, or as text |
| Details | Cut short after 3 lines, or always shown in full |
| Tags | Cut short after 2 rows, or all always shown |
| Performers | Labelled with an icon or their name, or not labelled |
| Play count | Labelled with an icon or its name |
| O-count, as text | Labelled with an icon or its name (offered only while it's shown as text) |
| Resolution | Its name or its dimensions; not labelled, or labelled with an icon or its name |
| Spacer (each its own) | Small, medium or big |

- Options are part of the editor's draft, like the layout: the dialog's **Save** puts them in the draft, and the editor's **Save** stores them (**Cancel** discards them). **Reset to default** resets them too, and it's offered whenever the layout or the options aren't the defaults.
- Pills showing values show them as the options in the draft say.
- Options are declared once, in the field's definition (its `options`, declared before its component, which is typed with them: `SceneInfoFieldProps<OptionsOf<typeof schema>>`), with the helpers in `field-options.tsx`: `choice(choices, default, details)`, `toggle(default, details)` and `labelOption({ name, icons, allowNone, default })` (the "Label" option). Everything else is derived from that: the options' types (`SceneInfoFieldOptions`, each a union of its choices), their defaults, `resolveFieldOptions`' validation of saved settings, and the dialog's controls and validation.
- In the dialog, a toggle is a switch and a choice a button group, as in the editor's "Show…" buttons. A choice can be something other than text (`ChoiceLabel`'s `content`): an icon (e.g. a label's "Icon", sized to the text, as some icons fill whatever they're in), or "None" in italics, as it isn't literally the label, as the others are. Those are named for screen readers and in their tooltip. An option can be hidden while the field's other options make it irrelevant (`shown`).
- Values in pills look as in the panel: Stash's `.tag-item .btn` rule (faded, padded) is undone for the rating's buttons, as it greyed the stars and moved the outlines away from the filled stars over them.
- The options button works like the ×: pressing it and dragging still drags the pill, a drag's closing click doesn't open the dialog (`onTap`), and the ghost and the dragged pill have one too, so they're the same size. Copies of the pill that aren't to be interacted with get a plain one (`interactive` false).
- To add an option: declare it in the field's `options`. A field's first option also gives it the options button. A "Label" option's icons are what the field's value is labelled with (`labelProps`).

## Spacers

A spacer is space between fields: beside them on a line, or, when no other field on its line shows anything, above and below it (`.field-line:not(:has(.field:not(.field-spacer)))`). Its size (small, medium or big: 0.5, 1.5 or 3em beside fields, and 0.5, 1 or 2em between lines) is an option of its own.

- A line's fields have no gap between them (`.line-fields`): the space between them is up to spacers. A gap would come either side of a spacer too, so even the smallest spacer doubled the space between two fields. A line's two sides are still kept apart (`--line-sides-gap`).

- It's a repeatable field (`isRepeatableField`): it's always among the unused fields, and adding it (dragging it up or tapping it) adds a new instance of it (`newFieldInstance`), leaving it there. Dragged up, the instance is made as the drag starts, so its ghost and its pill once it's dropped are the same element (the same key).
- Each instance is an object in the layout, `{ field, id, options }`, with its options its own (`resolveFieldOptions(config, entry)`), not in `sceneInfoFieldOptions`, so they go with it when it's removed. The `id` tells it apart from others that are just the same, to keep track of it as it moves. Code goes through `entryField`, `entryKey` (its key and its pill's `data-key`) and `entryLabel` rather than treating entries as strings. Its options dialog sets its options in the layout (`replaceItem`). A field is repeatable with `repeatable: true` in its definition, and its instances are named with its `instanceLabel` (the spacer's "Big spacer").
- An instance's pill is named after its size ("Big spacer"), the one among the unused fields "Spacer", even showing values.
- In the editor a spacer isn't drawn as a pill (`.spacer-pill`): just its name and its buttons, in muted text, with no badge, outline or padding, as it's space rather than a field. Its name never wraps, where other pills' text wraps as a line's sides shrink to fit.
- Showing values, an instance's pill is a line as long as the space it adds, along the way it adds it (`.spacer-line`, its size from the same rules as in the panel, with a tick at each end), fainter than a field with no value's "No …" (`opacity: 0.3`) (its name is its accessible name). Up and down alone on its line (with nothing else on it showing anything), as in the panel (its pill then padded either side, `0 1.5em`, as there's nothing beside it to move, making it easier to hover over), and dragged, as it will be where it's dropped, or with nowhere to go (outside the editor, or over the unused fields to be removed), as it was on the line it was dragged off (from `LineLayoutEditor`'s `data-drop`, `.target`, `.from-line` and `.settle-target`, see "Where it will go" in [line layout editor](line-layout-editor.md) § "Using it"). The pill is no bigger than the line, so the line takes no more room than the space does in the panel: it has no least width for its controls, which overflow it over its neighbours rather than moving them, and an invisible `::before` makes it easier to hover over. At a line's edge, its controls overflow away from the edge, moved 0.6em past it so their rounded corners don't uncover the line's end. ⚠️ CSS can't nest `:has()`, so whether the dragged copy's line has anything shown is checked as `:has(.target):not(:has(.target .field:not(.field-spacer)))` on the editor. ⚠️ Making the line's sides stretch (`flex: 1`) to stop it wrapping took away the space after a line's fields, which is how fields are dragged to be right-aligned (see `sideAt`).
- Not editing, spacers on lines of their own with nothing shown between them (the lines between have no values for the scene) collapse to the biggest of them (the first, of the same size): the others' lines get `.collapsed-spacer`. Otherwise they'd add up to more space than any of them. With nothing shown before them, or after them (e.g. on lines between the panel's top and fields with no values for the scene), they'd be space at the top or bottom of the panel, so they all collapse. It's worked out from what's rendered (`collapseSpacers`, after every render of the panel's lines), as whether a field shows anything is up to the field.

## Customising the panel

The pencil button in the panel's top right corner switches the panel to edit mode. Changes are made to a draft (`globalState.sceneInfoDraft`, the layout and the fields' options): **Save** stores it, and **Cancel**, or closing the panel, discards it. The draft is global, not the slide's, so editing carries on with the same changes if the feed moves to another video (e.g. when one ends), as does whether the pills show names or values (`globalState.sceneInfoEditorPillContent`). Every rendered slide's panel shows the editor, so the next slide's is already the editor as it scrolls into view; showing it only on the current slide had the panel turn into the editor once it arrived.

- Each field becomes a pill, on the same lines as in the panel, which can be dragged about, and removed or added from the fields not in the panel with the controls shown over it when it's hovered over or tapped: ×/+, a drag handle, and its options (a gear, `GearFill`: solid, so it's legible at that size), for fields that have any (see "Moving fields", and "Controls" in [line layout editor](line-layout-editor.md) § "Using it"). An unused field's controls have its options too, except a repeatable one's (each instance added has its own). Those are listed below the pills, or beside them on a screen wider than it's tall (`availableBeside`, from `useWindowSize`, which allows for forced landscape).
- The **Show… Field name / Field value** button group (styled like the Add Channel dialog's) switches the pills between the fields' names and their values for this scene. Showing values, each pill shows its field exactly as the panel does (the title's size, the studio chain, tag badges…): the pill isn't filled (`.scene-info-editor.showing-values`), without the badge's text styles, and nothing about the field inside it is restyled. Values aren't clickable in pills. They're outlined (faintly) only while hovered over, revealed by a tap, focused or dragged, so the view reads like the panel. A field with no value for the scene shows "No <field>" in sentence case (`noValueLabel`: a first word that's simply capitalised is lowercased, so "No studio code" but "No URLs"), faded and in italics (from CSS, via `data-empty-label`).
- **Reset to default** puts the default layout (`defaultSceneInfoLayout`: the studio, the title, the date with the resolution and frame rate right-aligned, the rating with the o-count and play count right-aligned, the performers, the tags and the details, with spacers between) in the draft. As with the settings' reset buttons, it's an `outline-warning` button shown only when the layout isn't the default.
- The buttons follow the settings panel's: full-size, with Save in its primary style (like Show Guide).
- While editing, the panel reaches the bottom of the screen (`.SceneInfo.editing`), over the video's progress bar and controls, for more room. It's lifted over them (`z-index: 4`: they share its usual 3, and come after it), and the action button stack is lifted to match (`ActionButtonStack.css`), staying over the panel.

### Switching to and from editing

The panel morphs between showing the fields and the editor (`useMorphTransition`), on the slide whose edit button, Save or Cancel was clicked (other slides' panels just switch), and the pills morph between showing names and values. The aim is as little movement and flashing as possible: everything goes in a straight line from where it was to where it is, and nothing pops into view or flips straight from one look to another.

- Fields and pills are matched by their entry's key (`data-morph-key`: the pills' via `itemProps`, the fields' via `FieldMorphKeyContext`, which `Field` puts on its element). A matched pair slides straight from one place to the other, scaled evenly, centre to centre, so a field's text shrinks into its pill (and grows back), while its new look fades in over its old one, which then fades out underneath: fading both at once, partway through each was half see-through.
- What has no counterpart fades: the edit button out, and the editor (its toolbar and the unused fields' pills) in, later on, once the panel's mostly grown. Fields with no value (no element) have no counterpart, so their pills fade in. Something new inside something new (e.g. an unused field's pill in the editor) fades with it, not on its own as well: faded twice over, the pills stayed faint, then suddenly weren't, at the end.
- A spacer shows nothing in the panel, so it has no look to morph from: its pill fades in in place rather than growing out of an empty box (and fades out the same way).
- The background (`data-morph-frame`) is stretched to fit, not crossfaded: two copies of a translucent background fading into each other were darker partway through, which flashed. Its copy is in a layer of its own under the panel's content (`.morph-frame-layer`), not the layer over it: there, what fades in for real (the toolbar, the unused fields) showed through the translucent background, dimmed, until the morph ended and they snapped to full brightness. The panel's clipped to it as it morphs, so the editor's toolbar is revealed as the panel grows, rather than showing above it, over the video.
- **Names ↔ values** morphs only the pills (`morph(".field-pill")`, via `beforePillsChange`): framer-motion slides the rest (the toolbar, the unused fields' box, the background) as the pills change size. The morph uses framer-motion's layout timing (0.45s, its easing) so pills in a box it's sliding keep in step with it.
- Copies of the fields and pills do the moving, in a layer over the panel (`.morph-layer`), so nothing about the real elements' layout changes: framer-motion lays the pills out and measures them, transforms and all. The real ones are hidden until it's done. ⚠️ Copies are sized to the fraction of a pixel (`layoutSize`): sized with `offsetWidth`, which rounds, a field's copy was a fraction too narrow, so its text wrapped mid-morph. Stretched to fit, their text was squashed.
- It ends when its animations finish, in the same frame for all of them: hiding the real elements for a set time while a timer removed the copies had both show for a frame, which flashed.
- Nothing's animated if the user prefers reduced motion. ⚠️ E2E tests wait for it to finish (`morphDone`): until then, the copies match the same locators as the real fields and pills.

## Moving fields

The editor is a `LineLayoutEditor` (see [line layout editor](line-layout-editor.md), which has how dragging works and why), its items the fields' pills (`.field-pill`, with `data-field`). The panel gives it what the pills show (`PillContent`), their options buttons (`renderItemActions`), and which fields can be added (`fieldsNotInLayout`, a repeatable field's `take` being a new instance of it).

- The panel is anchored at the bottom of the slide and grows upwards, scrolling once it reaches the top of the screen. While editing, its content only clips what's outside it (`overflow: auto`) while it's actually taller than the panel can be (`.scrollable`, measured with a `ResizeObserver`): otherwise, as the panel shrank, the toolbar sliding down from where it had been was clipped until it arrived. Not editing, nothing slides, so it can always scroll, and every slide's panel doesn't have to measure itself. Its content (`.panel-content`) is a framer-motion element with `layoutScroll`, so pills sliding about allow for it being scrolled. ⚠️ The panel's max height stays on the panel itself, not the content: it has a percentage in it, which only applies to an element whose containing block has a set height (the slide, for the panel), so on the content it was ignored.
- The panel's background is an element of its own (`.panel-background`), which framer-motion animates (`layout`) to the panel's new size, so it grows and shrinks in step with the editor's contents sliding rather than snapping to its new size. Stretching a background distorts nothing, unlike animating the panel itself, whose contents would be stretched too. ⚠️ The background and content are motion elements only while editing: framer-motion measures a motion element's layout every time it renders, and with every slide's panel paying for it, the extra work was enough to make timing-sensitive tests (the keyboard rating ones) fail.
- ⚠️ An earlier version held the panel by its top while dragging, so that a line wrapping as the ghost joined it didn't move everything above (which left the pointer over another row, and the ghost moving there undid the wrap, over and over). That's now handled by not showing the ghost on a line whose height it would change (see the design goal at the top of "Moving items" in docs/line-layout-editor.md), and holding it made the panel grow downwards.

## Config shape & persistence

```ts
// tvConfig.sceneInfoLayout — lines top to bottom, each listing its fields left to right, or, when some of them are
// right-aligned, its left fields and its right-aligned ones (each left to right)
[["studio"], { left: ["title"], right: ["rating"] }, ["performers", "date"], [{ field: "spacer", id: "…", options: { size: "big" } }]]
```

- It's a `LineLayoutEditor` `Layout` (see [line layout editor](line-layout-editor.md) § "Layout model"): a line is stored as a plain list unless it has right-aligned fields, so layouts without any read the same as before right-aligning existed.

```ts
// tvConfig.sceneInfoFieldOptions — the options that have been set, by field
{ rating: { display: "text" }, resolution: { format: "dimensions", label: "text" } }
```

- Stored loosely (`SceneInfoFieldOptionsConfig`), as it may have been saved by another version of Stash TV, and read through `resolveFieldOptions`: options not set get their defaults, a value an option can't take (e.g. a choice since removed) is replaced by its default, and options or fields this version doesn't know are ignored. In Stash's plugin config, like the layout.

- A field a version of Stash TV doesn't know (e.g. saved by a newer one using the same Stash server) stays where it is in the layout, but isn't shown. In the editor it's an "Unknown field" pill that can be moved or removed.
- No migration: users without the key get the default. The default's spacers have fixed ids (`default-1`…), unique only within the layout, which is all an instance's id needs.
- ⚠️ Tests that edit the layout set up a simple one of their own (`SIMPLE_LAYOUT`, in the integration and e2e panel tests) rather than relying on the default, which is long and changes.
