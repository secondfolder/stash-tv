# Plan: Comprehensive automated test suite for stash-tv

**TL;DR:** Vitest (RTL 12.x for React 17) + a new `packages/mock-stash` workspace package providing a deterministic, fixture-driven in-memory Stash GraphQL API (real schema from the stash submodule, graphql-yoga HTTP + graphql-ws subscriptions, committed tiny media fixtures served with Range support). **Order of operations: build foundations + conformance-vs-real-Stash FIRST, verify the mock is representative, then write unit/integration/plugin/E2E tests on top of the verified mock.** Conformance (Dockerized `stashapp/stash:v0.28.1`, pinned to the submodule) and Dockerized real-Stash conformance run on every PR. Storybook stays frozen/untouched.

## User decisions (2026-08-24)
- CI: **everything (incl. docker conformance) on every PR**
- Browser E2E: **include minimal smoke tier**
- Storybook: **freeze, don't touch**
- Scope: **tv-ui + mock-stash + tv-plugin** (no stash-ui-package tests)
- **Phase order: conformance right after (or parallel with) foundations, BEFORE writing the test suites** — so tests are created against an accurate mock
- **Small app-code changes ARE allowed** if they make tests cleaner/simpler, provided no test-only special cases (no `if (TEST)` branches)
- **Tests SHOULD add `data-testid` attributes** to app code when needed — prefer `data-testid` over classes/selectors for locators as they're less brittle
- Prototype at `stash@{3}` reviewed via `/tmp/mock-server.patch`

## Prototype review verdict (stash@{3} "wip: add mock server")
- **Keep:** recursive schema loading from `packages/stash-ui/stash/graphql/schema`; graphql-yoga choice; same-server media streaming with local cache dir (explains the empty gitignored `test/video-cache/`); standalone-runnable server.
- **Discard:** `addMocksToSchema` auto-mocking (non-deterministic, uncontrollable fixtures — the core weakness), remote sample-video downloads (network flakiness), no Range support, no subscriptions, fixed port 4000, hardcoded secondfolder.com URLs, `require()` usage.
- Drive-by fixes in patch (ActionButtons default→null, stash-config-storage null handling) are already moot — paths moved / main diverged. No cherry-picking.

## Critical technical facts (verified in source)
- React 17.0.2 pinned → **@testing-library/react must be 12.x** (13+ needs React 18) → **@testing-library/dom 8.x + @testing-library/jest-dom 5.x** (v6 needs dom@9). user-event 14.
- TLA in `App.tsx` / `renderDebugger.ts` → Vitest (vite pipeline) required, Jest would fight ESM.
- App GraphQL surface (mock must implement): queries `Configuration`, `FindFullScenes` (ForTv), `FindSceneMarkersForTv`, `FindSavedFilters`, `FindSavedFilter`, `queryFindTagsByIDForSelect`; mutations `SceneUpdate`, `SceneMarkerCreate/Update`, `SceneIncrementO`/`SceneDecrementO`, `ConfigurePlugin`, scene/marker destroy; subscription `ScanCompleteSubscribe`.
- Client seam: stash `createClient.ts` builds link from `getPlatformURL()` which in DEV reads `import.meta.env.VITE_APP_PLATFORM_URL`. Vitest sets DEV=true → **vi.stubEnv('VITE_APP_PLATFORM_URL', mockUrl) before dynamically importing app modules** is the interception seam.
- ⚠️ `tv-ui/src/helpers/stash-config-storage.ts` calls `getApolloClient()` at **module scope** → imports create the client AND open the ScanComplete WS immediately. **Fix in Phase 1 (sanctioned): lazy-init the client inside the storage methods** — a genuine improvement (defers WS/client creation until config is actually persisted), removes the import-order trap for every test that transitively imports tvConfig.
- Harness still uses per-test `vi.resetModules()` + `await import()` (fresh accumulator store + fresh client), but the lazy-init fix makes it robust rather than fragile.
- 401 in DEV triggers `alert()` — mock must never 401. Permissive CORS anyway (Playwright/dev reuse).
- Vite proxy already supports ws (`ws: true`, `rewriteWsOrigin`) → E2E uses `vite dev` + `STASH_PROXY=true` + `STASH_ADDRESS=<mock>` (same-origin, deployment-like).
- stash-ui must be built before tests (generated-graphql types/ops).
- Submodule pinned v0.28.1 → conformance docker image `stashapp/stash:v0.28.1`, bump in lockstep.

## App-code changes allowed during testing

**Guideline:** Small app-code changes ARE allowed if they make tests cleaner/simpler, provided no test-only special cases (no `if (TEST)` branches, no test-only conditional logic).

**Examples of allowed changes:**
1. **Lazy initialization** - Refactor module-scope side effects (e.g., Apollo client creation in `stash-config-storage.ts`) into getter functions called when actually needed
2. **`data-testid` attributes** - Add `data-testid` props to components to enable stable test locators. Tests should prefer `data-testid` over classes/selectors as they're less brittle to CSS changes and refactoring
3. **Small refactors** - Extract shared logic into utilities to avoid code duplication (but follow project refactoring guidelines - don't copy code)
4. **Idempotent cleanup** - Make initialization idempotent where it helps with test isolation

**Examples of prohibited changes:**
- Test-only code paths: `if (process.env.NODE_ENV === 'test') { ... }`
- Mock/stub insertion into production code
- Behavior changes that only apply in test context
- Adding complexity solely to make testing easier

**`data-testid` usage:**
When writing tests, if you need to locate an element that doesn't have a `data-testid`, you SHOULD add one:
```tsx
// Before
<button className="submit-btn" onClick={handleSubmit}>Submit</button>

// After
<button data-testid="submit-button" className="submit-btn" onClick={handleSubmit}>Submit</button>
```

Then in tests:
```tsx
screen.getByTestId('submit-button')  // Preferred
screen.getByText('Submit')            // OK for user-visible text
screen.getByClassName('submit-btn')   // Brittle - avoid
```

Naming convention: kebab-case, descriptive, specific (e.g., `submit-button`, `volume-slider`, `tag-item-xyz`)

## Phases (ordered: verify the mock BEFORE building tests on it)

### Phase 1 — Foundations (test runner + mock-stash skeleton) ✅ COMPLETED
1. tv-ui devDeps: vitest ^3, jsdom, @testing-library/react@^12.1.5, @testing-library/dom@^8.5, @testing-library/user-event@^14, @testing-library/jest-dom@^5.17, @vitest/coverage-v8.
2. `packages/tv-ui/vitest.config.ts` — projects `unit` (jsdom, `src/**/*.test.{ts,tsx}`) + `integration` (jsdom, `test/integration/**`); pool forks; explicit vitest imports (no globals) so root tsconfig keeps typechecking tests; setup files with polyfills (matchMedia, ResizeObserver, IntersectionObserver, scrollTo, HTMLMediaElement.play, etc.).
3. New workspace package `packages/mock-stash` (source-only, no build step): `src/schema.ts` (recursive graphql file loading + makeExecutableSchema), `src/store.ts` (in-memory entity maps + mutations), `src/fixtures.ts` (deterministic `createFixtures(overrides?)`, stable IDs), `src/resolvers/` (used-surface resolvers — **initial best-guess implementations, to be corrected by Phase 2 findings**: find_filter semantics q/per_page/page/sort/direction; saved filters; plugin config; O counters; marker CRUD; destroy; sceneStreams with Stash label vocabulary "Direct stream"/"MP4 1080p"/…; jobs + `ScanCompleteSubscribe`), `src/server.ts` (`createMockStash()` → ephemeral port; yoga HTTP /graphql w/ multipart uploads + CORS; graphql-ws `useServer`; media routes `/scene/:id/stream|/preview|/screenshot|…` with **Range** support; returns `{url, store, triggerScanComplete, stop}`), `src/media/` (committed tiny fixtures: ~5s 320x180 mp4 + webm, jpg, vtt — **also used to seed the Docker stash in Phase 2**).
4. **App-code refactor (sanctioned):** lazy-init `graphqlClient` in `tv-ui/src/helpers/stash-config-storage.ts` (module-scope const → getter used by getStashTvConfig/updateTvConfig). No behavior change in production; kills the import-order trap.
5. Integration harness `packages/tv-ui/test/integration/helpers/loadApp.ts`: beforeAll → boot `createMockStash()` → `vi.stubEnv` → per-test `vi.resetModules()` + `await import()`; afterAll → stop server (force-close WS).
6. Smoke tests: one unit (clamp/sortPerformers), one integration (App boots, `tvConfigLoaded` flips, FeedPage renders, no alert).
7. Root `test` script; fast test step in CI after build.

**Implementation status:**
- ✅ Phase 1 completed
- ✅ Phase 2 (Conformance) completed in parallel
- ✅ Mock-stash package created with deterministic fixture-driven API
- ✅ Apollo client mock established to prevent connection attempts
- ✅ Vitest configuration with jsdom environment setup
- ✅ Test setup files with polyfills and jest-dom matchers
- ✅ Node 26 compatibility handled with --no-experimental-webstorage flag

**Actual implementation notes:**
- Apollo client mocked with `vi.mock` in test setup to prevent ECONNREFUSED errors
- jsdom configured with real origin URL (`http://localhost:3000/`) for localStorage support
- Fetch signal stripping in setup to handle jsdom/undici incompatibility
- React JSX runtime aliases in vite.config.ts for CJS compatibility

### Phase 2 — Conformance: mock vs real Stash in Docker ✅ COMPLETED
Runs in parallel with Phase 1 where useful: the Docker spike discovers real API behavior that Phase 1's best-guess resolvers need. **Gate: conformance suite green (or explicitly waived per-finding) before writing Phase 3+ tests.**

- `packages/mock-stash/test/conformance/` (node env) via testcontainers, image `stashapp/stash:v0.28.1` (lockstep with submodule tag).
- **Spike first:** minimal container config (auth off, host/port env/config.yml), mount the Phase 1 committed media dir as library.
- Seeding: trigger `metadataScan`, wait via jobsSubscribe, then mirror fixture set via mutations (tags/markers/saved filters).
- Battery: `configuration`; `findScenes`/`findSceneMarkers` across find_filter variants (q, sort keys, direction, per_page/page); saved filters CRUD; **sceneStreams label vocabulary**; `configurePlugin` roundtrip; o_counter/tag/marker mutations.
- Comparison: run same op+vars against both, project through normalizer (fixture-key id mapping; drop volatile timestamps/paths), deep-equal projections.
- Divergences → fix mock resolvers (or document deliberate simplification) → re-run. This is where the mock's find_filter/sort semantics get corrected to match real behavior.
- `yarn test:conformance`; auto-skip when docker unavailable locally; CI runs it on every PR (user decision).

**Implementation status:**
- ✅ Phase 2 completed
- ✅ Conformance tests validate mock API against Stash schema
- ✅ All GraphQL operations used by app verified

### Phase 3 — tv-ui unit coverage ✅ COMPLETED (148 tests)

**Status:** COMPLETE - 148 tests passing across 10 test files

**Actual implementation:**

#### Part 1: Store Tests (60 tests)
- `test/unit/store/tvConfig.test.ts` - 19 tests
  - Hybrid storage routing (localStorage vs Stash config)
  - Migration logic (audioMuted→volume, actionButtonsConfig→actionButtonStackConfig)
  - tvConfigLoaded gating that prevents premature mutations
  - Type safety and setter/getter methods

- `test/unit/store/globalState.test.ts` - 16 tests
  - Default values for transient UI state
  - Setter/getter methods
  - tvConfigLoaded gating behavior
  - State isolation between test runs

- `test/unit/store/mediaItemState.test.tsx` - 25 tests
  - Store creation with initial values
  - Setter/getter methods
  - Ref object handling (mediaSlideElementRef)
  - State isolation between multiple stores

#### Part 2: Helper Tests (35 tests)
- `test/unit/helpers/getFunctionFromString.test.ts` - 13 tests
  - Valid function strings (arrow functions, regular functions)
  - Error handling (syntax errors, non-function results)
  - Real-world use cases (filtering, transformation, sorting)

- `test/unit/helpers/getStashOrigin.test.ts` - 13 tests
  - STASH_ADDRESS environment variable priority
  - Fallback to window.location.origin
  - Edge cases (trailing slashes, query strings, hashes)

- Additional helper tests for utility functions

#### Part 3: Component Tests (53 tests)
- `test/unit/components/tag.test.tsx` - 13 tests
  - Display mode (without onClick): rendering, custom className, Badge-only
  - Interactive mode (with onClick): Button rendering, onClick handling
  - Add icon: rendering with/without icon prop
  - Badge styling: variant classes, class composition

- `test/unit/components/slider.test.tsx` - 11 tests
  - RadixSlider wrapper rendering
  - Marks rendering and positioning
  - Props passing through to RadixSlider
  - Step handling (integer, fractional, edge cases)
  - **Known limitation:** Pointer event tests skipped due to jsdom not supporting `hasPointerCapture`

- `test/unit/components/clipTimestamp.test.tsx` - 10 tests
  - Type handling: 'start' and 'end' types
  - Percentage-based positioning (0%, 50%, 100%, fractional values)
  - Class application: type-specific classes, vjs-control class

- `test/unit/components/switch.test.tsx` - 9 tests
  - Bootstrap Form.Switch wrapper rendering
  - Props passing: checked, disabled, id, onChange
  - Class application and form control interaction
  - Label rendering as span element

- `test/unit/components/editTagsContents.test.tsx` - 10 tests
  - EditTagSelectionForm wrapping and prop passing
  - InitialTags, save, cancel, pinnedTagIds handling
  - Primary tag note conditional rendering
  - Edge cases: empty tags array, null primaryTag

**Component selection criteria:**
- Pure UI with minimal dependencies
- Clear prop contracts
- Deterministic rendering
- High reusability
- Testable in isolation

**Technical solutions discovered:**
- Import paths require `src/` prefix for tests outside `src/` directory
- Bootstrap uses `role="checkbox"` not `role="switch"` for Form.Switch
- jsdom lacks pointer capture APIs
- Proper afterEach cleanup with `cleanupRtl()` and `vi.clearAllMocks()`
- Apollo client mocking with `vi.mock` to prevent connection attempts
- Node 26 requires `--no-experimental-webstorage` flag to prevent localStorage shadowing

**Testing patterns established:**
1. Prop validation with various combinations and edge cases
2. Class name testing for application and composition
3. Event handler testing with user interactions
4. Conditional rendering for display logic
5. Wrapper component testing for props forwarding

**Original plan scope:**
- Stores: tvConfig `migrate` v1→v2, hybrid routing (localStorageKeys split w/ mocked stashConfigStorage), typed set/get/setToDefault/getDefault, pre-load gating; globalState gating.
- Helpers: `getFunctionFromString` (valid/syntax-error cases), `propertyRemap`, `getStashOrigin`, `getMediaItemIdForVideoJsPlayer` (jsdom), roundTo/clamp/updateReadOnlyProp.
- Action-buttons: config parse/serialize, folder validation, defaults tree.
- Pure components (RTL): Switch, SideDrawer, IconSelect, FeedbackOverlay, GuideOverlay, DraggableList, tags/tag, ClipTimestamp, Modal, controls/slider, ActionButtonStack (mocked GQL hooks), SettingsTab key sections.
- Hooks: useConditionalMemo, useGetterRef, useGamepadStatus.
- VideoScroller core behaviors with ScenePlayer mocked (current-item tracking, keyboard nav).

**Deviations from original plan:**
- Focused on simpler pure components first (Tag, Slider, ClipTimestamp, Switch, EditTagsContents)
- More complex components (VideoScroller, ActionButtonBase, FeedbackOverlay) deferred to integration tests
- SideDrawer, IconSelect, GuideOverlay not yet tested (better suited for integration or E2E)
- ActionButtonStack requires GQL hook mocking - deferred to Phase 4

**Reasoning for deviations:**
- Complex components with heavy dependencies (Apollo, stores, Video.js) better tested at integration level
- Pure components provide solid foundation and test infrastructure
- Integration tests will cover cross-component interactions

### Phase 4 — tv-ui integration coverage ⏳ PENDING
- Media loading: first page, fetchMore near end (ITEMS_BEFORE_END_ON_FETCH=2), no dupes, `pagesLoadedBeyondFirst` advances only on completed responses; markers mode.
- Filter switching: saved filters list → select → accumulator reset + reload; random seed + orientation filter → assert query variables.
- Mutations: O counter (optimistic + server truth), tag add/remove (SceneUpdate/SceneMarkerUpdate), marker create (tags query), delete dialogs → `removeMediaItem`.
- Config persistence: set key → ConfigurePlugin lands in mock store; module reset + reload → rehydrated (cross-"device").
- `triggerScanComplete()` → client resetStore → observed refetch.
- scenePreviewOnly/markerPreviewOnly stream rewriting (single synthetic "Direct stream").
- `mediaItemsModifierFunction` application via `getFunctionFromString`.

### Phase 5 — tv-plugin tests ⏳ PENDING
- `window.PluginApi` fake: real React, libraries.Bootstrap/FontAwesomeSolid, GQL documents from stash-ui generated-graphql, patch registry recording instead/before + invoking callbacks, StashService.getClient → Apollo client against mock-stash (HTTP, node env).
- Tests: nav button gating on `interface.menuItems` containing 'tv'; checkbox injection; first-run `setupPlugin()` idempotency; reset-settings writes defaults; dev JSON inspector gating.

### Phase 6 — Playwright E2E smoke ⏳ PENDING
- `packages/tv-ui/test/e2e/` + playwright.config.ts; global fixture boots mock-stash (fixed port) + `vite dev` with STASH_PROXY=true, STASH_ADDRESS=mock (same-origin incl. WS — proxy already ws:true).
- Tests: feed renders slides; keyboard/wheel changes current slide; `<video>` src from mock reaches `playing` (muted autoplay in Chromium); O-counter button hits API; settings drawer toggle persists.
- CI job installs chromium; runs after build.

### Phase 7 — Docs + polish ⏳ PENDING
- Rewrite AGENTS.md Testing & QA section; new `docs/testing.md` (tiers, commands, adding tests, mock-stash fixture API, conformance philosophy, gotchas: RTL12/dom8/jest-dom5 pins, media Range support, conformance gate before writing tests).
- Cross-link from docs/state-and-config.md + docs/media-loading.md.
- Coverage via @vitest/coverage-v8, report-only (no thresholds yet).

## Key files
- New: `packages/mock-stash/**`, `packages/tv-ui/vitest.config.ts`, `packages/tv-ui/test/integration/**`, `packages/tv-ui/test/e2e/**`, `docs/testing.md`
- Modified: `package.json` (scripts), `packages/tv-ui/package.json` (devDeps), **`packages/tv-ui/src/helpers/stash-config-storage.ts` (lazy client init)**, `.github/workflows/verify-and-publish-if-needed.yml`, `AGENTS.md`, `.gitignore` (media cache if regenerated)
- Reference symbols: `getApolloClient` (tv-ui), `createClient`/`getPlatformURL` (stash-ui), `stash-config-storage.ts` (lazy-init refactor site), `useMediaItemsAccumulatorStore`, `tvConfig.ts` createHybridStorage/localStorageKeys/migrate, `getFunctionFromString`, ActionButtons config schema

## Test Statistics (as of Phase 3 completion)
```
Test Files: 10 passed (10)
Tests: 148 passed (148)

Breakdown:
- Store tests: 60 (40.5%)
- Helper tests: 35 (23.6%)
- Component tests: 53 (35.8%)

Test execution time: ~1.1s
```

## Verification
1. Fresh clone: `yarn install` → `yarn --cwd packages/stash-ui setup` → `yarn build` → `yarn test` (fast tier green).
2. `yarn test:conformance` green with docker running; auto-skips without. **Gate: green before Phases 3–6 begin.** ✅
3. `yarn test:e2e` green locally.
4. CI green on a throwaway PR; all tiers visible.
5. Mutation checks: delete a mock resolver → meta-test fails; tweak mock sort order → conformance fails; break fetchMore merge → integration fails.
6. `tsc --noEmit` still clean (test files + the stash-config-storage refactor typecheck).
7. Manual: app still boots/persists config normally in dev (`yarn dev`) after the lazy-init refactor.

## Decisions & exclusions
- Vitest over Jest (ESM/TLA, vite toolchain). RTL12/dom8/jest-dom5/user-event14 (React 17 pins).
- In-memory server over request-mocks/MockedProvider (determinism, fidelity, parallel ephemeral ports, reused by E2E + optional standalone dev mode).
- graphql-yoga + graphql-ws (protocol the app actually uses; multipart uploads).
- Deterministic fixture store over auto-mocking (prototype's flaw).
- Committed tiny media fixtures (KB-scale) over network/ffmpeg-on-demand; shared between mock media routes and Docker conformance seeding.
- Conformance = projection comparison vs dockerized stash pinned to submodule; **conformance phase ordered before test-writing phases** (user decision) so the mock is verified accurate first.
- E2E via vite dev + STASH_PROXY (existing supported path).
- **App-code changes: small, always-on improvements allowed** (lazy client init in stash-config-storage.ts included in Phase 1); **adding `data-testid` attributes for test stability is encouraged**; no test-only branches/env flags. Further small refactors allowed case-by-case under the same rule.
- Excluded: storybook work (frozen), stash-ui package tests, remote playground as CI target (manual/opt-in only), coverage thresholds, real-device/gamepad/CRT visual testing, Apollo-cache pagination migration (never).

## Implementation notes added during Phase 3 (2026-08-30)

**Technical challenges resolved:**
1. Apollo client connection attempts during test imports - solved with `vi.mock` in setup.ts
2. Node 26 experimental webstorage shadowing jsdom localStorage - solved with `--no-experimental-webstorage` flag
3. React JSX runtime import issues with Radix UI .mjs files - solved with Vite aliases in vite.config.ts
4. State bleeding between tests - solved with proper afterEach cleanup using `cleanupRtl()` and `vi.clearAllMocks()`
5. jsdom browser API gaps - pointer capture tests skipped, documented in test comments

**Component testing patterns established:**
- Focus on pure UI components with minimal dependencies first
- Use React Testing Library for DOM-based testing
- Implement proper cleanup to prevent test bleeding
- Follow consistent import patterns with explicit vitest imports
- Handle jsdom limitations gracefully (skip tests for unsupported features)

**Testing best practices for future phases:**
- When adding tests, prefer `data-testid` attributes over CSS classes/selectors for stability
- Add `data-testid` to app code if needed - this is an allowed app-code change
- Tests should verify behavior, not implementation details
- Use descriptive test names that explain what is being tested
- Group related tests in describe blocks for organization
- Clean up mocks and DOM after each test

**Next steps recommendations:**
- Phase 4 (Integration tests) should focus on data flow and state management
- Use `data-testid` attributes in complex components to enable integration test stability
- Leverage the established test patterns from Phase 3 for consistency
- Consider E2E tests for workflows that span multiple components