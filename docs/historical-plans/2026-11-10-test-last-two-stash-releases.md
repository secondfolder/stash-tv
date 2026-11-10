> Frozen implementation plan, written 2026-11-10 before implementation. Deviations are marked inline.

# Test against the last two Stash releases (and develop)

## Context

Stash TV's tests check it against two Stash versions today (see `docs/stash-compatibility.md`):
- **Pinned:** the Stash develop commit stash-ui is built from (`STASH_VERSION` in `packages/stash-ui/scripts/setup.sh`).
- **Latest release:** `STASH_RELEASE_VERSION` in the same file. Nothing is built from it. `setup.sh` copies its GraphQL schema files out of its git tag into `packages/stash-ui/release-schema/`, so mock-stash can serve that version's schema.

Each version is tested two ways:
- **tv-ui's integration suite** runs the built app against mock-stash serving that version's schema: the `integration-stash-develop` and `integration-stash-stable` Vitest projects, one CI job each.
- **mock-stash's conformance suite** checks the mock answers like the real Stash of that version, started in Docker: the `conformance-stash-develop` and `conformance-stash-stable` projects. ⚠️ CI never runs these. They only run by hand.

The single release is wired in at fixed names in several places:
- `setup.sh`, `fingerprint.sh` (`RELEASE_SCHEMA_DIR`) and `ensure-ready.sh`.
- mock-stash's `MockStashVersion = "pinned" | "latest-stable-release"` and its schema directories (`src/schema.ts`).
- Each Docker image in `STASH_IMAGES` (`test/conformance/real-stash.ts`).
- Turning `MOCK_STASH_VERSION` into a version, in tv-ui's `test/integration/helpers/harness.tsx` and mock-stash's `test/conformance/conformance.test.ts`. Both fall back to the pinned version for any other value, silently.
- The Vitest projects, in `packages/tv-ui/vitest.config.ts` and `packages/mock-stash/vitest.conformance.config.ts`.
- `test/unit/helpers/stashSchemaCompat.test.ts`, which checks Stash's operations against the one release schema.
- The CI matrix (`.github/workflows/verify-and-publish-if-needed.yml`, `integration` job).

## Goal

Stash TV supports **the two latest Stash releases**, and aims to support **Stash's develop branch** (the commit stash-ui is built from) without guaranteeing it.

- mock-stash serves each of these versions' schemas: three versions, or two when the develop commit is one of the releases. The tests run against each version served.
- Each version mock-stash serves is checked against the real Stash of that version, in CI.
- The built plugin is installed in the real Stash of each version and its injected UI is checked there, in CI.

## Decisions

From the user:
- **Support policy:** the two latest releases are supported (today v0.32.0 and v0.31.1). Develop is supported on a best-effort basis, with no guarantee.
- **Nothing is built from a release.** Only its schema is extracted, for mock-stash to serve. The app is built once, from the develop commit.
- **Develop stays**, but its tests only run when the develop commit isn't one of the releases. Otherwise a release's tests already cover it.
- **The plugin's injected UI is tested in a real Stash of each version** (§5). It was previously only checked by hand.

Made in this plan:
- **"Isn't one of the releases" means a different commit,** not a different schema. When the develop commit is a release tag's commit, its tests are skipped. When develop is a few commits past a release with the same schema (as with v0.32.0), they still run. That's cheap, and the real develop image can behave differently even with the same schema. Comparing schemas instead would also be possible, if the user prefers.
- **Versions are named by role, not tag:** `develop`, `latest-release` and `previous-release`. Project names, CI job names and schema directories then stay the same from one release to the next. Only the tags change.
- **One file holds every version:** `packages/stash-ui/stash-versions.json`. It replaces `STASH_VERSION` and `STASH_RELEASE_VERSION` in `setup.sh` and `STASH_IMAGES` in `real-stash.ts`. Shell scripts read it with `jq` (already used by `import-stash-ui-deps.sh`), and TypeScript imports it. Each release records its **commit** as well as its tag, so whether develop is a release can be worked out without git. The CI job choosing which versions to test then only needs a checkout.
- **Conformance runs in CI**, one job per tested version. Without it, nothing checks that the mock versions the integration tests rely on are right. The user's bar: CI runs a suite if it takes under 10 minutes. Conformance takes about 20s per version locally, with the container's start and scan. In CI, add the job's setup (as for the other jobs) and pulling the version's image (about 310MB), for an estimated 2–4 minutes per job.
- **CI runs as much in parallel as it can.** Every suite runs once per version, each version in a job of its own, and no job waits for another unless it has to (§6).
- **Only the releases' jobs block a release** (integration, conformance, plugin and E2E tests), matching the support policy. Develop's jobs still run and show their result, but with `continue-on-error`, so a change on Stash's develop branch can't hold up a Stash TV release.
- **E2E tests run against both releases, not develop** (§4). The repo is public, so the extra jobs cost no money, and in parallel they add no time to a run.
- **mock-stash reports the version it serves** (its `version` query), rather than develop's for every schema.

## Approach

### 1. The versions file

`packages/stash-ui/stash-versions.json`:

```json
{
  "develop": {
    "commit": "aefc9373fe57e5cb32fbbb7215fd508ed799743f",
    "image": "stashapp/stash:development@sha256:4a95e1721522798769ff9b881eb2eb4059e07fc19699dc8319b24adfd0255bb3"
  },
  "latest-release": {
    "tag": "v0.32.0",
    "commit": "9e9ad972643320e737c711884f10e4285f0f3a88",
    "image": "stashapp/stash:v0.32.0"
  },
  "previous-release": {
    "tag": "v0.31.1",
    "commit": "4de2351e7cc990d7ccd7cb6c84c275cd53bf6e55",
    "image": "stashapp/stash:v0.31.1"
  }
}
```

- The submodule must still point at `develop.commit`, as `STASH_VERSION` requires today.
- A small TS module in mock-stash (e.g. `src/stash-versions.ts`) imports it and exports:
  - `StashVersion = "develop" | "latest-release" | "previous-release"`, replacing `MockStashVersion`.
  - `testedStashVersions()`: the releases, plus `develop` unless its commit equals a release's.
  - `stashVersionFromEnv()`: reads `MOCK_STASH_VERSION`, **throwing** on an unknown value rather than falling back. It defaults to `develop` when unset, or to `latest-release` if develop is skipped.
- A script prints `testedStashVersions()` as JSON for CI (e.g. `yarn --cwd packages/mock-stash tested-versions`).

### 2. `setup.sh` and the stash-ui scripts

- Read `develop.commit` from the file instead of `STASH_VERSION`.
- Extract **each release's** schema to `release-schemas/<role>/` (e.g. `release-schemas/latest-release/`), with the same `git archive` of `graphql/schema` as today.
- Before extracting, check each tag still resolves to its recorded commit, and fail with a clear message if not.
- Keep the comments added on 2026-11-10 explaining that the releases are there for the tests only: just their schema files are copied, for mock-stash, and nothing of them goes into the plugin.
- `fingerprint.sh`: `RELEASE_SCHEMA_DIR` becomes `RELEASE_SCHEMAS_DIR`, and `stash-versions.json` joins the setup fingerprint's inputs.
- `ensure-ready.sh`: run setup if any release's schema directory is missing.
- `.gitignore`: `packages/stash-ui/release-schema` becomes `packages/stash-ui/release-schemas`.

### 3. mock-stash

- `src/schema.ts`: map `develop` to `stash-ui/stash/graphql/schema` and each release role to `stash-ui/release-schemas/<role>`.
  - Keep `requireResolversToMatchSchema: "error"` for develop only, since the resolvers are written for it.
- `src/server.ts` / `src/index.ts`: export `StashVersion` and the helpers from §1 in place of `MockStashVersion`.
- `test/conformance/real-stash.ts`: take each image from the versions file, replacing `STASH_IMAGES`.
- `vitest.conformance.config.ts`: generate the projects from `testedStashVersions()`, named `conformance-stash-<role>`, each setting `MOCK_STASH_VERSION`.
- `test/conformance/conformance.test.ts`: use `stashVersionFromEnv()`.
- `src/resolvers/query.ts`'s `version` resolver reports develop's version for every schema today. It reports the version being served instead: the release's tag for a release, and develop's `git describe` for develop (recorded in the versions file as `develop.version`, e.g. `v0.32.0-8-gaefc9373`, since the mock can't run git).
- Expect v0.31.1 to need mock fixes that conformance finds. If its behaviour differs in ways a shared resolver can't serve, the resolvers can branch on the server's version. Only add that for a real failure.

### 4. tv-ui

- `vitest.config.ts`: generate one integration project per tested version, `integration-stash-<role>`, each setting `MOCK_STASH_VERSION`.
  - `integration-stash-develop` keeps its name. `integration-stash-stable` becomes `integration-stash-latest-release`, and `integration-stash-previous-release` is new.
- `test/integration/helpers/harness.tsx`: use `stashVersionFromEnv()`.
- `test/unit/helpers/stashSchemaCompat.test.ts`:
  - "valid once adapted" runs for **each** release schema.
  - "left as they are" keeps checking the develop schema. It runs even when develop's other tests are skipped, since the app's queries come from it either way.
  - The startup-queries test runs for each release.
- E2E tests run against **each release**, not develop (§6). Today they run against develop only, which is now the best-effort version. Releases are where fields develop has are adapted away and come back as `null`, which is where rendering bugs would show, and only a real browser shows layout ones.
  - `playwright.config.ts` passes the version (`E2E_STASH_VERSION`, defaulting to `latest-release`) to the mock-stash it starts (`test:e2e-server` reads it as `MOCK_STASH_VERSION`).

### 5. The plugin in a real Stash

The integration tests check the app against each version's schema, but not the part of the plugin that runs inside Stash's own UI (`packages/tv-plugin/main.tsx`). That part renders with Stash's own React, which differs between the supported versions (React 17 in v0.31.1, React 18 from v0.32.0). It also depends on Stash's components and page structure: the patched components and the selectors it puts its buttons in. On 2026-11-10 this was checked by hand, with a Playwright script against a real Stash with the built plugin installed. That check becomes a test tier.

**Where:** `packages/tv-plugin/test/real-stash/`, with Playwright Test, so failures come with a trace and screenshots as the E2E tests' do. A Playwright config there has one project per tested version (`stash-<role>`), generated from `testedStashVersions()`.

**Starting Stash:** move `startRealStash()` and its helpers out of mock-stash's `test/conformance/real-stash.ts` into a module both tiers import (e.g. exported from mock-stash as `mock-stash/real-stash`). Give it an option to install plugins: bind-mount a directory at `/root/.stash/plugins/<id>`. A worker-scoped fixture then:
- Starts the project's version with `packages/tv-plugin/dist` installed. The tests fail with a clear message if it hasn't been built.
- Runs Stash's setup and a scan, as conformance does.
- Adds `tv` to the menu items (`configureInterface`), since the nav link is only shown when it's there.

**Tests**, one per piece of injected UI:
- Stash loads the plugin (the `plugins` query lists `stash-tv`, enabled).
- The nav bar has the TV link, pointing at the app.
- Settings → Interface offers "TV" among the menu items.
- The plugin's settings render under Settings → Plugins.
- A scene list's "…" menu has "Open in Stash TV", linking to the app with the list's filter.
- A scene page's queue has the "Open queue in Stash TV" button, opening the app with that queue.
- The app, served from the plugin's assets, loads and plays a scene from that Stash (its video reaches `readyState` 2).
- Across all of these, no page errors, and no console errors except an allowlist: the Screen Wake Lock being denied (headless Chromium), and 404s for sprite and VTT files the scan doesn't generate.

Gotchas found doing this by hand:
- A new Stash shows a "Release Notes" modal over every page until it's closed. The fixture should close it (or mark it seen) before the tests run.
- The queue only appears on a scene page opened with queue params (e.g. `/scenes/1?qfp=1&qsort=title&qsortd=asc`), and its tab may need opening first.

### 6. CI

In `.github/workflows/verify-and-publish-if-needed.yml`, every per-version suite is a matrix over the versions, so each (suite, version) pair is a job of its own. All of them start at once, alongside the build and E2E jobs; only `release` waits for the others.

- **The matrix is static:** `version: [develop, latest-release, previous-release]`, rather than coming from a job that works out which versions to test. That job would have to finish before any of the others could start.
  - Instead, each job's first step checks whether its version is tested (`testedStashVersions()`, which needs only the checkout and Node). When the develop commit is one of the releases, the develop jobs stop there and pass, in seconds.
  - A new version role means adding it to the matrices, as well as to the versions file. A unit test can check the two agree: the workflow's matrices list exactly the roles in `stash-versions.json`.
- `integration`: `matrix.version`, running `--project integration-stash-${{ matrix.version }}`.
- A new `conformance` job with the same matrix. It runs `yarn --cwd packages/mock-stash test:conformance --project conformance-stash-${{ matrix.version }}`, with Docker (available on `ubuntu-latest`).
  - ⚠️ The conformance suite skips itself when Docker isn't available. In CI it should fail instead, e.g. with a `REQUIRE_DOCKER=1` env var the suite checks, so a broken Docker setup can't pass silently. The same goes for the plugin tests.
- A new `plugin` job with the same matrix, running the plugin tests (§5) for its version.
  - It builds the plugin itself (`yarn build`, with stash-ui's build restored from the setup action's cache), rather than waiting for the build job's. Waiting would put the build's few minutes in front of every plugin job. The release still publishes the build job's plugin, built from the same commit.
  - It caches and installs Playwright's Chromium as the E2E jobs do, and uploads Playwright's report on failure.
- `e2e`: its matrix becomes shard × release (`version: [latest-release, previous-release]`, `shard: [1, 2, 3, 4]`), 8 jobs, all in parallel. Not develop: the integration, conformance and plugin tiers cover it, and the E2E tests are the slowest and flakiest tier to multiply. Each job's report artifact is named after its version and shard.
- In the per-version jobs, `continue-on-error: ${{ matrix.version == 'develop' }}`, so only the releases' results can block a release (see Decisions).
- `release`: `needs: [build, integration, conformance, plugin, e2e]`.
- Every new job gets a `timeout-minutes` (e.g. 15), so a hung container or browser fails the job rather than holding up the run for GitHub's 6-hour default.
- If any per-version job turns out to take longer than 10 minutes, split it further the way the E2E tests are (`--shard`), rather than leaving it out of CI.
- Update the build job's comments listing what each job runs.

### 7. Updating the versions

When Stash publishes a release:
1. Move `latest-release` to `previous-release`.
2. Set `latest-release` to the new tag, its commit and its image.
3. Run setup and the tests.

Optionally, a script (`yarn --cwd packages/stash-ui update-release <tag>`) could do this, looking up the tag's commit. Moving `develop` stays the procedure in `docs/stash-ui-package.md` § "Automatic Setup & Build", now editing the versions file instead of `setup.sh`, and setting `develop.image` to the digest built from that commit.

## Docs

- `docs/stash-compatibility.md`:
  - The support policy: the two latest releases are supported, and develop (the commit the app is built from) is best-effort.
  - The versions file, how develop's tests are skipped when it's a release, why develop's failures don't block a release, the new project and job names, conformance and the plugin tests in CI, and the new update steps.
- `docs/stash-ui-package.md`: setup inputs (`stash-versions.json`) and the updated "Updating Stash" steps.
- `docs/testing.md`: the tiers table (integration and conformance per tested version, conformance now in CI, and the new plugin tier with its command) and the CI paragraph. The plugin tier's gotchas (the release notes modal, the queue's params) go in its section.
- `AGENTS.md`: the GraphQL Integration bullet ("Two Stash versions"), the testing status line, and tv-plugin's package description (it now has a real-Stash test tier).

## Testing the change

- `testedStashVersions()` gets a unit test: develop is left out when its commit equals either release's commit, and kept otherwise. Also test `stashVersionFromEnv()` throwing on unknown values, and that the workflow's matrices match the versions file's roles (§6).
- Run setup from scratch (delete `release-schemas/` and `.local/setup-stamp`) and check both schemas are extracted. Point a release at a wrong commit and check setup fails.
- Run every integration, conformance and plugin project locally, including against a real v0.31.1.
- Check the plugin tests can fail: break a selector the plugin uses (e.g. the queue controls') and check the matching test fails, with a useful trace.
- Temporarily set `develop.commit` to v0.32.0's commit and check the develop projects and CI matrix entry disappear.
- Push to a branch and check:
  - Each (suite, version) job runs in parallel, and how long each takes, against the 10-minute bar.
  - The develop jobs stop early, and pass, when `develop.commit` is set to a release's commit.
  - A failing develop job doesn't block the release job.

## Out of scope

- A different build of the app per release. One build has to work on every supported version, as it does today.

## Deviations during implementation

> Added 2026-11-10 by Claude (Opus 5.5), during implementation.

- **The plugin tests check the first run rather than set up the menu item.** §5 had the fixture add `tv` to the menu items. The plugin does that itself the first time it loads, so the tests check that instead. Doing so found that the TV link only appeared once the page was reloaded: the plugin now evicts Stash's cached configuration after changing it (`evictConfiguration()` in `main.tsx`).
- **tv-plugin became an ES module package** (`"type": "module"`), as Playwright couldn't otherwise load mock-stash's modules into the plugin tests. That changed the bundle's default file names, so the plugin stopped loading at all (`source.yml` loads `stash-tv.umd.js`); the plugin tests caught it. `vite.config.ts` now names the bundles itself.
- **`startRealStash()` is imported by path** (`mock-stash/src/real-stash`, or relatively from tv-plugin's tests, as Playwright only compiles TypeScript outside `node_modules`), rather than as a new package export.
- **The CI check of whether a version is tested** is a composite action (`.github/actions/check-stash-version`) running `packages/mock-stash/scripts/tested-stash-versions.ts` on Node alone, which strips its types. That needed the root tsconfig to allow `.ts` import extensions.
- **The test that CI's matrices match the versions file** is in `packages/repo/test/ci-stash-versions.test.ts`, reading the matrices' lines rather than parsing the YAML (there are no types for `js-yaml`).
- **The E2E jobs' timeout is 20 minutes**, not 15, as they were the one job with none before and run longest.
- **A root `yarn test:real-stash`** shortcut was added for the plugin tests, as for `test:conformance`.
