# Release Process

**Read this when:** writing commit messages, preparing a release, or touching versioning/deployment config.

---

## Commits

Commits follow **Conventional Commits**, enforced by Commitlint (`commitlint.config.ts`):

- Plain `wip` / `wip: ...` messages are allowed locally (ignored by commitlint except in PR CI and production release jobs)
- Releases are automated by Semantic Release on merge to `main` — release notes are generated from the commit history, so write commit messages accordingly

## Release Rules

Beyond the standard `feat` (minor) / `fix` + breaking (major/minor) behaviour, from `release.config.js`:

- `perf`, `ci`, `refactor`, `chore`, `style`, `wip`, and reverts also trigger **patch** releases
- `docs` triggers a release **only** when scoped `docs(in-app)` (i.e. changes to in-app documentation shown to users)
- `test` commits and anything scoped `no-release` never trigger a release

## Release Flow

1. Commit merged to `main` triggers Semantic Release
2. Version bumped in `package.json` (the `release` script then syncs it into `packages/tv-plugin/source.yml` via `yq`)
3. A version mismatch check runs in `prepareCmd` — the build fails if `package.json` doesn't match the release version
4. Plugin built to `packages/tv-plugin/dist/`
5. `scripts/deploy-to-stash-plugins.sh` deploys the built plugin to the `secondfolder/stash-plugins` repository (users install from there via Stash's plugin manager)

⚠️ Changing the release/versioning setup (`release.config.js`, version handling in `package.json` / `source.yml`) is an **ask first** area — releases are fully automated on merge to `main`.
