# mock-stash Tests

**Read this when:** changing mock-stash (`packages/mock-stash`, the mock Stash server the integration and E2E tests run against), its fixtures, or its tests, or the tests of the plugin in a real Stash. The tiers, standards and where files go are in [testing](testing.md); which Stash versions it serves is in [Stash compatibility](stash-compatibility.md).

mock-stash serves Stash's own GraphQL schema, with resolvers of its own over an in-memory store of fixtures. The app's tests are only as right as it is, so it has two suites of its own:

- **Meta tests** (`test/meta.test.ts`, `yarn --cwd packages/mock-stash test`): how the mock itself behaves (its store, tenants, request log), fast and with no Docker.
- **Conformance tests** (`test/conformance/`, `yarn test:conformance`): each runs the same operation against the mock and against a real Stash (started in Docker, seeded with the same media files and scanned), and compares the responses, with volatile fields like ids and timestamps normalised away. They run once per tested Stash version, against the real Stash of that version (`conformance-stash-<version>` projects, from `vitest.conformance.config.ts`), and in CI. If they fail after a Stash upgrade, the mock's resolvers have drifted from Stash's and need updating.

mock-stash serves any tested Stash version's schema (`startMockStash({ stashVersion })`, or `MOCK_STASH_VERSION` for the test projects and the E2E server, read by `stashVersionFromEnv()`), and reports that version from its `version` query. Its resolvers are written for develop: one a release lacks the field for is ignored there. Which versions are tested: [Stash compatibility](stash-compatibility.md).

**A real Stash** for tests comes from `startRealStash(version, { plugins })` in `src/real-stash.ts`: it starts that version's image (from `stash-versions.json`) with the media fixtures, runs setup and a scan, and can install plugins. Import it as `mock-stash/src/real-stash`, not from the package's entry, which the app's tests import too, so they don't load testcontainers. Tests needing one call `canRunRealStash()` first: without Docker they skip themselves, unless `REQUIRE_DOCKER` is set (as in CI), when they fail rather than pass by skipping.

## The plugin in a real Stash

`packages/tv-plugin/test/real-stash/` tests the built plugin installed in a real Stash of each tested version (`yarn test:real-stash`, after `yarn build`), with Playwright: one project per version (`stash-<version>`, from `playwright.config.ts`), whose worker starts that Stash with `dist/` as the plugin. They check what the plugin does in Stash's own UI (`main.tsx`), which Stash's own React renders and which depends on Stash's components and pages: the nav bar link (added the first time the plugin loads), the TV menu item setting, the plugin's settings, opening a scene list or a scene's queue in Stash TV, and the app it serves playing a scene. The tests share their Stash and run in order. The fixture fails a test on any page error, console error or failed request, other than a short list of expected ones (`fixtures.ts`).

- ⚠️ A new Stash shows its release notes over every page until they're seen. The fixture marks them seen (the `lastNoteSeen` UI setting) before the tests.
- ⚠️ Stash leaves a sort's default direction (ascending, for most; descending for a date) out of a list's URL, and so out of the links the plugin makes from it. Test with the other direction to see it passed on.
- ⚠️ The app's first-run guide covers it until closed. Close it as a user would, which is also the click a browser wants before playing media.
- ⚠️ Stash's settings switches aren't labelled: each has an id from its group and item (e.g. `#menu-items-tv`), beside a heading.
- These tests found the plugin not running at all once tv-plugin became an ES module package (its bundle's file name changed from the `stash-tv.umd.js` that `source.yml` loads), and the nav bar link only appearing after a reload. Both are fixed: `vite.config.ts` names the bundle itself, and the plugin evicts Stash's cached configuration after changing it.

## Fixtures

Fixture scenes have no captions; set `captions` on a scene record to give it some. Each scene's `_thumbs.vtt` has a cue for every second, showing its screenshot, so the progress bar's thumbnail preview shows as it does with Stash's sprites. Fixture tags, performers and studios have no images of their own: like Stash, mock-stash marks their `image_path` as its stand-in (`default=true`) unless the record has `has_image`. Filtering scenes by studio includes sub-studios' scenes, and leaves out scenes without a studio.

## Gotchas

⚠️ **The mock server is only as realistic as its resolvers.** Some queries the app makes are stubbed to return nothing (e.g. `sceneMarkerTags`, `plugins`). If a Stash component behaves differently in tests than against real Stash, check the mock's resolver first. `markerStrings` used to return `[]`, which made Stash's marker title field blank when editing an existing marker.

⚠️ **Saved-filter fixtures must use Stash's UI shape for hierarchical criteria.** Stash's frontend saves tag/performer criteria in saved filters as `{value: {items: [{id, label}], excluded, depth}, modifier}` — *not* the flat `{value: [ids], modifier, depth}` criterion input the GraphQL API accepts. The mock's fixtures originally used the flat shape, which `ListFilterModel.configureFromSavedFilter` silently parses to an empty item list — tag filters matched nothing and nothing errored. Any new fixture with a tags/performers criterion must use the `items` shape.

⚠️ **`startMockStash` rejects with `EADDRINUSE` when its fixed port is taken** (it used to hang until the hook timeout). Find leftovers with `lsof -nP -iTCP:4000 -sTCP:LISTEN`. The WebSocket server is attached only after `listen` succeeds, because `ws` re-emits HTTP server errors and graphql-ws would log them as a noisy "internal error".

⚠️ **To assert on which requests were made, use the mock server's request log.** `server.getRequestCounts()` counts operations by name, and `server.getRequests()` lists each one in order with its variables (e.g. to check which scene a `FindScene` was for). `resetRequestCounts()` clears both. Note vitest hides `console.log` output from passing tests (`silent: 'passed-only'`), so debug logging only shows up when a test fails.

⚠️ **`DEBUG_MOCK_REQUESTS=1` logs every GraphQL operation mock-stash executes** (operation name + variables) — the fastest way to see what the app actually sends when debugging integration/e2e tests.

## Known gaps & deferred improvements

- **mock-stash `meta.test.ts`**: the marker create/update/destroy test bundles three behaviours in one `it`.
- **Conformance suite** (`packages/mock-stash/test/conformance/`): scattered `as` casts on projections (centralise a typed-projection helper); "findScenes sorts by path consistently" sorts inside its own projection, weakening what it verifies.
