# The `stash-ui` Package (Reusing Stash Frontend Code)

**Read this when:** integrating a Stash component into tv-ui, creating/modifying wrappers or patches, or running the stash-ui build scripts.

---

## Purpose

`packages/stash-ui` extracts and wraps the frontend code of Stash for reuse in Stash TV. This exists because Stash is a third-party app, so we can't easily change the components of it we want to use. The package serves two roles:

1. Provide an easy-to-import interface for Stash TV
2. Add small, **generic** tweaks/fixes to Stash components — ones applicable to *any* project wanting to use Stash's interface

Any change too specific to Stash TV does **not** belong here — put it in the Stash TV project instead: either where the component is used directly, or in a separate tv-ui wrapper component tied to that Stash component.

**Prefer wrappers over patches** for Stash components, but sometimes only a patch is feasible.

## Structure

- `stash/` — a copy of the Stash repository (excluded from root tsconfig)
- `wrappers/` — re-export wrappers for selected Stash components
- `patches/` — patches applied to Stash code (e.g. `scene-player-utils.ts` for tracking the active video player — see `docs/video-player.md`; `stash-tv.patch` also fixes `useRatingKeybinds`' overlapping sequence timeouts — see `docs/keyboard-shortcuts.md` — adds `MenuShouldScrollIntoViewContext` to Stash's shared selects (`Shared/FilterSelect.tsx`, `Shared/Select.tsx`) — see `docs/action-buttons.md` — and moves `IStringListProps` in `utils/form.tsx` to module scope, as our build emits declarations and `formikUtils`' return type can't name an interface declared inside it)
- ⚠️ `patches/scene-player-utils.ts` replaces Stash's `ScenePlayer/util.ts` wholesale during the build, so it must keep every export upstream's has (e.g. `getPlayer`, `getAbLoopPlugin`). A new Stash version that adds one fails the build with `has no exported member`; copy it across.
- Our GraphQL operations (`stash-tv.graphql`) must have names Stash doesn't use, or codegen fails with "Not all operations have an unique name". Suffix them `ForTv` (Stash added its own `FindFullScenes`, so ours is `FindFullScenesForTv`).
- To change a patched Stash file: edit it under `stash/`, `git add` it inside `stash/` (`update-patch.sh` diffs only staged changes), run `yarn --cwd packages/stash-ui update:patch`, unstage it, then `yarn --cwd packages/stash-ui build`
- ⚠️ A patch can't add a new file other than `ui/v2.5/graphql/stash-tv.graphql`: `setup.sh` deletes only that file before applying the patch, so any other new file is left behind by a previous setup and the next `git apply` fails. Put new code in an existing Stash file (as `MenuShouldScrollIntoViewContext` lives in `FilterSelect.tsx`).
- ⚠️ `update-patch.sh` regenerates the whole patch from what's staged, so stage **every** file the patch touches, not just the one you changed, or their hunks are dropped. Check your `stash/` checkout has the current patch applied first (`git -C packages/stash-ui/stash status` should list the patched files). `setup.sh` applies it once, so a checkout made before a later patch change is missing that change, and so is a `dist/` built from it.
- `dist/` — built TypeScript definitions and components from Stash
- `compile-sass.ts` compiles each of Stash's stylesheets to its own CSS file, with Stash's theme variables, Bootstrap's functions/variables/mixins and the variables `index.scss` declares (e.g. `$sidebar-width`) put in front of each, since in Stash they come from `index.scss` importing everything. Sass prints many deprecation warnings for Bootstrap 4's `@import`s and colour functions; Stash's own build does too.
- `scripts/` — `setup.sh` (initial setup), `build.sh` (build), `ensure-ready.sh` (setup/build only if needed), `fingerprint.sh` (input hashing shared by the others), `update-patch.sh` (update patches), `import-stash-ui-deps.sh` (import dependencies)

## Automatic Setup & Build

Root `yarn dev` runs `ensure-ready.sh`, which reruns `setup.sh` and/or `build.sh` only when their inputs changed, so a fresh clone or a pull that changes the Stash version or a patch needs no manual step.

- Each step records a hash of its inputs when it succeeds (`git hash-object`, so it behaves the same on macOS and Linux): `setup.sh` writes `.local/setup-stamp`, `build.sh` writes `dist/.build-stamp`. Hash functions live in `fingerprint.sh`.
- **Setup inputs:** `setup.sh` (holds the pinned Stash version, `STASH_VERSION`: a tag or a commit, currently a commit on Stash's `develop`; and the latest release, `STASH_RELEASE_VERSION`, whose schema it extracts to `release-schema/`, see [Stash compatibility](stash-compatibility.md)), `patches/stash-tv.patch`, `stash/ui/v2.5/pnpm-lock.yaml`. Setup also runs if the submodule, Stash's `node_modules` or `release-schema/` is missing.
- ⚠️ Stash's UI installs and runs its tooling with **pnpm** (pinned by its `packageManager` field), so `setup.sh`, `generate-ql.sh` and `compile-ts.sh` use pnpm inside `stash/ui/v2.5`. Our own workspace stays on yarn. CI installs pnpm with `pnpm/action-setup`.
- **Updating Stash:** set `STASH_VERSION` in `setup.sh`, point the submodule at the same commit (`git add packages/stash-ui/stash`), rebase the patch onto it (`git apply --3way` in a scratch worktree, then `update:patch`), run `setup` and `build`, then `import-stash-ui-deps` and `yarn install`. The import script only adds and bumps, so delete dependencies Stash dropped by hand. Also pin mock-stash's conformance image (the `pinned` one in `STASH_IMAGES`, in `packages/mock-stash/test/conformance/real-stash.ts`) to the same Stash, by digest for a develop commit, and give new non-null schema fields values in mock-stash (its meta tests fail with "Cannot return null for non-nullable field" until they have one). Then check it works with the latest release too: [Stash compatibility](stash-compatibility.md). `setup.sh` resets `stash/` before switching commits, as `git submodule update` won't switch with the patch applied.
- **Build inputs:** the setup inputs, the state of the `stash/` checkout (commit + all uncommitted changes), `patches/scene-player-utils.ts`, `theme-vars-as-css-vars.scss` and the build scripts. Editing a Stash file under `stash/` therefore triggers a rebuild on the next `yarn dev`.
- ⚠️ `setup.sh` does `git reset --hard` inside `stash/`, so `ensure-ready.sh` won't run it automatically when `stash/` has changes setup didn't make (checked against the tree hash in `.local/setup-stamp`). It warns and only rebuilds; save your edits with `update:patch` and run `setup` yourself. With no stamp yet, changes are tolerated only in files the patch touches, and are backed up to `.local/stash-backup-<timestamp>/` before the reset.
- `update-patch.sh` refreshes `.local/setup-stamp`, since after it the checkout matches the new patch. Without that, the next `yarn dev` would see a changed patch plus a "locally edited" checkout and refuse to set up.
- When adding a file that `setup.sh` or `build.sh` reads, add it to the matching fingerprint in `fingerprint.sh`, or changes to it won't trigger a rerun.
- `yarn build`, `yarn test`, `yarn storybook` and `yarn typecheck` don't run `ensure-ready.sh`. `yarn build` always rebuilds `dist/` but never runs setup.

⚠️ Modifying `patches/` or re-running the extraction/build scripts is an **ask first** area.

## Import Rules

```ts
// ✅ CORRECT — import Stash components via their wrapper
import ScenePlayerOriginal from "stash-ui/wrappers/components/ScenePlayer";
import { TagSelect } from "stash-ui/wrappers/components/TagSelect";

// ❌ WRONG — importing a component directly from the Stash dist build
import ScenePlayerOriginal from "stash-ui/dist/src/components/ScenePlayer/ScenePlayer";
```

(Exception: generated GraphQL types and non-component hooks/utilities are imported from `stash-ui/dist/src/...` — e.g. `stash-ui/dist/src/core/generated-graphql` — as there is nothing to wrap.)

## Wrapper Customisations

- Components with react-router `Link`s in them (Stash's selects and cards, e.g. `TagSelect`, `TagCard`) are rendered in `wrappers/helpers/WithBrowserRouter`, as a `Link` needs a router. Where those links go once clicked is up to tv-ui (e.g. entity popovers open them in Stash, see [entity popovers](entity-popovers.md) § "Cards").
- `wrappers/components/shared/RatingSystem` — with stars, shows "Clear" where the rating's shown while the current rating's star is hovered (Stash shows nothing there then: ⚠️ older Stash versions leave out their `.star-rating-number`, newer ones render it empty, so the CSS goes by `:empty` rather than whether it's there), shows nothing beside the stars without a rating they show (none, or one too small for a star at their precision, e.g. given out of 10 then shown as stars; it goes by `convertToRatingFormat`, as the stars do), not even the rating a hovered star would give, and `valueSide` puts the rating (and "Clear") before or after the stars. The space either side of each star grows faster than the stars as they get bigger (0.1em at 1rem, 0.2em at 1.5rem: `0.4em - 0.3rem`). With the decimal system it renders our `RatingNumber` wrapper.

## Integrating a Stash Component

1. Check if a wrapper already exists in `packages/stash-ui/wrappers/components/`
2. If not, create a wrapper that re-exports the component + imports its styles (see `wrappers/components/ScenePlayer.tsx` for the pattern)
3. Import from the wrapper in tv-ui code — never from dist
4. Document any customizations or adjustments made

## Where Changes to a Stash Component Go

🚫 Never copy Stash code into tv-ui, and never add purely custom components to the stash-ui package — everything in it must wrap actual Stash code.

In order of preference:

1. **Wrapper in the stash-ui package** — for any change not specific to Stash TV. If the change isn't feasible to apply via a wrapper, use a **patch** instead.
2. **Wrapper component in tv-ui for that Stash component** — for changes more specific to Stash TV that we still want abstracted from the tv-ui code using the component (e.g. `tv-ui/src/components/ScenePlayer` wraps `stash-ui/wrappers/components/ScenePlayer`).
3. **Change the component at its usage site in tv-ui** — when the change is specific enough that a wrapper isn't justified.
