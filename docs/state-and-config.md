# State Management & Configuration

**Read this when:** touching any Zustand store (`src/store/`), adding a config option, or changing how settings persist.

---

## Stores (`src/store/`)

| Store | Persistence | Purpose |
|---|---|---|
| `tvConfig.ts` | Hybrid (Stash plugin config + localStorage) | User preferences & plugin settings: volume, subtitles, playback rate, CRT effect, UI layout, the scene info panel's layout, page size, channels, the keyboard shortcuts the user has changed ([keyboard shortcuts](keyboard-shortcuts.md)), what a gamepad's controls do (`gamepadMapping`) and whether one's been used (`gamepadUsed`, see [gamepad](gamepad.md)), dev options |
| `globalState.ts` | None (transient) | UI toggles: settings panel and its expanded section (`settingsSection`), scene info, fullscreen, whether a shortcut's key is being recorded (`recordingShortcut`), Stash's rating system for matching shortcuts (`ratingSystem`), the current slide's media item (`currentMediaItemId`), which slide's UI is auto-hidden (`uiIdleMediaItemId`), `tvConfigLoaded` flag |
| `mediaItemState.tsx` | None (one store per slide, via context) | Per-slide UI state: open action-button folder, the o-count the slide was shown with, the slide's element. ⚠️ `MediaItemStateContextProvider`'s `initialValues` are only read on mount: they're the slide's starting values, and the o-counter button relies on `preIncrementOCounterValue` not following the live count |
| Accumulator store (in `useMediaItems`) | None | Feed pagination state — see [media loading](media-loading.md) |
| `gamepadState.ts` | None | Kept by `useGamepad()`: whether a gamepad is connected, whose names its controls have, and the controls held down — see [gamepad](gamepad.md) |

Every store except `gamepadState` (written only by `useGamepad()`, with setters of its own) exposes the same typed `set` / `get` / `setToDefault` / `getDefault` API.

### The Typed Setter Pattern (critical)

Store mutations go through the typed setter methods, never direct state modification:

```ts
// ✅ CORRECT — use the typed setter (type-checks the value and, for tvConfig, routes persistence correctly)
const { set, get } = useTvConfig();
set("volume", 0.5);
set("volume", (prev) => Math.min(prev + 0.1, 1));
const current = get("volume");

// ❌ WRONG — calling Zustand's setState directly bypasses type safety and the
// hybrid storage routing
useTvConfig.setState({ volume: 0.5 });
```

### The `tvConfigLoaded` Guard

🚫 Never modify global state before `tvConfigLoaded` is true. `globalState`'s setters warn and no-op if called pre-init; `App.tsx` renders nothing until the config has loaded.

⚠️ `tvConfigLoaded` doesn't mean Stash's own configuration (`GQL.useConfigurationQuery()`, provided to Stash's components and ours through `ConfigurationProvider`) has loaded. If Stash doesn't answer, tvConfig falls back to its defaults. Stash's components (`ScenePlayer`, `TagSelect`, its selects and ratings…) read the configuration with `useConfigurationContext()`, which throws outside a provider, so as in Stash's own app `App.tsx` mounts the provider and the feed only once the configuration has loaded. Until then it shows a loading indicator, or Stash's "Error loading configuration" message if the request failed. Inside the feed the configuration is always there: read it with `useConfigurationContext()` too.

---

## Hybrid Storage

`tvConfig` persists to **two backends**, split per key by the `createHybridStorage` in `tvConfig.ts`:

- **Stash plugin config** (via `stashConfigStorage`, stored in the Stash database) — everything by default. Syncs user preferences across devices.
- **Browser localStorage** (suffixed `-local`) — keys listed in `localStorageKeys`, currently `forceLandscape` and `fakeGamepad` (a pretend gamepad for trying gamepad support, see [gamepad](gamepad.md) § "Trying it without a gamepad"). Device-specific settings that shouldn't sync across devices.

⚠️ The temporary channel in `channels` isn't persisted at all: tvConfig's `partialize` leaves it out of what's stored (see [channels](channels.md) § "Temporary channel").

⚠️ **Not all config keys persist to the same backend.** Check `localStorageKeys` before assuming where a key lives. Changing which backend an existing key uses can affect users' saved settings — ask first.

## Adding a New Configuration Option

1. Add to the `TvConfig` type in `src/store/tvConfig.ts`
2. Add a default value in the `defaults` object
3. Decide the storage backend — add to `localStorageKeys` only if device-specific
4. Create a UI control in the settings panel (`src/components/settings/`)
5. Access via `useTvConfig()` in components
6. Add tests for the new config option (see [Testing](docs/testing.md))

## UI visibility & auto-hide

Two things decide whether the UI (everything marked `hide-on-ui-hide` / `dim-on-ui-hide`, the Video.js control bar, the action button stack's folders) shows:

- `tvConfig.uiVisible`: the user's own choice, toggled by the `ui-visibility` action button and persisted. The button's state follows this alone.
- `globalState.uiIdleMediaItemId`: transient, set by `useUiAutoHide()` (called once by `FeedPage`) to the current slide's media item (`globalState.currentMediaItemId`, kept up to date by `VideoScroller`) when a mouse user has been idle on it for `tvConfig.uiAutoHideDelay` seconds (default 3; 0 turns it off). Set in Settings → UI → **Auto-hide UI**.

⚠️ Anything that shows or hides UI reads `useUiVisible(mediaItemId).shown` (`uiVisible` and not that slide being the idle one; without an id, the current slide), never `uiVisible` directly, or it won't fade with the rest. `MediaSlide` adds `hide-controls` from it, plus `ui-idle` while auto-hidden, which hides the cursor too and makes the fade out slower (1s, against 0.15s when the user hides the UI). The UI comes back at the usual speed, since `ui-idle` is removed as it does. Both durations come from `--ui-toggle-transition-duration` (set on `:root` in `globals.scss`).

⚠️ UI in a portal outside the slide (e.g. an open action-button folder, a react-bootstrap `Overlay`) isn't reached by the slide's `hide-controls` rules, so it needs its own fade: add `ui-idle` to it from `useUiVisible().uiIdle` and transition opacity over `--ui-toggle-transition-duration`, as `.folder-contents-popover` does. Toggling only `visibility` makes it vanish while everything else fades.

How auto-hide behaves:

- **Mouse only.** A `pointermove` or `pointerdown` from a mouse starts the timer; touch or pen input stops it and shows the UI. Touch use never auto-hides. A `pointermove` where the pointer didn't move is ignored: browsers send them when what's under the pointer changes, like the UI fading.
- **Per slide.** Only the slide that was current when the timer ran out is hidden, so a slide that becomes current (e.g. the feed moving on when a video ends) starts with its UI shown instead of fading it in, and the timer starts again for it. A slide change doesn't show the previous slide's UI: it would fade back in as it scrolls away.
- **Any interaction shows it again:** moving the mouse, a press, a key, the scroll wheel. Each restarts the timer.
- **It doesn't hide** while the mouse rests over a control or panel (`UI_CONTROLS_SELECTOR` in `src/constants`), while the current video is paused, or while Settings, the keyboard shortcuts, the guide, a Bootstrap modal (`body.modal-open`) or the scene info panel's editor is open. Action-button side panels, open folders and the scene info panel itself don't stop it (only resting the mouse on them). These are checked when the timer runs out rather than watched: each blocker goes away through an interaction (which shows the UI and restarts the timer) or the video playing (which restarts the timer).
- **A press that wakes the UI only wakes it.** Its click is swallowed if it lands on a control, so tapping the dimmed Show/Hide UI button while auto-hidden (e.g. a touch after using the mouse) doesn't hide the UI for good. Clicks on the video still play and pause it.

Tests: `test/unit/hooks/useUiAutoHide.test.tsx`, and `test/e2e/ui-auto-hide.test.ts` for the CSS (fading and the cursor).

## Migrations

The persist `version` and `migrate` in `tvConfig.ts` upgrade users' saved config. Bump the version and add a step whenever a key is renamed or reshaped. Each step is covered in `test/unit/store/tvConfig-migration.test.ts`.

- v1: `audioMuted` → `volume`, the `mute` button → `volume`
- v2: `actionButtonsConfig` → `actionButtonStackConfig`
- v3: `currentFilterId` + `isRandomised` → `channels` (see [channels](channels.md) § "Migration")

A gamepad preset changed in a way that would upset people used to it gets a step too, moving them onto a custom mapping of the old one with `keepOldPreset()` (see [gamepad](gamepad.md) § "Changing a preset").

## Why These Decisions

- **Zustand (not Redux):** less boilerplate, better TypeScript ergonomics at this scale
- **Hybrid storage:** Stash config syncs preferences across devices; localStorage holds device-specific settings (e.g. forced landscape)
- **Typed setters:** type safety + automatic persistence routing

## Related docs

- [Testing](docs/testing.md) — How to test config persistence and state management
- [Media loading](docs/media-loading.md) — Media pagination via accumulator store
- [Release process](docs/release-process.md) — Versioning and deployment flow
