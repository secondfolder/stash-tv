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
| [Media loading](docs/media-loading.md)   | Touching `useMediaItems`, filters, pagination, the accumulator store, or feed data loading                 |
| [Video player](docs/video-player.md)     | Touching playback, player DOM, or workarounds for Stash ScenePlayer/Video.js quirks                       |
| [stash-ui package](docs/stash-ui-package.md) | Integrating or modifying Stash frontend components, understanding wrappers vs patches                  |
| [State & config](docs/state-and-config.md) | Touching state, adding a config option, or changing how settings persist (Zustand stores, hybrid storage) |
| [Action buttons](docs/action-buttons.md) | Adding an action button or touching `src/components/action-buttons/` (schemas, config, folders)           |
| [Release process](docs/release-process.md) | Writing commits, preparing releases, or understanding versioning/deployment flow                          |

Adding a new doc means adding its row to this table. A test validates that every doc in `docs/` is listed here and every link points to a real file — a doc without a row is caught rather than going unnoticed.

### Keeping docs current

Documentation is part of a change, not a follow-up to it.

- A change that makes a statement in `docs/` wrong is not finished until that statement is fixed.
- A change that adds a concept someone would need explained — a new filter, a new output style, a new config option, a new component — gets it documented in the relevant doc, not only in code comments.
- A new doc gets a row in the [Documentation](#documentation) table above.
- `AGENTS.md` itself changes when a repo-wide convention or invariant does: a new build step, a new linting rule, a new architectural pattern, a new directory with rules of its own.
- Frozen plans under `docs/historical-plans/` are exempt from all of the above. They are not updated as the code moves on. If one has to be edited because it is actively misleading someone, mark the edit inline as post-implementation, dated, with who changed it and why — never a silent rewrite.

Reach for a doc when the material is one feature deep; reach for `AGENTS.md` when it applies across the repo. Link between them rather than repeating.

---

## Commands

```bash
# First-time setup
yarn install
yarn --cwd packages/stash-ui setup                  # Extract Stash frontend code (required before dev/build)
cp packages/tv-ui/.env.sample packages/tv-ui/.env   # Then edit .env — set STASH_ADDRESS to your Stash server

# Development
yarn dev          # Dev server with auto-rebuild; API calls go to STASH_ADDRESS
                  # (set STASH_PROXY=true in .env to proxy Stash API through the dev server)

# Build everything
yarn build        # Outputs: packages/stash-ui/dist, packages/tv-ui/dist/app, packages/tv-plugin/dist

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
  - `src/components/` - Reusable React components (CrtEffect, DraggableList, VideoScroller, ScenePlayer, tags, controls, etc.)
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
  - Provides plugin injection UI into Stash's native interface
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
- `globalState.ts` — transient UI state (settings panel, fullscreen, `tvConfigLoaded`)
- `mediaItemState.tsx` — media pagination/accumulation (see [media loading](docs/media-loading.md))

### Key Hooks (`src/hooks/`)

`useMediaItems()` (pagination/accumulation — see [media loading](docs/media-loading.md)), `useMediaItemFilters()` (saved filter selection), `getApolloClient()` (singleton Apollo client for the Stash API), `useStashTvConfig()`, `useGamepad()`, `useViewportRotate()`, `useBrowserZoomResetOnViewportChange()`

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
        ├── ActionButtonStack (customizable action buttons)
        └── Controls (playback controls, scrubber, etc.)

Settings & UI Overlays:
├── GuideOverlay (help/tutorial)
├── EditTagsContents (tag editing interface)
├── SceneInfoPanel (scene metadata display)
```

### GraphQL Integration

- **Client:** Apollo Client 3.x with subscriptions support via graphql-ws
- **Schema:** Generated TypeScript types from Stash GraphQL schema
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
- **Types:** all Stash API types come from `stash-ui/dist/src/core/generated-graphql`
- **Constants:** centralized in `src/constants/index.ts`

### Naming Conventions

- **Store methods:** every Zustand store exposes the same typed `set` / `get` / `setToDefault` / `getDefault` API
- **CSS classes:** component root in PascalCase (`VideoScroller`, `MediaSlide`), sub-elements and modifiers in kebab-case (`hide-controls`, `current-video`, `left-handed`)

### TypeScript Patterns

`MediaItem` is a discriminated union (`entityType: "scene" | "marker"`) — narrow it with a type predicate before accessing `entity` (example in [media loading](docs/media-loading.md)).

---

## Notable Features

- **Feed of scenes/markers via saved Stash filters**, with lazy pagination and accumulation ([media loading](docs/media-loading.md))
- **Video player** built on Stash's ScenePlayer/Video.js — requires many workarounds; see [video player](docs/video-player.md) before touching playback
- **Custom media modifier functions** — user-defined JS (stored as a string, parsed via `getFunctionFromString()`) applied to the media list before display
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

- Tests that verify documented behavior should cite the relevant doc with `@see docs/<file>.md § "<heading>"` so the requirement and the explanation stay aligned.

### Current Status

- **Linting:** No ESLint configuration present (not enforced)
- **Testing:** No automated test suite currently configured
- **Type Checking:** TypeScript provides compile-time checking

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
- `useMediaItems` — on-demand pagination via the accumulator store
- `useOverflowIndicators` — memoized text overflow detection
- Swipe gestures via `@use-gesture/react` (optimized for touch); resize/scroll handlers are throttled/debounced

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
