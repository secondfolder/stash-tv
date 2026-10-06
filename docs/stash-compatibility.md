# Stash Version Compatibility

**Read this when:** updating the Stash version stash-ui is built from, changing how the app talks to Stash's GraphQL API (Apollo links, `getApolloClient`), or a feature breaks on one Stash version but not another.

---

## Supported versions

Stash TV supports two Stash versions at once:

- **Pinned:** the version stash-ui is built from (`STASH_VERSION` in `packages/stash-ui/scripts/setup.sh`), currently a commit on Stash's `develop` branch so Stash TV gets Stash's latest UI code.
- **Latest release:** the newest Stash release (`STASH_RELEASE_VERSION` in the same file), which is what most users run.

The plugin runs against whatever Stash it's installed in, but it bundles one copy of Stash's UI code, with that version's GraphQL queries. Stash only adds to its schema, so queries from an older version work on a newer one, but not the other way round: a server rejects a whole query that asks for one field it doesn't have. Built from develop, the app's first query (Stash's `Configuration`) would fail on the latest release, and with it the app.

## Adapting queries to the server

`src/helpers/stash-schema-compat.ts` adapts each operation to the connected server:

- Before the first operation goes out, the server's schema is loaded by introspection, through Stash's own link (so with its URL and credentials).
- `adaptDocumentToSchema` leaves out of each operation what the schema lacks: fields, arguments, fragments on unknown types, then anything left empty or unused by that (a field selecting nothing, a fragment no longer spread, a variable no longer used). An operation the schema has everything for is sent unchanged, so on the pinned version nothing changes.
- `adaptVariablesToSchema` drops the variables it no longer declares and input object fields the schema lacks (e.g. a new filter criterion).
- `fillMissingFields` sets every field the original operation asked for but the response lacks to `null`. Apollo's cache treats a result missing a requested field as incomplete and won't hand it back, so leaving them out would break the query.
- If the schema can't be loaded, operations go out unchanged (and work as long as the server is the pinned version).

`getApolloClient()` installs the link on Stash's own client with `setLink()`, ahead of Stash's link. Stash's query helpers (`StashService`) use that client directly, and ours shares its link, so every operation goes through it.

⚠️ **A left-out field is `null`, even where its type says it can't be.** Stash's UI code reading one has to cope (e.g. `general.maxMarkerPreviewDuration ?? 0`). When updating the pinned version, check what the latest release lacks (the unit test below lists it if you adapt it to print the errors) and that the code Stash TV renders reading it copes with `null`. So far it has all been null-safe or in parts of Stash's UI that Stash TV doesn't show (system settings, the tagger, the studio list).

⚠️ **An operation whose query or mutation the release doesn't have can't be adapted.** It's left with nothing to ask for and the server rejects it. Nothing Stash TV shows sends one so far; a feature that needs one has to be hidden on the release.

## Tests

- `test/unit/helpers/stashSchemaCompat.test.ts` checks that every operation Stash's UI can send is valid on the latest release once adapted, and unchanged on the pinned version.
- The tv-ui integration suite runs twice: the `integration` project against mock-stash serving the pinned schema, and `integration-latest-release` against it serving the latest release's (`startMockStash({ stashVersion: "latest-release" })`). The second catches what the adapted queries break at runtime.
- mock-stash's conformance suite runs against a real Stash of each version (`STASH_IMAGES` in `test/conformance/real-stash.ts`).
- `setup.sh` extracts the latest release's schema from its git tag into `packages/stash-ui/release-schema/` (gitignored), which mock-stash and the unit test read.

## Updating the versions

- **New pinned version:** see [stash-ui package](stash-ui-package.md) § "Automatic Setup & Build". Then run the tests above.
- **New Stash release:** set `STASH_RELEASE_VERSION` in `setup.sh` and the `latest-release` image in `real-stash.ts`, run setup, and run the tests. Once a release includes everything the pinned version has, the latest release and pinned version have the same schema and adapting changes nothing.
