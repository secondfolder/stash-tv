# mock-stash Tests

**Read this when:** changing mock-stash (`packages/mock-stash`, the mock Stash server the integration and E2E tests run against), its fixtures, or its tests. The tiers, standards and where files go are in [testing](testing.md); which Stash versions it serves is in [Stash compatibility](stash-compatibility.md).

mock-stash serves Stash's own GraphQL schema, with resolvers of its own over an in-memory store of fixtures. The app's tests are only as right as it is, so it has two suites of its own:

- **Meta tests** (`test/meta.test.ts`, `yarn --cwd packages/mock-stash test`): how the mock itself behaves (its store, tenants, request log), fast and with no Docker.
- **Conformance tests** (`test/conformance/`, `yarn --cwd packages/mock-stash test:conformance`): each runs the same operation against the mock and against a real Stash (started in Docker, seeded with the same media files and scanned), and compares the responses, with volatile fields like ids and timestamps normalised away. They run once per Stash version the mock serves (`vitest.conformance.config.ts`), and skip themselves when Docker isn't available. If they fail after a Stash upgrade, the mock's resolvers have drifted from Stash's and need updating.

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
