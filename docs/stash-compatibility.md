# Stash Version Compatibility

**Read this when:** updating the Stash version stash-ui is built from, changing how the app talks to Stash's GraphQL API (Apollo links, `getApolloClient`), or a feature breaks on one Stash version but not another.

---

## Supported versions

Stash TV supports **the two latest Stash releases**, and aims to support **Stash's develop branch** without guaranteeing it. The versions are in `packages/stash-ui/stash-versions.json`, named by role rather than tag (so test projects and CI jobs keep their names from one release to the next):

- **`develop`:** the commit on Stash's develop branch that stash-ui is built from, so Stash TV gets Stash's latest UI code. Best-effort: its tests run, but its failures don't block a release.
- **`latest-release`** and **`previous-release`:** the two latest Stash releases, which most users run. Supported: their tests block a release. Nothing is built from them; `setup.sh` copies their GraphQL schema files out of their git tags into `packages/stash-ui/release-schemas/<version>/` (gitignored) for the tests.

Each version records its commit and Docker image, and a release its tag. When develop's commit is one of the releases', develop isn't tested separately (`testedStashVersions()` in `packages/mock-stash/src/stash-versions.ts`): that release's tests cover it.

The plugin runs against whatever Stash it's installed in, but it bundles one copy of Stash's UI code, with develop's GraphQL queries. Stash only adds to its schema, so queries from an older version work on a newer one, but not the other way round: a server rejects a whole query that asks for one field it doesn't have. Built from develop, the app's first query (Stash's `Configuration`) would fail on a release, and with it the app.

## React

Stash TV's React has to be the version of the Stash UI code it reuses: React 18 since Stash v0.32.0 (it was 17 before). There are two copies of React at play:

- **The app** (`/plugin/stash-tv/assets/app/`) is a page of its own, bundling React along with the Stash UI code it reuses, so the Stash version it's installed in doesn't matter.
- **The plugin's injected UI** (`tv-plugin/main.tsx`: the nav bar link, the queue button, the scene list menu item, the plugin settings) is rendered by Stash's own React. Its JSX compiles to `PluginApi.React.createElement` (the root tsconfig's classic `"jsx": "react"`, with `React` taken from `PluginApi`) and its hooks are `PluginApi.React`'s, so it works with whichever React the Stash it's in has. The plugin tests check it in a real Stash of each version (§ "Tests"), which today covers both: v0.31.1 runs React 17 and v0.32.0 React 18.

⚠️ When a new develop commit moves Stash to another major version of React, tv-ui's `react`, `react-dom`, their types and Testing Library (see [unit & integration tests](testing-unit-integration.md) § "Gotchas") move with it. Check yarn.lock for wide ranges (`@types/react@*`) still resolved to the old version, which leave a second copy of React's types nested under the packages that use them.

## Adapting queries to the server

`src/helpers/stash-schema-compat.ts` adapts each operation to the connected server:

- Before the first operation goes out, the server's schema is loaded by introspection, through Stash's own link (so with its URL and credentials).
- `adaptDocumentToSchema` leaves out of each operation what the schema lacks: fields, arguments, fragments on unknown types, then anything left empty or unused by that (a field selecting nothing, a fragment no longer spread, a variable no longer used). An operation the schema has everything for is sent unchanged, so on develop nothing changes.
- `adaptVariablesToSchema` drops the variables it no longer declares and input object fields the schema lacks (e.g. a new filter criterion).
- `fillMissingFields` sets every field the original operation asked for but the response lacks to `null`. Apollo's cache treats a result missing a requested field as incomplete and won't hand it back, so leaving them out would break the query.
- If the schema can't be loaded, operations go out unchanged (and work as long as the server is develop's version).

`getApolloClient()` installs the link on Stash's own client with `setLink()`, ahead of Stash's link. Stash's query helpers (`StashService`) use that client directly, and ours shares its link, so every operation goes through it.

⚠️ **A left-out field is `null`, even where its type says it can't be.** Stash's UI code reading one has to cope (e.g. `general.maxMarkerPreviewDuration ?? 0`). When updating develop's commit, check what the releases lack (the unit test below lists it if you adapt it to print the errors) and that the code Stash TV renders reading it copes with `null`. So far it has all been null-safe or in parts of Stash's UI that Stash TV doesn't show (system settings, the tagger, the studio list).

⚠️ **An operation whose query or mutation a release doesn't have can't be adapted.** It's left with nothing to ask for and the server rejects it. Nothing Stash TV shows sends one so far; a feature that needs one has to be hidden on the release.

## Tests

Each tier runs once per tested version (see the table in [testing](testing.md)), and in CI each version gets jobs of its own, all in parallel:

- **Unit:** `test/unit/helpers/stashSchemaCompat.test.ts` checks that every operation Stash's UI can send is valid on each release once adapted, and unchanged on develop.
- **Integration:** one tv-ui Vitest project per tested version, `integration-stash-<version>`, each against mock-stash serving that version (its `MOCK_STASH_VERSION`, read by `stashVersionFromEnv()`). They catch what the adapted queries break at runtime.
- **Conformance:** mock-stash against the real Stash of each version, in Docker (`conformance-stash-<version>`), which is what makes the mock's versions trustworthy. See [mock-stash tests](testing-mock-stash.md).
- **The plugin in a real Stash:** the built plugin installed in the real Stash of each version, its injected UI checked with Playwright (tv-plugin's `stash-<version>` projects). See [mock-stash tests](testing-mock-stash.md) § "The plugin in a real Stash".
- **E2E:** against each release (`E2E_STASH_VERSION`, the latest release by default), not develop: the other tiers cover develop, and these are the slowest tests to run again.

mock-stash also reports the version it serves (its `version` query), as that Stash would.

⚠️ CI lists the versions in each job's matrix rather than working them out in a job of its own, which every other job would wait for. A develop job stops straight away when develop isn't tested (`.github/actions/check-stash-version`). A repo test (`packages/repo/test/ci-stash-versions.test.ts`) fails if the matrices and `stash-versions.json` disagree.

## Updating the versions

- **New develop commit:** see [stash-ui package](stash-ui-package.md) § "Automatic Setup & Build". Then run the tests above.
- **New Stash release:** in `stash-versions.json`, move `latest-release` to `previous-release`, and give `latest-release` the new release's tag, commit (`git rev-parse <tag>^{commit}` in `packages/stash-ui/stash`; setup checks it) and image (`stashapp/stash:<tag>`). Run setup, then the tests. Once a release includes everything develop has, they have the same schema and adapting changes nothing.
