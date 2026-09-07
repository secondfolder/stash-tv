import { useGlobalState } from "../../../src/store/globalState";
import { useTvConfig } from "../../../src/store/tvConfig";

/**
 * Shared helpers for store unit tests.
 *
 * Production code must never call `useStore.setState` directly (see AGENTS.md —
 * it bypasses the typed setters and, for tvConfig, the persistence routing).
 * Tests are the one sanctioned exception, because resetting to a known state is
 * exactly what the raw API is for. Keep that exception HERE so each test file
 * doesn't reinvent it — and so it uses `getInitialState()` (typed) instead of
 * `@ts-expect-error` key loops.
 */

/** Reset globalState to its initial state, then unlock the tvConfigLoaded gate. */
export function resetGlobalState({ tvConfigLoaded = true } = {}) {
  useGlobalState.setState(useGlobalState.getInitialState(), true);
  // The initial state has tvConfigLoaded: false, which blocks all typed setters.
  // Use the typed setter (the guard explicitly allows tvConfigLoaded itself).
  useGlobalState.getState().set("tvConfigLoaded", tvConfigLoaded);
}

/** Reset tvConfig to its initial state (defaults). Requires the gate to be open. */
export function resetTvConfig() {
  useTvConfig.setState(useTvConfig.getInitialState(), true);
}

/**
 * Toggle the tvConfigLoaded gate using the typed setter (the guard explicitly
 * allows setting tvConfigLoaded itself). Use this in gating tests instead of
 * raw `setState`.
 */
export function setTvConfigLoaded(loaded: boolean) {
  useGlobalState.getState().set("tvConfigLoaded", loaded);
}

/** Convenience: reset both stores to a clean, gate-open state. */
export function resetStores() {
  resetTvConfig();
  resetGlobalState();
}
