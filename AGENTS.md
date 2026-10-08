# Stash TV Agent Guidelines

## Project Overview

**Stash TV** is a TikTok-like vertical scroller interface for Stash (a media library management application). It allows users to view scenes and markers by swiping through them like a social media feed. The project is built as a plugin for Stash and is designed to maximize code reuse from the main Stash frontend while providing custom optimizations and features.

**Key Constraint:** Code quality and maintainability are paramount. Always prioritize clean, refactorable code over quick solutions. When reusing existing code, refactor into shared utilities rather than copying.

---

## Maintaining This File

This file and the topic docs under `docs/` are a living reference for agents working on the project. **Keep them up to date as part of your work.** You should update them whenever you:

- **Discover new details** worth recording — e.g. an undocumented gotcha, a useful debugging technique, an architectural pattern not yet described, or anything you had to work out the hard way that the next agent shouldn't have to.
- **Find an inconsistency** — if anything in this file is outdated, incorrect, or contradicts the actual code, fix the documentation to match reality.
- **Make code changes that require a documentation update** — if you add, remove, or change a feature, pattern, convention, build step, or architectural decision described here, update the relevant sections in the same change.

When updating, follow the existing style: concise bullet points, clear headings, and warnings (⚠️) for gotchas. Place new information in the most relevant existing section rather than creating unnecessary new ones. Keep this file tight — broadly-needed knowledge goes here; feature-specific or tightly-scoped detail goes in the relevant doc under `docs/` (or a new one if the topic is new).

---

## Documentation

Feature-specific documentation lives under `docs/`. Read the one that covers what you are touching — the table below says _when_ to read each:

| Doc                                      | Read it when                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [Media loading](docs/media-loading.md)   | Touching `useMediaItems`, `useLiveMediaItem`, filters, pagination, preview-only modes, or feed data loading |
| [Video player](docs/video-player.md)     | Touching playback, player DOM, or workarounds for Stash ScenePlayer/Video.js quirks                       |
| [stash-ui package](docs/stash-ui-package.md) | Integrating or modifying Stash frontend components, understanding wrappers vs patches                  |
| [State & config](docs/state-and-config.md) | Touching state, adding a config option, or changing how settings persist (Zustand stores, hybrid storage) |
| [Channels](docs/channels.md)             | Touching the user's channel list, channel sources, the startup channel, or how the feed picks what to show  |
| [Action buttons](docs/action-buttons.md) | Adding an action button or touching `src/components/action-buttons/` (schemas, config, folders)           |
| [Release process](docs/release-process.md) | Writing commits, preparing releases, or understanding versioning/deployment flow                          |
| [Testing](docs/testing.md)              | Writing or modifying any test, running the suites, or touching test infrastructure/polyfills          |
| [Scene info panel](docs/scene-info-panel.md) | Touching the scene info panel (`src/components/slide/SceneInfo/`), its fields, or how users customise it |
| [Line layout editor](docs/line-layout-editor.md) | Touching `src/components/LineLayoutEditor/` (dragging items onto lines, ghosts, insertion lines, right-aligning) or using it for something new |
| [Entity popovers](docs/entity-popovers.md) | Touching `src/components/entity-popovers/` (a tag's, performer's or studio's popover in the info panel, and its card and buttons) or adding a popover for another kind of entity |
| [Keyboard shortcuts](docs/keyboard-shortcuts.md) | Adding, removing or rebinding a keyboard shortcut, or touching the shortcut help text                  |
| [App updates](docs/app-updates.md)       | Touching the new-version notice, how the app detects that a new version is installed, or anything that affects how browsers cache the app |
| [Stash compatibility](docs/stash-compatibility.md) | Updating the Stash version stash-ui is built from, touching how the app talks to Stash's API (Apollo links, `getApolloClient`), or something works on one Stash version but not another |

Adding a new doc means adding its row to this table. A test validates that every doc in `docs/` is listed here and every link points to a real file — a doc without a row is caught rather than going unnoticed.

### Documentation purpose and style

**DOCS/** files describe **behavior, design decisions, and rationale** — not the process of implementation. They answer "what is this and why does it work this way?" not "how did we build it?".

Examples of appropriate content for `docs/`:
- How pagination works in the media accumulator and why it's designed that way
- The hybrid storage system for tvConfig and its trade-offs
- Video.js workarounds and why they're necessary
- Architectural patterns like wrappers vs patches for stash-ui
- Component conventions and testing strategies for future developers

**Where new knowledge goes:** if you discover a gotcha, convention, or technique while implementing that will matter to anyone touching that area again (not just while the current task is running), it belongs in the relevant `docs/` topic doc — or in this file if it's repo-wide. It does **not** belong only in a plan under `docs/historical-plans/` (frozen, point-in-time) or in a commit message. Rule of thumb: plans record *what was done and why then*; `docs/` records *how the system works now*. When you add a gotcha to a plan mid-implementation, also check whether it should be promoted to `docs/`.

**DOCS/HISTORICAL-PLANS/** stores frozen implementation plans. These are:
- Complete plans written before work begins
- Updated only during implementation to record deviations (marked inline, dated, with author)
- Never silently rewritten after completion
- Reference material for understanding the original design intent

### Keeping docs current

Documentation is part of a change, not a follow-up to it.

- A change that makes a statement in `docs/` wrong is not finished until that statement is fixed.
- A change that adds a concept someone would need explained — a new filter, a new output style, a new config option, a new component — gets it documented in the relevant doc, not only in code comments.
- A new doc gets a row in the [Documentation](#documentation) table above.
- `AGENTS.md` itself changes when a repo-wide convention or invariant does: a new build step, a new linting rule, a new architectural pattern, a new directory with rules of its own.
- Frozen plans under `docs/historical-plans/` are exempt from all of the above. They are not updated as the code moves on. If one has to be edited because it is actively misleading someone, mark the edit inline as post-implementation, dated, with who changed it and why — never a silent rewrite.

### Historical plans

The `docs/historical-plans/` directory contains frozen implementation plans. These documents:
- Capture the complete plan before implementation begins
- Are named with the implementation date as prefix (e.g., `2026-08-30-testing-implementation-plan.md`)
- May be updated during implementation to record deviations from the original plan
- Are marked inline, dated, and attributed when edited post-implementation
- Never silently rewritten after completion
- Serve as reference for understanding original design intent

Historical plans are **exempt** from the "keep docs current" requirement. They represent a point-in-time planning document, not living documentation of current system behavior.

Reach for a doc when the material is one feature deep; reach for `AGENTS.md` when it applies across the repo. Link between them rather than repeating.

---

## Commands

```bash
# First-time setup
yarn install
cp packages/tv-ui/.env.sample packages/tv-ui/.env   # Then edit .env — set STASH_ADDRESS to your Stash server

# Development
yarn dev          # Dev server with auto-rebuild; API calls go to STASH_ADDRESS
                  # (first sets up/rebuilds packages/stash-ui if its inputs changed — see docs/stash-ui-package.md)
                  # (set STASH_PROXY=true in .env to proxy Stash API through the dev server)

# Build everything
yarn build        # Outputs: packages/stash-ui/dist, packages/tv-ui/dist/app, packages/tv-plugin/dist

# Type check every package
yarn typecheck

# Storybook
yarn storybook    # Starts on port 6006
```

⚠️ `STASH_ADDRESS` must be set before running `yarn dev` or all API calls will fail. See [Environment Variables & Configuration](#environment-variables--configuration) for the full list of options.

---

## Project Structure

### Package Organization

The project uses a monorepo structure with Yarn workspaces containing three packages:

#### **1. `packages/tv-ui`** (Main Application)
- **Purpose:** The core React application for Stash TV
- **Technology:** React 17, TypeScript, Vite, Zustand (state management)
- **Key Directories:**
  - `src/components/` - Reusable React components (CrtEffect, DraggableList, channels, VideoScroller, ScenePlayer, tags, controls, etc.)
  - `src/hooks/` - Custom React hooks for data fetching, state, and UI behavior
  - `src/store/` - Zustand stores for global and TV configuration state
  - `src/pages/Feed/` - Main feed page implementation
  - `src/helpers/` - Utility functions and helpers
  - `src/constants/` - Constants, filter defaults, plugin namespace
  - `src/styles/` - Global CSS styles
  - `test/` - Test fixtures (e.g., video-cache)

#### **2. `packages/tv-plugin`** (Plugin Wrapper)
- **Purpose:** Packages the tv-ui application into a Stash plugin format
- **Technology:** Vite, static asset copy plugin
- **Responsibilities:**
  - Bundles tv-ui as a UMD library (`stash-tv.umd.js`)
  - Provides plugin injection UI into Stash's native interface: the nav bar's TV link, and a button in a scene page's queue controls opening the queue in Stash TV ([channels](docs/channels.md) § "Opening Stash's queue")
  - Handles plugin settings and configuration in Stash
  - Manages plugin initialization and setup
  - Copies source.yml metadata as plugin manifest

#### **3. `packages/stash-ui`** (Shared Stash Code)
- **Purpose:** Extracts and wraps Stash's frontend code for reuse in Stash TV. Import Stash components via its `wrappers/` — never directly from `dist/`, never copied into tv-ui. Wrappers vs patches, build scripts, and ask-first areas: [stash-ui package](docs/stash-ui-package.md)
- **Structure:** `stash/` (copy of the Stash repo), `wrappers/`, `patches/`, `dist/`, and setup/build shell `scripts/`

---

## Technology Stack

### Core Dependencies

React 17.0.2, TypeScript (ES2023), Vite 7.x, Zustand 4.x, Apollo Client 3.x, React Bootstrap 1.x, Framer Motion 6.5.1, React Spring 10.x, Radix UI (slider), Video.js (+ `videojs-offset`), FontAwesome 6.x, Logtape (structured logging), react-intl (English only — `IntlProvider` is required by reused Stash components).

⚠️ React and Apollo Client versions are pinned to match the Stash frontend.

### Build & Development Tools

Semantic Release, Commitlint, Yarn Workspaces.

---

## Architectural Patterns

### State Management

Three Zustand stores, each exposing the same typed `set` / `get` / `setToDefault` / `getDefault` API. Always mutate through these — never `useStore.setState`, which bypasses type safety and, for tvConfig, the persistence routing. 🚫 Never modify state before `tvConfigLoaded` is true. Full details (hybrid storage, adding config options): [state & config](docs/state-and-config.md)

- `tvConfig.ts` — persisted user preferences/plugin settings (hybrid Stash-config + localStorage storage)
- `globalState.ts` — transient UI state (settings panel, fullscreen, keyboard shortcuts modal, the current slide's media item, which slide's UI is auto-hidden, `tvConfigLoaded`)
- `mediaItemState.tsx` — per-slide UI state provided via context (e.g. open action-button folder, o-counter display). Feed pagination is a separate store inside `useMediaItems` (see [media loading](docs/media-loading.md))

### Key Hooks (`src/hooks/`)

`useMediaItems()` (the feed's list of item references and pagination) and `useLiveMediaItem()` (a slide's live data from the Apollo cache) — see [media loading](docs/media-loading.md), `useMediaItemFilters()` (resolves the active channel to a filter — see [channels](docs/channels.md)), `getApolloClient()` (singleton Apollo client for the Stash API), `useStashTvConfig()`, `useGamepad()`, `useViewportRotate()`, `useBrowserZoomResetOnViewportChange()`, `useResizeObserver()` (re-measure when elements resize: use it rather than hand-rolling a `ResizeObserver` effect), `useSeeking()` (seek a slide's video at a speed until stopped, with feedback: shared by gestures and the arrow keys, see [video player](docs/video-player.md) § "Gestures"), `useUiVisible()` (whether the UI is shown: read its `shown` to hide anything with the UI) and `useUiAutoHide()` (fades the UI out after mouse inactivity), see [state & config](docs/state-and-config.md) § "UI visibility & auto-hide", `useMorphTransition()` (animate a change to what's shown, each `data-morph-key` element sliding and morphing into its counterpart: used for the scene info panel's editor)

### Component Hierarchy

```
App.tsx (main entry point)
├── IntlProvider (i18n)
├── ConfigurationProvider (Stash config)
├── ErrorBoundary
├── FeedbackOverlay (transient notifications/feedback)
└── FeedPage (main feed view)
    └── VideoScroller (virtualizer for scrolling list)
        ├── ScenePlayer / MarkerPlayer (video playback)
        ├── OverflowIndicators
        ├── TagsDisplay
        ├── ActionButtonStack (customizable action buttons; their side panels are PopoverPanels)
        └── Controls (playback controls, scrubber, etc.)

Settings & UI Overlays:
├── GuideOverlay (help/tutorial)
├── EditTagsContents (tag editing interface)
├── SceneInfo (scene metadata panel, user-customisable layout)
│   ├── LineLayoutEditor (its edit mode: dragging fields about on lines)
│   └── TagPopover / PerformerPopover / StudioPopover (an entity's card and buttons, built on EntityPopover)
```

### GraphQL Integration

- **Client:** Apollo Client 3.x with subscriptions support via graphql-ws
- **Schema:** Generated TypeScript types from Stash GraphQL schema
- **Two Stash versions:** stash-ui is built from Stash's develop branch, but the plugin also supports the latest Stash release. A link adapts every operation to the connected server's schema, leaving out what it lacks; the integration suite runs against both ([Stash compatibility](docs/stash-compatibility.md))
- **Customization:** Small wrapper around Apollo to:
  - Add Stash origin detection
  - Modify request headers for dev proxy
  - Add WebSocket subscription support
  - Optimize field selection for TV format

---

## Code Organization & Conventions

### File Structure Best Practices

- **Components:** one per folder in `src/components/<Name>/` (usually `index.tsx`), styles colocated next to it
- **Styles:** plain global stylesheets applied with `classnames` (`cx(...)`) — not CSS modules; Bootstrap 4 + custom CSS
- **Look & feel:** match Stash's UI. Build UI from the same components Stash uses (react-bootstrap's `Button`, `Badge`, `Form`… or Stash's own components via `stash-ui/wrappers/`), or at least the same style (e.g. Stash's classes like `.tag-item`), rather than custom-styled lookalikes
- **Icons:** use `react-bootstrap-icons`, as the rest of the interface does. ⚠️ Some older code still uses FontAwesome; don't add new FontAwesome icons
- **Types:** all Stash API types come from `stash-ui/dist/src/core/generated-graphql`
- **Constants:** centralized in `src/constants/index.ts`

### Naming Conventions

- **Store methods:** every Zustand store exposes the same typed `set` / `get` / `setToDefault` / `getDefault` API
- **CSS classes:** component root in PascalCase (`VideoScroller`, `MediaSlide`), sub-elements and modifiers in kebab-case (`hide-controls`, `current-video`, `left-handed`)

### TypeScript Patterns

`MediaItem` is a discriminated union (`entityType: "scene" | "marker"`) — narrow it with a type predicate before accessing `entity` (example in [media loading](docs/media-loading.md)).

---

## Notable Features

- **Channels**: a user-curated, reorderable list of what the feed shows (every scene/marker or a saved Stash filter), each source with its own randomise option, plus a temporary channel that is never saved ([channels](docs/channels.md))
- **Feed of scenes/markers**, with lazy pagination and accumulation ([media loading](docs/media-loading.md))
- **Video player** built on Stash's ScenePlayer/Video.js — requires many workarounds; see [video player](docs/video-player.md) before touching playback
- **Gestures** — tap, hold and drag on the video to play/pause, skip and seek (`useGestureControls()`, sharing `useSeeking()` with the arrow keys' `useKeyboardSeeking()`); see [video player](docs/video-player.md) § "Gestures"
- **Custom media modifier functions** — user-defined JS (stored as a string, parsed via `getFunctionFromString()`) applied to the media list before display
- **Keyboard shortcuts** — ⚠️ any change that adds, removes or rebinds a shortcut must also update the help text in `KeyboardShortcutsInfo.md` (see [keyboard shortcuts](docs/keyboard-shortcuts.md))
- **New version notice** — when the app is brought back to the foreground it checks the version installed in Stash and offers to reload into it, since iOS home-screen apps otherwise keep running a cached build ([app updates](docs/app-updates.md))
- **UI auto-hide** — with a mouse, the current slide's UI and the cursor fade out after a few seconds idle and come back on any interaction, as well as hiding on the `ui-visibility` button ([state & config](docs/state-and-config.md) § "UI visibility & auto-hide")
- **Gamepad/controller support** (`useGamepad()`), **CRT TV effect** (CSS/shader-based, configurable strength), **forced landscape rotation** (`useViewportRotate()`)

---

## Reusability & Code Sharing

- Import Stash components only via `stash-ui/wrappers/` — never from `dist/` (exception: generated GraphQL types & non-component hooks/utilities), never copied into tv-ui. Wrappers vs patches and integration steps: [stash-ui package](docs/stash-ui-package.md)
- When code is needed in multiple places, refactor it into something shareable rather than copying: utilities → `helpers/`, hooks → `hooks/`, UI → `components/`

---

## Environment Variables & Configuration

### Development Configuration (`packages/tv-ui/.env`)

```
STASH_ADDRESS=http://localhost:9999        # Stash server URL
DEV_PORT=8888                              # Dev server port
DEV_HOST=0.0.0.0                          # Dev server host
DEV_ALLOWED_HOSTS=true                    # Accept connections from any host
STASH_PROXY=true                          # Proxy Stash API through dev server
STASH_PROXY_HEADERS="Authorization: ..."  # Headers for proxying
VITE_DEBUG=true                           # Enable extra debug logging
```

### Build-Time Variables

- `VITE_STASH_TV_VERSION` - Set from package.json version
- `VITE_APP_PLATFORM_URL` - Stash server address for API calls

---

## Testing & Quality Assurance

Full testing reference — tiers, commands, standards, and gotchas: [testing](docs/testing.md). Read it before writing or modifying any test.

- Tests that verify documented behavior should cite the relevant doc with `@see docs/<file>.md § "<heading>"` so the requirement and the explanation stay aligned. And if it's not mentioned in the docs but seems valuable to mention you should take
  that as a signal that the docs should be updated to cover that.

### Current Status

- **Linting:** No ESLint configuration present (not enforced)
- **Testing:** Vitest suites in `packages/tv-ui` (unit + integration, jsdom), `packages/mock-stash` (meta + Docker conformance), and `packages/repo` (docs validation). Run everything with `yarn test` at the root.
- **Type Checking:** `yarn typecheck` from the repo root checks every package (a bare `tsc` covers only one tsconfig). Running tests doesn't typecheck them (no pre-commit hook; vitest strips types). See [testing](docs/testing.md) § "Gotchas".

---

## Deployment & Release

Conventional Commits (Commitlint-enforced); Semantic Release automates versioning on merge to `main` and deploys the built plugin to the `secondfolder/stash-plugins` repo. Release rules and flow: [release process](docs/release-process.md)

---

## Important Notes & Gotchas

### 1. Stash Compatibility

⚠️ **React 17 is required** - Matched with Stash frontend. Do not upgrade to React 18+ without updating Stash compatibility.

⚠️ **Apollo Client version matters** - Stash uses specific version. Upgrading may break GraphQL functionality.

### 2. Environment Setup

⚠️ **STASH_ADDRESS must be set before running dev server.** Without it, API calls will fail.

### 3. Plugin Initialization

⚠️ **Plugin runs in Stash's iframe context.** Access to Stash APIs via `window.PluginApi`. Some browser features may be restricted.

⚠️ **`packages/tv-plugin/main.tsx` runs in every Stash page, so import only side-effect-free modules from tv-ui** (e.g. `src/constants`, types). Everything it imports is bundled into the plugin. Importing the tvConfig store once pulled in the store, Apollo and a second copy of Stash's `StashService`, and started them up inside Stash's own UI. Use `PluginApi` for Stash's client and components. A tv-plugin test fails if the store or `StashService` gets loaded.

⚠️ **A `PluginApi.patch.instead` must return a single element, never an array** — wrap several in a Fragment (its type in `packages/tv-ui/types/stashPlugin.d.ts` rules arrays out). Stash hands the result to `after` patches as `args.concat(result)`, which spreads an array, so another plugin's after patch reading its last argument gets only the last element (role-tagger's on `ScenePage` dropped the whole scene page this way).

### 4. Type Imports

⚠️ **Always import types from `stash-ui/dist/src/core/generated-graphql` for Stash API types.** Do not redefine or copy types.

### 5. Module Resolution

TypeScript configured to use `moduleResolution: bundler`. Paths like `stash-ui/dist/src/...` work because of workspace setup.

### 6. Version at Build Time

The plugin version is injected at build time via `VITE_STASH_TV_VERSION` environment variable. Always ensure `package.json` version is correct before building.

---

## Common Development Tasks

### Adding a New Component

1. Create in appropriate subdirectory under `src/components/` (one component per folder, styles colocated)
2. Export from the component file
3. Add to Storybook if reusable
4. Update `AGENTS.md` and the relevant topic doc if the change affects anything documented — see [Maintaining This File](#maintaining-this-file)

---

## Performance

Where the perf-critical work lives:

- `VideoScroller` — virtualizes the feed with `@tanstack/react-virtual`; only visible slides render
- `useMediaItems` — on-demand pagination; slides read data with `useLiveMediaItem` (`useFragment`), so a cache update re-renders only the affected slide
- `useOverflowIndicators` — memoized text overflow detection
- Swipe gestures via `@use-gesture/react` (optimized for touch); resize/scroll handlers are throttled/debounced
- ⚠️ Every rendered slide has its own `CrtEffect`, so its per-frame animations (canvas noise, the glitch filter) run only while the effect is on or transitioning. They used to run with the effect off, repainting on every slide every frame

---

## Resources & References

- **Stash Main Repo:** https://github.com/stashapp/stash
- **Stash Forum:** https://discourse.stashapp.cc
- **Stash Reels (predecessor):** https://github.com/Valkyr-JS/StashReels
- **GraphQL Schema:** Generated and distributed with Stash
- **Plugin System Docs:** See Stash plugin documentation in main repo

---

## Summary of Key Principles

✅ **Always:**
- Prioritize code maintainability and clarity
- Refactor shared code instead of copying
- Use type-safe patterns (TypeScript, discriminated unions)
- Keep state mutations through typed setter methods
- Reuse Stash components via wrappers
- Write conventional commit messages
- Run `yarn build` locally before pushing to main
- Update `AGENTS.md` and the `docs/` topic docs when you learn something new, spot an inconsistency, or change something documented

⚠️ **Ask first:**
- Upgrading dependencies — especially React (must stay on 17) or Apollo Client (Stash compatibility)
- Changing release/versioning setup (`release.config.js`, versions in `package.json` / `source.yml` — releases are automated on merge to `main`)
- Modifying `packages/stash-ui/patches/` or re-running its extraction/build scripts
- Changing which config keys persist to localStorage vs Stash config (affects users' saved settings)
- Touching Apollo client cache policies (see [media loading](docs/media-loading.md) — history of race conditions)

🚫 **Never:**
- Copy code from Stash into tv-ui — reuse via wrappers
- Commit secrets or `.env` files
- Modify global state before `tvConfigLoaded` is true
- Add unreplaced `process.env` variables (the plugin build fails on them)
- Redefine Stash GraphQL types — import from `stash-ui/dist/src/core/generated-graphql`
- Move media pagination into Apollo cache merging

---

## Changes Checklist (Documentation & Tests)

- [ ] Documentation changes are in step with the code change, and incorrect statements in `docs/` were fixed.
- [ ] New concepts that readers would need explained are documented in the relevant doc, not only commented in code.
- [ ] Any new doc has a row in the Documentation table in this file.
- [ ] If a repo-wide convention or invariant changed, `AGENTS.md` reflects that change.
- [ ] Any plans you implemented placed under under `docs/historical-plans/`.
- [ ] Tests that verify documented behavior cite the relevant doc with `@see docs/<file>.md § "<heading>"`.
