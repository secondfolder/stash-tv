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

⚠️ Unknown props (e.g. `data-testid`) are **not** forwarded to the DOM by `ActionButtonBase` — it doesn't spread rest props. Don't rely on them for tests.

Convention: buttons add the `hide-on-ui-hide` CSS class so they hide along with the other UI controls.

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
- Editing a button's options re-opens the same modal with its saved config (the pen button only appears for definitions with a `settings` component).
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
