> Frozen implementation plan, written 2026-11-10 before implementation. Deviations are marked inline.

# Full conformance coverage for mock-stash

## Context

The integration and E2E tests run the app against mock-stash, which serves Stash's own GraphQL schema with resolvers of its own (`packages/mock-stash`). Those tests are only as right as the mock. Conformance tests (`packages/mock-stash/test/conformance/`) check it: each sends the same operation to the mock and to a real Stash in Docker, and compares the responses.

They cover very little:
- **Covered:** 4 tests, on 3 operations: `findScenes` (twice), `sceneStreams` and `configuration`.
- **Implemented by the mock:** 18 queries, 26 mutations and 3 subscriptions. Nothing checks most of the queries, any of the mutations (rating, o-count, markers, tags, saved filters, deletes) or any subscription against a real Stash.
- **The real Stash isn't seeded like the mock.** It's started with 4 of the media files and scanned, so it has scenes but none of the mock's tags, performers, studios, markers or saved filters. Most operations can't be compared until it has the same data.
- **Gaps don't show.** The mock serves Stash's whole schema, so an operation whose resolver it lacks doesn't fail. Its fields come back `null` (or the query errors only if one is non-null), and an integration test can pass on that.

The plan to test against the last two Stash releases (`2026-11-10-test-last-two-stash-releases.md`) runs conformance once per supported version, in CI. That makes conformance what vouches for each version of the mock, so its coverage matters more.

## Goal

- **Every operation mock-stash implements has a conformance case, checked against a real Stash of each version the mock serves.**
- **Every operation the app sends in the integration and E2E tests has one.**
- **Both fail fast, without Docker, if coverage slips.** A new resolver, or a new operation the app starts sending, with no case fails the ordinary test run.

Along the way, a script seeds a real Stash with the mock's fixture data. It also gives developers a **seeded Stash to develop against**.

## Decisions

From the user:
- Full coverage, enforced so it fails if coverage stops being full.
- Start with the cheap guard (a list of what's not covered yet, with reasons), then raise coverage.
- A seeded real Stash for development, if seeding can be automated.

Made in this plan:
- **Conformance cases are data, not free-form tests.** Each case is an entry in a list: its name, the operation (a GraphQL document), its variables, and the group it runs in. A plain unit test can read the list without Docker to check coverage, and one conformance runner sends each case to both servers.
- **Cases use the app's own documents** wherever the app sends that operation (`stash-ui/dist/src/core/generated-graphql`, as `test/meta.test.ts` already does). The fields compared are then exactly the fields the app reads. A hand-written document is only for an operation the app never sends.
- **No literal record and replay of the integration tests.** They depend on every test starting from a fresh mock, which a real Stash can't give cheaply. Instead, conformance runs **one ordered session per Stash version**: both servers start from the same data, and the cases run in order, read-only ones first. Each mutating group puts back what it changed (create, check, delete; rate, check, restore). Staying in step through the whole session is itself part of what's being tested. The request log is still used: to check that every operation the app sends has a case (§6).
- **Ids are mapped, not ignored.** The real Stash's ids are numbers it chooses. Seeding records which real id each fixture id became, cases refer to fixture ids, and the runner translates them for the real Stash and translates its responses back. Responses then match ids exactly, rather than with ids normalised away. Entities created during the session are mapped as they're created.
- **A clean start, if a group ever needs one, comes from a database snapshot.** Stash keeps its state in one SQLite file (`/root/.stash/go.sqlite`). Copy it after seeding; to reset, stop the container, copy it back and start again. That takes seconds: fine between groups, too slow per case. Use it only where putting changes back isn't possible.
- **Waivers have to say why, and can't go stale.** An operation with no case is allowed only with a reason (e.g. it starts a real job whose timing can't be compared). The coverage test fails on a waiver for an operation that now has a case, or that the mock no longer implements.

## Approach

### 1. Cases as data, and the coverage guard

- `test/conformance/cases.ts`: the case list. Each case is `{ name, document, variables?, group, compare? }`. `compare` is an optional projection for responses that can't match exactly (see "Normalising" below).
- `test/conformance/runner.ts`: runs a session. It sends each case to both servers in order, translates ids, applies the projection, and compares. `conformance.test.ts` becomes a thin file that runs the session, one Vitest test per case, so a failure names the case.
- Move the 4 existing tests into the list as cases.
- `test/conformance/waivers.ts`: `{ [rootField]: reason }`. It starts as every root field the mock implements that the 4 cases don't cover.
- **`test/conformance-coverage.test.ts`**, in mock-stash's ordinary suite (no Docker). It:
  1. Takes every root field of `Query`, `Mutation` and `Subscription` the mock has a resolver for (from `src/resolvers`).
  2. Takes every root field the cases' documents select (parsing them with `graphql`).
  3. Fails on any resolver field neither covered nor waived, listing them.
  4. Fails on any stale waiver: a field that's now covered, or that has no resolver.
- Coverage is per root field, not per field of the response. The cases compare whole responses to the app's own documents, so the fields within are covered by that.

### 2. Distinct media for every scene

Scenes 5–8 reuse scenes 1–4's media files (`mediaFileFor()` in `src/fixtures.ts`). A real Stash scanning two identical files sees the same fingerprint twice, so it can't produce 8 scenes matching the mock's.
- Give every scene its own file. Add 4 specs to `MEDIA_SPECS` (e.g. `testsrc2` with a different size, duration or colour, so the files differ) and drop the reuse in `mediaFileFor()`.
- Keep the files small: they're generated by ffmpeg on first start and copied into every real Stash.
- This changes what the mock serves for scenes 5–8 (their file details), so expect a few test expectations to change.

### 3. Seeding a real Stash

`src/seed-real-stash.ts` (in mock-stash, next to the fixtures it reads):
- Input: a running, set-up and scanned Stash's GraphQL URL, and the fixtures (`createDefaultFixtures()`). Output: the id map (fixture id → real id, by type).
- **Scenes:** found by file basename after the scan, then given their fixture fields with `sceneUpdate`: title, code, details, director, urls, date, rating, organized, studio, tags and performers. Their o-history and play history are added with `sceneAddO` / `sceneAddPlay` with the fixture's dates, and their resume time with `sceneSaveActivity`.
- **Tags** (with parents), **studios** (with parent studios) and **performers:** created first, parents before children.
- **Markers:** `sceneMarkerCreate`. **Saved filters:** `saveFilter`, in the shape Stash's UI saves (see `docs/testing-mock-stash.md` § "Gotchas"). **UI and plugin config:** `configureUI` / `configurePlugin`.
- **Can't be set through the API:** ids, created/updated times, and file details (which come from the media). The runner's projections leave out the timestamps, and the media files make file details match.
- **The first case of every session** compares everything the fixtures hold, read through the app's own queries, between the two servers: every scene with its files, tags, performers, studios, markers and saved filters. That checks the seeding before anything else runs.
- `startRealStash()` (shared by conformance and, per the other plan, the plugin tests) gets a `seed` option, which runs this after the scan and returns the id map with the instance.
- After seeding, it snapshots the database (§ Decisions) for groups that need a clean start.
- The seed has to work on every version tested. Where an older release's mutation inputs differ, the seed adapts to its schema the same way the app does (or branches on the version, for anything the schema doesn't show).

### 4. A seeded Stash to develop against

`yarn --cwd packages/mock-stash stash:dev [version]`, with a shortcut in the root `package.json`, `"stash:dev": "yarn --cwd packages/mock-stash stash:dev"`, as the root has for `test:conformance` and `test:e2e`. Yarn passes on what follows, so `yarn stash:dev previous-release --reset` works from the repo root.
- Starts a real Stash of the given version (`latest-release` by default; the versions come from the other plan's versions file) in a named container, with its data in `packages/mock-stash/.local/stash-dev/<version>/`. It's set up, scanned and seeded the first time, and kept between runs.
- Listens on a port of its own (default 9999), and prints the `STASH_ADDRESS` to put in `packages/tv-ui/.env`.
- `--reset` puts back the database snapshot taken after seeding. `--fresh` deletes its data and seeds again. `--stop` stops it.
- Document it in `AGENTS.md` § "Commands" (as `yarn stash:dev`) and the testing docs.
- It can install the built plugin too (`--with-plugin`), reusing the plugin tests' option in `startRealStash()`, to try the plugin in a real Stash.

### 5. Raise coverage until the waivers are gone

Add cases group by group, removing each operation's waiver as it's covered. Each group runs in one session and leaves things as it found them.
1. **Read-only queries:** `findScenes` (with the app's filters: the channels' saved filters, sorting, paging), `findScene`, `findSceneMarkers`, `findTag(s)`, `findPerformer`, `findStudio`, `findSavedFilter(s)`, `sceneStreams`, `sceneMarkerTags`, `markerStrings`, `plugins`, `version`, `systemStatus`, `directory`, `jobQueue`.
2. **Scene edits:** `sceneUpdate` (rating, tags, organized, …), each followed by the app's own query of the scene, then put back.
3. **O-count and plays:** `sceneIncrementO`, `sceneDecrementO`, `sceneAddO`, `sceneDeleteO`, `sceneResetO`, `sceneIncrementPlayCount`, `sceneSaveActivity`. Put back to the fixture's history afterwards.
4. **Markers and tags:** create, update, then destroy (`sceneMarkerCreate`, `sceneMarkerUpdate`, `sceneMarkerDestroy`, `sceneMarkersDestroy`, `tagCreate`, `tagDestroy`).
5. **Config and saved filters:** `configurePlugin`, `configureUI`, `configureInterface`, `saveFilter`, `destroySavedFilter`. Put back afterwards.
6. **Deleting scenes:** `sceneDestroy`, `scenesDestroy`. Last, or followed by a snapshot reset, since a deleted scene can't be put back the same.
7. **Jobs and subscriptions:** `metadataScan`, `stopJob`, `stopAllJobs`, `reloadPlugins`, `reloadScrapers`, and the subscriptions (`scanCompleteSubscribe`, `jobsSubscribe`, `loggingSubscribe`, over graphql-ws to both servers). A job's timing can't match, so these compare the shape of what comes back and what's sent: a scan's job appears, ends, and `scanCompleteSubscribe` fires once.

If an operation can't be compared meaningfully, it keeps a waiver with the reason. The aim is none.

**Normalising:** besides ids (mapped) and timestamps (left out), some responses differ for reasons unrelated to the mock, e.g. URLs with the server's host, or Stash's own version. Each needs an explicit projection in its case, so it's clear what's not compared.

### 6. Every operation the app sends has a case

- mock-stash gets an option to log every operation it executes to a file (`MOCK_STASH_OPERATIONS_LOG=<path>`): the operation name and the root fields it selected, with no duplicates.
- **Integration tests:** `vitest.config.ts` sets it for the integration projects. A `globalTeardown` reads the log and fails the run, listing them, if any operation has no conformance case and no waiver.
- **E2E tests:** `playwright.config.ts` passes it to the mock-stash it starts, and its `globalTeardown` does the same check. Operations only the E2E tests reach (e.g. the create-marker panel's) are caught too.
- The check compares operation names to the cases' documents' names, and falls back to root fields for operations without names.

### 7. Docs

- `docs/testing-mock-stash.md`: how conformance works now (cases as data, the session, id mapping, seeding, snapshots, normalising), the coverage test and waivers, the operations log, and how to add a case.
- `docs/testing.md`: the tiers table (conformance coverage is enforced; the seeded dev Stash).
- `AGENTS.md`: `yarn stash:dev` under "Commands", and the testing status line.
- `docs/stash-compatibility.md`: that conformance runs the same cases against each version.

## Order and dependencies

1. §1 (guard, with today's gaps waived) first. From then on, coverage can only grow.
2. §2 and §3 (distinct media, seeding), then §4 (the dev Stash, which needs §3).
3. §5, group by group.
4. §6 once most operations have cases, so its first run doesn't fail on dozens at once. Until then it could warn instead of fail, but it should fail by the end.

This plan and the multi-version plan touch the same files (`real-stash.ts`, the conformance config). The multi-version plan should go first: it settles how versions are named and run, and this one then adds cases to every version.

## Testing the change

- The coverage test: removing a case fails it naming the operation; adding a resolver without a case fails it; a waiver for a covered operation fails it as stale.
- The seed: the first case (everything the fixtures hold) passes on every version tested.
- Deliberately break a resolver (e.g. make `sceneIncrementO` add 2) and check its case fails, naming it.
- The operations log: add a query to an integration test that no case covers, and check the run fails listing it.
- `stash:dev`: start it from the repo root (`yarn stash:dev`, checking arguments reach it, e.g. `yarn stash:dev previous-release`), point the dev server at it, check the feed shows the fixture scenes, then `--reset` after changing a rating and check it's back.
- Conformance stays under 10 minutes a version in CI (the other plan's bar). If seeding and the larger session make it slower, split the session's groups into shards.

## Out of scope

- Running the integration or E2E tests against a real Stash. They rely on resetting the mock between tests, which a real Stash can't do quickly enough, and conformance is what checks the mock matches.
- Comparing Stash's behaviour for operations the mock doesn't implement and the app doesn't send.
