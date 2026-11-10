# mock-stash Tests

**Read this when:** changing mock-stash (`packages/mock-stash`, the mock Stash server the integration and E2E tests run against), its fixtures, or its tests, or the tests of the plugin in a real Stash. The tiers, standards and where files go are in [testing](testing.md); which Stash versions it serves is in [Stash compatibility](stash-compatibility.md).

mock-stash serves Stash's own GraphQL schema, with resolvers of its own over an in-memory store of fixtures. The app's tests are only as right as it is, so it has two suites of its own:

- **Meta tests** (`test/meta.test.ts`, `yarn --cwd packages/mock-stash test`): how the mock itself behaves (its store, tenants, request log), fast and with no Docker.
- **Conformance tests** (`test/conformance/`, `yarn test:conformance`): every operation the mock implements, run on the mock and on a real Stash of each tested version seeded with the same data, whose responses must match. See "Conformance" below.

mock-stash serves any tested Stash version's schema (`startMockStash({ stashVersion })`, or `MOCK_STASH_VERSION` for the test projects and the E2E server, read by `stashVersionFromEnv()`), and reports that version from its `version` query. Its resolvers are written for develop: one a release lacks the field for is ignored there. Which versions are tested: [Stash compatibility](stash-compatibility.md).

**A real Stash** for tests comes from `startRealStash(version, { plugins })` in `src/real-stash.ts`: it starts that version's image (from `stash-versions.json`) with the media fixtures, runs setup and a scan, and can install plugins. Import it as `mock-stash/src/real-stash`, not from the package's entry, which the app's tests import too, so they don't load testcontainers. Tests needing one call `canRunRealStash()` first: without Docker they skip themselves, unless `REQUIRE_DOCKER` is set (as in CI), when they fail rather than pass by skipping.

## Conformance

The conformance tests check the mock answers like Stash does, for every query, mutation and subscription it implements, against each tested Stash version (`conformance-stash-<version>` projects, from `vitest.conformance.config.ts`, each a CI job). If they fail after a Stash upgrade, the mock has drifted from Stash and needs updating; if they fail after a change to the mock, the change made it less like Stash.

- **Seeding:** each run starts a real Stash of the version (`startRealStash`), and `seedRealStash()` (`src/seed-real-stash.ts`) gives it the mock's fixtures through Stash's own API: tags, studios, performers and markers created, the scanned scenes given their details, o-history and plays, saved filters and UI config. It returns an `IdMap` (`src/id-map.ts`) of which real id each fixture id became, as Stash chooses its own. The first cases compare everything seeded, so a seeding mistake shows there first.
- **Cases are data** (`test/conformance/cases.ts`, typed in `case.ts`): an operation, its variables, and optionally what part of the response to compare and what to send afterwards. Cases use the app's own operations (generated-graphql) wherever the app sends that operation, so what's compared is what the app reads. Variables name entities by their mock ids (`id("Scene", "scene-1")`); one a case creates gets an alias later cases use (`creates`).
- **One ordered session** (`test/conformance/session.ts`) runs the cases on both servers, in order: a real Stash can't be reset between cases quickly, so each group of cases puts back what it changed (`after`), and deleting scenes comes last. Each operation is first adapted to the version's schema with the app's own code (`adaptDocumentToSchema`, from tv-ui), so an older release gets what the app would send it.
- **Comparing:** the session adds `__typename` to every selection, then normalises both responses: the real Stash's entity ids translated to the mock's (including those in a saved filter's criteria and in URLs), URLs put on one host, cache-busting `t=` parameters and `created_at`/`updated_at`/`mod_time` dropped. Anything else that can't match (e.g. a time the case ran at) needs a `project` in its case, saying why.

### Coverage

Coverage is enforced without Docker, in the ordinary test runs, so it can't slip unnoticed:

- **Every resolver has a case.** `test/conformance-coverage.test.ts` (mock-stash's ordinary suite) fails on a query, mutation or subscription the mock implements that no case's document selects, unless `test/conformance/waivers.ts` waives it with a reason. It also fails on a waiver that's no longer needed, and on a case for something the mock doesn't implement.
- **Every operation the app sends has a case.** mock-stash logs each operation it executes to `MOCK_STASH_OPERATIONS_LOG` (`src/operations-log.ts`). tv-ui's Vitest and Playwright runs set it, and fail at the end (`test/check-operations.ts`, `test/e2e/check-operations.ts`) if one has no case: a named operation (the app's) needs a case using that operation, an unnamed one (a test's own set-up) its root fields covered. Playwright can't load the app's GraphQL documents itself, so its check runs `yarn --cwd packages/mock-stash check-operations`.

An operation the app sends that the mock doesn't implement doesn't fail on its own: the mock serves Stash's whole schema, so the operation's fields just come back `null`. This check is what catches it: it found the app sending `tagUpdate` (a tag's favourite) and `sceneAddPlay`, which the mock answered with nothing.

### A seeded Stash to develop against

`yarn stash:dev [version]` (from the repo root) starts a real Stash seeded with the same fixtures, to develop against, in Docker: the latest release by default, on port 9999 (`--port` for another). Point the dev server at it with `STASH_ADDRESS` in `packages/tv-ui/.env`. Its data is kept between runs in `packages/mock-stash/.local/stash-dev/<version>/`; `--reset` puts it back as seeded (from a copy of the database taken then), `--fresh` seeds it from scratch, `--stop` stops it, and `--with-plugin` installs the built plugin. It's run with the `docker` CLI rather than testcontainers, which removes its containers when the process exits.

## The plugin in a real Stash

`packages/tv-plugin/test/real-stash/` tests the built plugin installed in a real Stash of each tested version (`yarn test:real-stash`, after `yarn build`), with Playwright: one project per version (`stash-<version>`, from `playwright.config.ts`), whose worker starts that Stash with `dist/` as the plugin. They check what the plugin does in Stash's own UI (`main.tsx`), which Stash's own React renders and which depends on Stash's components and pages: the nav bar link (added the first time the plugin loads), the TV menu item setting, the plugin's settings, opening a scene list or a scene's queue in Stash TV, and the app it serves playing a scene. The tests share their Stash and run in order. The fixture fails a test on any page error, console error or failed request, other than a short list of expected ones (`fixtures.ts`): the Screen Wake Lock being refused (headless Chromium), and the generated files a scan doesn't make (sprites, thumbnails, the previews scene cards play when the pointer passes over them).

- ⚠️ A new Stash shows its release notes over every page until they're seen. The fixture marks them seen (the `lastNoteSeen` UI setting) before the tests.
- ⚠️ Stash leaves a sort's default direction (ascending, for most; descending for a date) out of a list's URL, and so out of the links the plugin makes from it. Test with the other direction to see it passed on.
- ⚠️ The app's first-run guide covers it until closed. Close it as a user would, which is also the click a browser wants before playing media.
- ⚠️ Stash's settings switches aren't labelled: each has an id from its group and item (e.g. `#menu-items-tv`), beside a heading.
- These tests found the plugin not running at all once tv-plugin became an ES module package (its bundle's file name changed from the `stash-tv.umd.js` that `source.yml` loads), and the nav bar link only appearing after a reload. Both are fixed: `vite.config.ts` names the bundle itself, and the plugin evicts Stash's cached configuration after changing it.

## Fixtures

Fixture scenes have no captions; set `captions` on a scene record to give it some. Each scene's `_thumbs.vtt` has a cue for every second, showing its screenshot, so the progress bar's thumbnail preview shows as it does with Stash's sprites. Fixture tags, performers and studios have no images of their own: like Stash, mock-stash marks their `image_path` as its stand-in (`default=true`) unless the record has `has_image`. Filtering scenes by studio includes sub-studios' scenes, and leaves out scenes without a studio.

## Gotchas

⚠️ **The fixtures are as a real Stash would have them**, so seeding can recreate them: every scene has a media file of its own (scenes 5-8's are 1-4's with their colours inverted, as a real Stash sees identical files as one), files are under `/media` with no audio and Stash's oshash, and a scene's play count and when it was last played match its play history. Keep new fixtures that way, or the seeded-data cases fail.

⚠️ **Match Stash's quirks rather than normalising them away in the session.** The mock gives an unset text field as `""` (not `null`), histories newest first, times to the second, a scene's performers and tags by name, no plugins or jobs as `null`, a marker's media under its scene (`/scene/<scene>/scene_marker/<marker>/stream`) and a scene's sprite and thumbnails by its file's oshash: each because Stash does.

⚠️ **The conformance config points Vite at graphql's CommonJS build** (`resolve.alias`, on each project, as projects don't inherit the root's `resolve`). The session runs tv-ui's adapting code, which Vite would otherwise resolve graphql for as its ES module build, while the libraries Node loads get the CommonJS one: two copies, each rejecting the other's schemas ("from another module or realm").

⚠️ **The mock server is only as realistic as its resolvers.** Conformance compares each with Stash, but only for the operations and data its cases cover, and the rest of a type's fields are served from the fixture records or defaults. If a Stash component behaves differently in tests than against real Stash, check the mock's resolver first, then add a case that would have caught it. `markerStrings` used to return `[]`, which made Stash's marker title field blank when editing an existing marker.

⚠️ **Saved-filter fixtures must use Stash's UI shape for hierarchical criteria.** Stash's frontend saves tag/performer criteria in saved filters as `{value: {items: [{id, label}], excluded, depth}, modifier}` — *not* the flat `{value: [ids], modifier, depth}` criterion input the GraphQL API accepts. The mock's fixtures originally used the flat shape, which `ListFilterModel.configureFromSavedFilter` silently parses to an empty item list — tag filters matched nothing and nothing errored. Any new fixture with a tags/performers criterion must use the `items` shape.

⚠️ **`startMockStash` rejects with `EADDRINUSE` when its fixed port is taken** (it used to hang until the hook timeout). Find leftovers with `lsof -nP -iTCP:4000 -sTCP:LISTEN`. The WebSocket server is attached only after `listen` succeeds, because `ws` re-emits HTTP server errors and graphql-ws would log them as a noisy "internal error".

⚠️ **To assert on which requests were made, use the mock server's request log.** `server.getRequestCounts()` counts operations by name, and `server.getRequests()` lists each one in order with its variables (e.g. to check which scene a `FindScene` was for). `resetRequestCounts()` clears both. Note vitest hides `console.log` output from passing tests (`silent: 'passed-only'`), so debug logging only shows up when a test fails.

⚠️ **`DEBUG_MOCK_REQUESTS=1` logs every GraphQL operation mock-stash executes** (operation name + variables) — the fastest way to see what the app actually sends when debugging integration/e2e tests.

## Known gaps & deferred improvements

- **mock-stash `meta.test.ts`**: the marker create/update/destroy test bundles three behaviours in one `it`.
