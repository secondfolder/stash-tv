# Action Buttons (Action Button Stack)

**Read this when:** adding or modifying action buttons, the action button stack, folders, button settings forms, or button icons — anything under `src/components/action-buttons/`.

---

## Overview

The action buttons are the vertical button rail on each media slide (TikTok-style), rendered per-slide by `MediaSlide` via `ActionButtonStack`. The stack is fully user-configurable from the Settings tab: which buttons appear, their order, pinning, grouping into folders, and per-button options. The configuration persists in `tvConfig.actionButtonStackConfig` (see [state & config](state-and-config.md)).

## Structure (`src/components/action-buttons/`)

| Path | Purpose |
|---|---|
| `buttons/index.tsx` | Registry: `allButtonDefinition` (every button definition), the `ActionButtonDefinition` / `ActionButtonConfig` / `ActionButtonProps` types, and `getActionButtonDefinition(type)` for typed lookups (returns the `UnknownActionButton` fallback for unknown types instead of throwing) |
| `buttons/<Name>ActionButton.tsx` | One file per button: the React component + a `buttonDefinition` export |
| `ActionButtonBase/` | Presentational shell every button renders through; also exports `ActionButtonIcon` and `ActionButtonTitle` for reuse (settings modal, folder previews) |
| `ActionButtonStack/` | Renders the configured stack: scrollable unpinned section, pinned section, and folders |
| `action-button-config.ts` | `sharedActionButtonSchema` (yup) and the `createNewActionButtonConfig()` factory used when adding buttons |
| `icons/index.tsx` | `actionButtonIcons` registry of user-selectable icons (active/inactive states + categories) |

## Anatomy of a Button

Each button file exports a `buttonDefinition` and a component. Minimal example (`LoopActionButton.tsx`):

```ts
const id = "loop";

const configSchema = sharedActionButtonSchema.shape({
  buttonType: yup.string().oneOf([id]).required(),
});

export const buttonDefinition = {
  id,
  title: { active: "Stop looping scene", inactive: "Loop scene" },
  icon: { active: faRepeat, inactive: LoopOutlineIcon },
  components: {
    button: LoopActionButton,   // required — renders via ActionButtonBase
  },
  configSchema,
} as const satisfies ActionButtonDefinitionInput;

// Definitions may also declare:
//   components.settings: SettingsForm  — Formik form shown in ActionButtonSettingsModal
//   isRepeatable: true                 — may be added to the stack multiple times
```

Key points:

- **`as const satisfies ActionButtonDefinitionInput`** — keeps literal types (so the registry union stays narrow) while checking the definition's shape.
- **`configSchema`** must extend `sharedActionButtonSchema` (`id`, `type: "button"`, `pinned`) and add `buttonType: yup.string().oneOf([id]).required()`, plus any per-button options. `ActionButtonConfig` (the union of all button configs) is inferred from the registry's schemas.
- **`title`** is either a record keyed by state or a `React.FC<{state, config}>` for dynamic titles (e.g. quick-tag shows the tag name). Rendered in an `sr-only` span for accessibility.
- **`icon`** follows the same shape: a per-state record, a single icon, or a function component. Icons can be a FontAwesome `IconDefinition`, a react-bootstrap-icons icon, or any SVG React component (custom SVGs live in `src/assets/` via `?react`).
- **`isRepeatable`** — without it, a button type can only exist once in the stack (including inside folders); the settings UI hides non-repeatable buttons that are already present.
- **Register the button** by importing its `buttonDefinition` and adding it to `allButtonDefinition` in `buttons/index.tsx` — this is what makes it available everywhere (stack, settings, config types).

## Button Props & Runtime Config Validation

The stack renders each button with `ActionButtonProps`: `config`, `scene`, `mediaItem`, `playerRef`, `sceneInfoOpen`, `setSceneInfoOpen`, `onMediaItemDeleted`. Buttons declare only the props they need.

⚠️ `config` arrives as `Record<string, unknown>` — it comes from persisted user settings and must be treated as untrusted. Every button validates it at render time and degrades gracefully:

```ts
let parsedConfig
try {
  parsedConfig = buttonDefinition.configSchema.validateSync(config)
} catch (error) {
  logger.error("Invalid config for ... action button", { error, config })
  return <strong>?</strong>
}
```

⚠️ An unknown `buttonType` in the stack config — e.g. saved by a newer Stash TV instance connected to the same Stash server, then loaded by an older build — must not crash the app. `getActionButtonDefinition` returns `unknownActionButtonDefinition` (`buttons/UnknownActionButton.tsx`) for such types: a non-interactive button with an error icon and `sideInfo` naming the missing type. It is deliberately not in `allButtonDefinition`, so it never shows up in the add-button UI.

## `ActionButtonBase`

The presentational shell all buttons render. Props (beyond those above):

- `state` — a string union (typically `"active" | "inactive"`) driving icon/title selection
- `sidePanel` — content (node or render prop `{isOpen, close}`) shown in a popover beside the button; used for things like the volume slider or playback-rate options
- `sideInfo` — small text rendered next to the button (e.g. o-counter count, scene rating)
- `onClick({toggleSidePanel})` — custom click handling; call `toggleSidePanel()` to open/close the side panel (e.g. o-counter toggles the panel only when active)
- `displayOnly` — renders a non-interactive `<div>` instead of a `<button>`
- `config` — passed through so dynamic titles/icons can read it

Side panel behaviour (implemented in `ActionButtonBase/SidePanel`):

- Only **one side panel can be open app-wide** — coordinated via the module-level `useCurrentOpenPopover` Zustand store; opening one closes any other
- Closes on outside click or when the button scrolls offscreen (custom popper modifiers)
- Placement flips with `leftHandedUi`
- **Dropdown menus in a side panel open above their input when there's no room below**, and if they fit on neither side they open on the side with more room with their option list shortened. The panel never moves to make room. `useFitDropdownMenus` (used by `SidePanel`) watches the panel for any react-select menu, ours or Stash's, and places it with `fitDropdownMenu` (`src/helpers/`). It runs in a mutation observer, so it applies before the browser paints. `includeChildOverflowInPopperSizeModifier`, which grows the popper to fit content sticking out of the panel, deliberately skips these menus. Otherwise the popper re-centres on its button as the panel grows, which shifts the panel every time a dropdown opens.
- ⚠️ **Dropdowns inside a side panel need two overrides on the shared `Select`** (`components/settings/Select`), or the menu opens where the user can't see it:
  - `menuPortalTarget={null}`: by default the menu is portalled to `<body>` with react-select's default z-index of 1. The outside-click handling puts a backdrop just under the panel (the popover's z-index minus 1), so a portalled menu opens behind it.
  - `menuPosition="absolute"`: the shared `Select` defaults to `fixed`, but Popper positions the panel with a CSS transform. A transformed ancestor makes a `position: fixed` child position relative to it rather than the viewport, which puts the menu off screen.
  - An inline menu only has react-select's `z-index: 1`, below the `z-index: 2` Bootstrap gives `.input-group` buttons (e.g. the time fields' buttons in `SceneMarkerForm`), so those buttons would show through it. The shared `Select` raises its container to `z-index: 10` while focused, as Stash's selects do, so this needs no override.
  - Stash's own selects (e.g. the tag selects in `SceneMarkerForm`) render inline and absolutely positioned already. Only jsdom-free tests catch this: see `test/e2e/create-marker-button.test.ts`.

⚠️ Unknown props (e.g. `data-testid`) are **not** forwarded to the DOM by `ActionButtonBase` — it doesn't spread rest props. Don't rely on them for tests.

Convention: buttons add the `hide-on-ui-hide` CSS class so they hide along with the other UI controls.

## Cycle-Option Buttons

Some buttons step through the options of a multi-option setting instead of toggling a boolean. The `start-position` and `end-position` buttons do this for the Settings tab's **Start Point** / **End Point** (`tvConfig.startPosition` / `endPosition`). Both render through `CycleOptionActionButton` (`buttons/CycleOptionActionButton.tsx`):

- Each click selects the next option and wraps from the last back to the first (`getNextOption` in `src/helpers/`). The new option's label is shown briefly in the `FeedbackOverlay`.
- The button's `state` is the current option's value, and the title (built by `cycleOptionTitle`) is the current option's label, e.g. "Play from the beginning". The icon is fixed (a location pin with a play / stop symbol) so the button is recognisable whatever is selected.
- The current option's `shortLabel` is shown as `sideInfo` beside the button, except for the option that leaves playback unchanged (`beginning` / `video-end`, passed as `unlabelledValue`). So the label only appears when the button is changing where playback starts or ends.
- ⚠️ The settings list and folder previews render every button in the `"inactive"` state, which isn't an option value, so the title falls back to a generic name ("Change start point").
- The option lists (`START_POSITION_OPTIONS` / `END_POSITION_OPTIONS` in `src/constants/`) are shared with the Settings tab's selects, and the tvConfig types are derived from them. Add an option there (with a `shortLabel` for the side label) and both the select and the button pick it up.
- An option's `label` and `shortLabel` can be functions of `PlaybackPositionLabelContext`. For example, fixed-length reads "Play for 1 minute 30 seconds" with a "1 minute 30 seconds" side label, using `tvConfig.playLength` ("full length" when unset, since the whole scene then plays). Read the options through `usePlaybackPositionOptions()` (`src/hooks/`), which resolves both to strings; don't use the constants directly where a label is displayed (react-select, for one, expects string labels). That's also why `cycleOptionTitle` takes a hook rather than an options array.
- ⚠️ `usePlaybackPositionOptions()` has an explicit return type on purpose. tvConfig's types depend on the button definitions, whose titles call this hook, so an inferred return type (which would come from `useTvConfig`) makes the types circular. That shows up as a long list of unrelated "implicitly has type 'any'" errors across the action buttons.
- These settings only apply to scene slides (markers always play in full), and the Settings tab hides them in scene preview-only mode. The buttons stay clickable everywhere; on slides the setting doesn't apply to, it changes with no visible effect.

## Create-Marker Button

`create-marker` (`buttons/CreateMarkerActionButton.tsx`) has two modes, chosen by its `markerDefaults` config (the settings form's "Create with defaults" switch):

- **Without defaults:** the button ("Add/edit scene marker") opens a side panel with Stash's `SceneMarkerForm` for a new marker, starting at the current player position. If the scene already has markers, a dropdown (the shared `Select`) sits above the form. It defaults to "Add new marker", followed by an "Edit <marker>" option for each marker. Choosing one swaps the form below for one editing that marker, and choosing "Add new marker" swaps back. The form is keyed by the chosen marker, so switching never carries over edits from the previous one.
- **With defaults:** clicking creates a marker right away at the current playback position, using the configured title, primary tag and tags. Once the scene has one or more markers with that primary tag and title, the button turns active (its icon fills in; its title, `Add/edit "<tag>" markers`, is the same in both states). Clicking it then opens a panel with an "Add another" button (creates one more from the defaults) and a list of those matching markers, each with an Edit button that swaps in `SceneMarkerForm` for it. Deleting the last matching marker turns the button back into a create button.
- Markers are listed by start time and labelled with their start time and title (or primary tag name if untitled), e.g. "1:05 Intro". The panels live in `src/components/MarkerPanels/`; the sorting and labelling logic is in `src/helpers/markers.ts`.
- Saving, deleting or cancelling in `SceneMarkerForm` closes the whole panel. Stash's form calls one `onClose` for all three.
- ⚠️ Stash stores a marker with no title as `""`, so an unset default title is matched as `""`. Otherwise an untitled default marker is never recognised and every click creates another.
- It only renders on scene slides, not marker slides.
- The new marker only shows on the slide because `useLiveMediaItem` refetches a scene whose cached data Stash's marker mutations evict (see [media loading](media-loading.md) § "Live item data").

## Per-Button Behaviour

What each remaining button does, as the tests check it. Buttons not listed here simply toggle the setting their title names (`loop`, `letterboxing`, `force-landscape`, `ui-visibility`, `settings`, `fullscreen`, `show-scene-info`). `fullscreen` renders nothing in browsers without the Fullscreen API.

- **`o-counter`**: the first click adds an orgasm mark. Once the scene's o-count is above what it was when the slide was shown, the button is active and a click opens a panel with −/+ instead. − removes the latest mark from `o_history` and is disabled at 0. If the count drops below its starting point, the start point moves down with it, so the next click adds a mark again. The count shows beside the button when it's above 0.
- **`rate-scene`**: opens Stash's rating control (stars, or a number input for Stash's decimal system, focused on open). Choosing the current star rating again clears it. The rating shows beside the button: stars out of 5 (e.g. `3.5`), decimal out of 10. On marker slides it rates the marker's scene.
- **`set-organized`**: toggles the scene's `organized` flag. Not rendered on marker slides.
- **`quick-tag`**: adds its tag to the scene or marker, or removes it if it's already there, keeping the other tags. On a marker whose primary tag is the button's tag, clicking opens a panel explaining that a primary tag can't be removed.
- **`edit-tags`**: opens a tag editor in a side panel. Save writes the tags and closes it. Cancel discards the edits. Its `pinnedTagIds` setting offers those tags for adding in one click. On markers it edits the marker's tags and notes the primary tag, which it never changes. Invalid config just means no pinned tags.
- **`delete-media-item`**: opens Stash's delete confirmation for the scene or marker; once confirmed, the feed moves on.
- **`volume`**: mutes/unmutes (to full volume) by default. With `fullControl` it opens a volume slider instead, except on iOS, where a video's volume can't be set from code. Invalid config falls back to the mute toggle.
- **`playback-rate`**: a panel of speeds (0.5x–8x) that sets the player's rate. It follows the player's `ratechange`, so the highlighted speed is right wherever the rate was changed. Active while the rate isn't 1x.
- **`resolution`**: lists the scene's streams grouped by resolution and sets the preferred stream (see [video player](video-player.md) § "Source Selection").
- **`subtitles`**: only rendered when the scene has captions in Stash TV's `subtitleLanguage` (Stash plugin config); toggles `showSubtitles`.

⚠️ A button's state shows through its icon (outline when inactive, filled when active) and often its title. Give every button with an active state a different icon for it, as `resolution` (`resolution.svg` / `resolution-outline.svg`) does; its title is the same in both states. `ActionButtonBase` also puts the state on the button as a `state-<value>` class (e.g. `state-active`, or `state-resume` for the start-position button), prefixed so it can't clash with Bootstrap's `.active`. In tests, `displayedIconState()` (`test/helpers/actionButtons.tsx`) reads the state from the icon, which is what the user sees.

## Rendering (`ActionButtonStack`)

- Rendered by `MediaSlide` per slide with `mediaItem`, `playerRef`, `sceneInfoOpen`, etc.
- Unpinned buttons render in a scrollable `.stack` (with overflow indicators); pinned buttons render in the `.pinned` section. Pinning exists so essential buttons stay visible when the window is too short to show the whole stack without scrolling.
- **Folders** (`type: "folder"`) group buttons: collapsed, the folder button previews the first 4 contained buttons' icons; opened, it shows the contents in a popover. Only one folder can be open per slide (`openFolderId` in `mediaItemState`).

## Config Shape & Persistence

```ts
// tvConfig.actionButtonStackConfig: ActionButtonStackConfig[]
{ id: "1", type: "button", buttonType: "ui-visibility", pinned: true }
{ id: "12", type: "folder", pinned: false, contents: [ /* ActionButtonConfig[] */ ] }
```

- Defaults live in `defaults.actionButtonStackConfig` in `src/store/tvConfig.ts` — add new buttons here if they should ship enabled.
- Every button and folder needs a **unique `id`** — used as the React key and to match edits in the settings UI.
- Persists through tvConfig's hybrid storage (see [state & config](state-and-config.md)); a legacy migration renames the old `actionButtonsConfig` key.

## Settings Integration

- The settings tab (`src/components/settings/SettingsTab/`) edits the stack with a `DraggableList`. ⚠️ The editor displays the list **reversed** (bottom-of-stack first) with pinned buttons last, and reverses back on save. Dragging a pinned button above an unpinned one **unpins it** automatically.
- Adding a button: `createNewActionButtonConfig(type, options)` creates the initial config. If the definition has a `components.settings` form, an `ActionButtonSettingsModal` opens first (Formik + `yupFormikValidate(configSchema)`); otherwise the button is added immediately.
- Editing a button's options re-opens the same modal with its saved config (the pen button, "Edit button settings", only appears for definitions with a `settings` component). Saving replaces the button where it is, at the top level or inside a folder. The modal reads "Add …"/"Add" when adding and "Edit …"/"Save" when editing; `SettingsTab` tells it which by whether the button is already in the stack (new configs already have an id, so the id can't tell).
- Buttons can be moved into/out of folders and pinned/unpinned via inline controls; folders can be created empty and deleted.
- Special-cased buttons: the `settings` button can't be deleted or put in a folder, and `ui-visibility` can't be put in a folder (both must stay reachable). Only top-level items can be pinned.
- `createNewActionButtonConfig` supplies per-type defaults — e.g. `quick-tag` needs a `tagId`, `create-marker` optionally gets `markerDefaults` (a second create-marker instance always gets them).

## Icons (`icons/index.tsx`)

- `actionButtonIcons` maps icon ids to `{ states: {active, inactive}, category }`.
- `category` (`"general" | "tag" | "marker" | "main"`) controls which icons a button's settings form offers in its `IconSelect` (e.g. quick-tag offers tag + general icons).
- Buttons with an `iconId` config field (e.g. quick-tag, create-marker) let the user pick their icon. `ActionButtonIcon` resolution order: config's `iconId` from the registry → the definition's `icon` (function component → FontAwesome definition → bootstrap icon → per-state record).

## Adding a New Button (Checklist)

1. Create `buttons/<Name>ActionButton.tsx`: the component (rendering `ActionButtonBase`) + `buttonDefinition`
2. Write the `configSchema` extending `sharedActionButtonSchema`
3. Register in `allButtonDefinition` (`buttons/index.tsx`)
4. If it has options beyond the defaults: add a `components.settings` Formik form + defaults in `createNewActionButtonConfig` (`action-button-config.ts`)
5. If the user should choose its icon: add an `iconId` field to the schema, add icons to the registry, add an `IconSelect` to the settings form
6. Optionally add it to the default stack in `tvConfig.ts`, and set `isRepeatable` if multiple instances make sense
