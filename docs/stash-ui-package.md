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
- `patches/` — patches applied to Stash code (e.g. `scene-player-utils.ts` for tracking the active video player — see `docs/video-player.md`)
- `dist/` — built TypeScript definitions and components from Stash
- `scripts/` — `setup.sh` (initial setup), `build.sh` (build), `update-patch.sh` (update patches), `import-stash-ui-deps.sh` (import dependencies)

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
