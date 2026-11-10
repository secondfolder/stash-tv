# Testing

How Stash TV is tested: the tiers, where tests go, the standards every test follows, and gotchas that apply to all of them. Each tier has a doc of its own for how it works and its gotchas:

- [Unit & integration tests](testing-unit-integration.md): tv-ui's Vitest suites, in jsdom, the integration tests against mock-stash
- [E2E tests](testing-e2e.md): tv-ui in a real browser with Playwright
- [mock-stash tests](testing-mock-stash.md): the mock Stash server's own tests, its conformance tests against a real Stash, and the built plugin tested in a real Stash

## Tiers & commands

| Tier | Where | Runner | Command |
| --- | --- | --- | --- |
| Unit | `packages/tv-ui/test/unit/` | Vitest + RTL (jsdom) | `yarn --cwd packages/tv-ui test` |
| Integration | `packages/tv-ui/test/integration/` | Vitest + RTL against a real in-memory mock Stash API, once per tested Stash version (`integration-stash-<version>` projects, see [Stash compatibility](stash-compatibility.md)) | same command as unit |
| Mock server meta/conformance | `packages/mock-stash/test/` | Vitest (node env; conformance uses Docker, skips itself without it unless `REQUIRE_DOCKER` is set, and runs once per tested Stash version) | `yarn --cwd packages/mock-stash test` / `yarn test:conformance` |
| Plugin in a real Stash | `packages/tv-plugin/test/real-stash/` | Playwright + Chromium against a real Stash in Docker, once per tested Stash version (`stash-<version>` projects). Needs the plugin built first (`yarn build`) | `yarn test:real-stash` |
| Docs validation | `packages/repo/test/` | Vitest | `yarn --cwd packages/repo test` |
| Plugin | `packages/tv-plugin/test/unit/` | Vitest (node env) | `yarn --cwd packages/tv-plugin test` |
| E2E | `packages/tv-ui/test/e2e/` | Playwright + Chromium, against mock-stash serving one Stash version (`E2E_STASH_VERSION`, the latest release by default) | `yarn test:e2e` |

`yarn test` at the repo root runs repo + mock-stash + tv-ui + tv-plugin. CI (`.github/workflows/verify-and-publish-if-needed.yml`) splits the tests across parallel jobs so no one job takes long: the build job runs everything but the tests run per Stash version; the integration, conformance and plugin tests get a job per tested Stash version; and the E2E tests run against each release, split into 4 shards each (`yarn test:e2e --shard=N/4`, each on 2 workers, the runner having 4 cores). An E2E shard or plugin job that fails uploads Playwright's report and failures' screenshots, videos and traces as an artifact (`e2e-report-<version>-shard-N`, `plugin-report-<version>`). How the Stash versions are tested, and why develop's jobs can't block a release: [Stash compatibility](stash-compatibility.md) § "Tests". Every job sets itself up with `.github/actions/setup`, which caches `node_modules` (keyed on `yarn.lock`) and stash-ui's build (keyed on the fingerprint `ensure-ready` checks, so a restored build counts as up to date); the E2E jobs also cache Playwright's browsers. ⚠️ The build job lists the root `test` script's packages itself, so a package added there must be added to the job too. A failing test in any job blocks a release, except in develop's jobs.

From `packages/tv-ui` (or with `yarn --cwd packages/tv-ui`):

```bash
yarn test                                      # all tv-ui tests (unit + integration)
yarn test test/unit/                           # unit only
yarn test test/integration/                    # integration only
yarn test --project integration-stash-develop  # integration against one Stash version only (develop, latest-release, previous-release)
yarn test test/unit/store/globalState.test.ts  # one file
yarn test --watch                              # watch mode
yarn test --coverage                           # coverage report
yarn test:e2e                                  # E2E tests (servers are managed for you), against the latest release
E2E_STASH_VERSION=previous-release yarn test:e2e  # E2E tests against another Stash version
```

## Where tests and helpers go

- **tv-ui unit tests** go in `test/unit/<area>/`, mirroring `src/` (e.g. tests of `src/helpers/` in `test/unit/helpers/`), and **integration tests** in `test/integration/`. Tests never live in `src/`. Import app code by relative path into `src/` (e.g. `../../../src/components/...`): there's no `src/` alias.
- **Helpers go with the tier that uses them:**
  - `test/unit/support/`: unit tests only (e.g. `renderOnSlide`, `resetStores`). Not `test/unit/helpers/`, which holds the tests of `src/helpers/`.
  - `test/integration/helpers/`: integration tests only (the harness, feed helpers, one file per feature's helpers).
  - `test/e2e/helpers/`: E2E tests only.
  - `test/helpers/`: used by both the unit and integration tests (e.g. `sceneInfo.ts`, `actionButtons.tsx`).
- **E2E tests** go in `test/e2e/`.
- **mock-stash's tests** go in `packages/mock-stash/test/`, including any test that only exercises mock-stash (see [mock-stash tests](testing-mock-stash.md)).

## Standards (binding for all tests)

- **Test behavior, not implementation.** Every test must state an observable behavior: a guard firing, persistence landing in the right backend, a computed output, a conditional render, a callback receiving the right arguments. Heuristic: if you can describe the test as "when X happens, Y is the observable result", keep it; if you can only describe it as "the code contains X", delete it. Explicitly excluded: default-value restatements, `set(x); expect(get(x))` round-trips, `typeof` assertions, class-name-existence checks.
- **Query priority (RTL):** accessible queries (`getByRole`, `getByText`, `getByLabelText`) → `data-testid` (add to app code when needed — sanctioned) → class selectors only when the class *is* the contract (styling components like `Tag`/`ClipTimestamp`).
- **Interactions:** prefer `userEvent` over `fireEvent` for realistic user interactions. `fireEvent` is acceptable for events users don't literally fire or jsdom workarounds — comment why.
- **TypeScript:** tests are typechecked and must be clean. No `as Foo` casts, `any`, or `@ts-expect-error` — narrow unions properly. If narrowing is needed repeatedly, put one cast inside a shared helper rather than scattering casts.
- **Shared helpers, no duplication:** store reset/gating lives in `tv-ui/test/unit/support/stores.ts` (`resetStores()`, `setTvConfigLoaded()`); RTL cleanup is centralized in `tv-ui/test/setup.ts`. Never add per-file `cleanupRtl()` boilerplate.
- **Unit test what doesn't need the app or Stash.** A test is an integration test only if what it checks depends on the app talking to (mock) Stash, or on the app as a whole (e.g. the feed moving on). A component that only needs Stash's data as props, or a hook, function or store, gets a unit test, which runs in a fraction of the time. `renderOnSlide(ui)` (`test/unit/support/render.tsx`) renders a component with the contexts it has on a slide (react-intl, the slide's own state, and an Apollo client that never answers), and `sceneMediaItem()` / `markerMediaItem()` (`test/unit/support/mediaItems.ts`) make stand-in media items with just the fields given. Helpers both tiers use go in `test/helpers/` (e.g. `sceneInfo.ts`, `actionButtons.tsx`). A test that boots the app only to borrow its Apollo client and talk to mock-stash is testing mock-stash: put it in `packages/mock-stash/test/`.
- **One behavior per test**, named after the behavior ("blocks sets and warns before tvConfigLoaded"), not the API.
- **Doc citations:** tests verifying documented behavior cite it with `@see docs/<file>.md § "<heading>"` (or `AGENTS.md § "<heading>"` for repo-wide behaviour). `packages/repo/test/docs.test.ts` checks every cited heading exists, matching exactly, case included. If behavior is worth testing but not documented, document it.

## Gotchas

⚠️ **Running tests doesn't typecheck them.** There is no pre-commit hook in this repo (no husky/lint-staged; commitlint covers commit messages in CI only), and **vitest does not typecheck** — esbuild strips types. Type errors have landed in `main` test files this way. Run `yarn typecheck` from the repo root as part of any test change. It checks the root tsconfig (tv-ui, tv-plugin, mock-stash) and `packages/repo`'s own tsconfig.

⚠️ **A bare `tsc` covers only one tsconfig.** `packages/repo` has its own `tsconfig.json`, which the root one doesn't include. Running `tsc` there skips everything else, and running it at the root skips `packages/repo`. `yarn typecheck` runs both, and so does CI.

## Known gaps & deferred improvements

Issues found in the 2026-09 test-suite review that were **not** fixed. Gaps specific to a tier are in its doc.

- **No lint enforcement of the standards.** The `any`/`as`-cast/`fireEvent` drift the review found would be caught by a minimal ESLint config (`@typescript-eslint/no-explicit-any`, `no-unnecessary-type-assertion`, RTL-specific rules) scoped to test files. Until then, the standards are manual.
- **No coverage thresholds.** Coverage is scoped to `src/**` (stories excluded) but nothing prevents regressions. Consider `coverage.thresholds` once the numbers stabilise.

## History

The test suite was introduced via the plan in `docs/historical-plans/2026-08-30-testing-implementation-plan.md` (mock-stash package, conformance-vs-real-Stash, tiered strategy). That plan is frozen; this doc is the living reference.
