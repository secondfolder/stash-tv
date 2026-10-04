# App Updates

How the app notices that a new version of Stash TV has been installed, and how it reloads into it.

## Why the app can run an old version

Stash serves the app's files (`/plugin/stash-tv/assets/app/…`) with Go's `http.FileServer`, which sends `Last-Modified` but no `Cache-Control`. Browsers can then cache those files heuristically, for a time based on how long ago they were last modified. iOS web apps saved to the home screen cache them heavily and resume instead of relaunching, so after the plugin is updated in Stash a user can keep running the old build for a long time.

The JS and CSS that Vite builds have content-hashed filenames, so only `index.html` can actually be stale: a fresh `index.html` brings in the whole new build.

## New version check

`useNewVersionCheck()` (`src/hooks/useNewVersionCheck.ts`) compares two versions:

- **Running:** `import.meta.env.VITE_STASH_TV_VERSION`, set from `package.json` when the app is built.
- **Installed:** the `version` Stash reports for the `stash-tv` plugin in its GraphQL `plugins` query. It comes from the installed `stash-tv.yml`, which is built from `packages/tv-plugin/source.yml`. A release sets both files to the same version (see [release process](release-process.md)). Stash sends GraphQL responses with `Cache-Control: no-store`, and the query uses `fetchPolicy: "network-only"`, so this version is never stale.

If they differ, `NewVersionNotice` shows a notice with a **Reload** button and a close button. The check looks for any difference rather than a newer version, so it also covers a downgrade.

- The check runs when the app starts, when the page becomes visible again (`visibilitychange`), and when the page is restored from the back/forward cache (`pageshow` with `persisted`, which iOS uses).
- Checks are at least `newVersionCheckInterval` (60 s) apart, so switching between apps quickly doesn't send a query each time.
- The check doesn't run in dev (`import.meta.env.DEV`), or when the running version is the `0.0.0-version-set-when-releasing` placeholder of an unreleased build.
- Failed queries are only logged (`NewVersionCheck` logger, debug level).
- Dismissing the notice hides it for that version until the page reloads. A later check finding a different version shows it again.
- ⚠️ Stash reads `stash-tv.yml` only when it loads plugins. Updating through Stash's plugin manager reloads them. Editing the file by hand needs **Reload plugins** in Stash's settings before the check sees the change.

## Reloading

A plain `location.reload()` can be answered from the browser's cache with the old `index.html`. `reloadFromServer()` (`src/helpers/reloadFromServer.ts`) first fetches the page with `cache: "reload"`, which goes to the network and replaces the cached copy, and then reloads. It does this for both the current URL and the manifest's `start_url` (`.`, the app's folder), so the next launch from the home screen gets the new version too. If that fetch fails it reloads anyway.
