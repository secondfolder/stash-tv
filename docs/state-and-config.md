# State Management & Configuration

**Read this when:** touching any Zustand store (`src/store/`), adding a config option, or changing how settings persist.

---

## Stores (`src/store/`)

| Store | Persistence | Purpose |
|---|---|---|
| `tvConfig.ts` | Hybrid (Stash plugin config + localStorage) | User preferences & plugin settings: volume, subtitles, playback rate, CRT effect, UI layout, page size, media filters, dev options |
| `globalState.ts` | None (transient) | UI toggles: settings panel, scene info, fullscreen, `tvConfigLoaded` flag |
| `mediaItemState.tsx` / accumulator store | None | Media pagination state — see `docs/media-loading.md` |

Every store exposes the same typed `set` / `get` / `setToDefault` / `getDefault` API.

### The Typed Setter Pattern (critical)

Store mutations go through the typed setter methods, never direct state modification:

```ts
// ✅ CORRECT — use the typed setter (type-checks the value and, for tvConfig, routes persistence correctly)
const { set, get } = useTvConfig();
set("volume", 0.5);
set("volume", (prev) => Math.min(prev + 0.1, 1));
const current = get("volume");

// ❌ WRONG — calling Zustand's setState directly bypasses type safety and the
// hybrid storage routing
useTvConfig.setState({ volume: 0.5 });
```

### The `tvConfigLoaded` Guard

🚫 Never modify global state before `tvConfigLoaded` is true. `globalState`'s setters warn and no-op if called pre-init; `App.tsx` renders nothing until the config has loaded.

---

## Hybrid Storage

`tvConfig` persists to **two backends**, split per key by the `createHybridStorage` in `tvConfig.ts`:

- **Stash plugin config** (via `stashConfigStorage`, stored in the Stash database) — everything by default. Syncs user preferences across devices.
- **Browser localStorage** (suffixed `-local`) — keys listed in `localStorageKeys`, currently just `forceLandscape`. Device-specific settings that shouldn't sync across devices.

⚠️ **Not all config keys persist to the same backend.** Check `localStorageKeys` before assuming where a key lives. Changing which backend an existing key uses can affect users' saved settings — ask first.

## Adding a New Configuration Option

1. Add to the `TvConfig` type in `src/store/tvConfig.ts`
2. Add a default value in the `defaults` object
3. Decide the storage backend — add to `localStorageKeys` only if device-specific
4. Create a UI control in the settings panel (`src/components/settings/`)
5. Access via `useTvConfig()` in components
6. Add tests for the new config option (see [Testing](docs/testing.md))

## Why These Decisions

- **Zustand (not Redux):** less boilerplate, better TypeScript ergonomics at this scale
- **Hybrid storage:** Stash config syncs preferences across devices; localStorage holds device-specific settings (e.g. forced landscape)
- **Typed setters:** type safety + automatic persistence routing

## Related docs

- [Testing](docs/testing.md) — How to test config persistence and state management
- [Media loading](docs/media-loading.md) — Media pagination via accumulator store
- [Release process](docs/release-process.md) — Versioning and deployment flow
