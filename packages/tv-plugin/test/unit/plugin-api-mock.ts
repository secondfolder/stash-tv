/**
 * Mock PluginApi for tv-plugin testing
 *
 * Simulates the Stash PluginApi interface the plugin expects at
 * `window.PluginApi`: React, libraries, GQL hooks/documents, patch
 * registration, and the Apollo client from StashService.
 *
 * Tests exercise the real `main.tsx` against this mock.
 */

import { vi } from "vitest";

export type PatchType = "instead" | "before";

export interface RegisteredPatch {
  type: PatchType;
  target: string;
  implementation: (...args: unknown[]) => unknown;
}

/** Minimal React element shape produced by the createElement mock. */
export interface MockReactElement {
  type: unknown;
  props: {
    children?: unknown;
    [key: string]: unknown;
  };
}

/**
 * A React mock whose hooks behave statefully enough to drive the plugin's
 * function components as plain functions.
 *
 * - Call `beginRender()` before each invocation of the component so `useState`
 *   re-reads the slots allocated on the first render; state persists across
 *   renders until `resetRenderState()` is called.
 * - `useEffect` collects callbacks; tests run them via `runEffects()`.
 * - `useMemo` invokes its callback (recomputed per render — memoization is an
 *   optimization, not behavior).
 * - `createElement` returns plain objects (`{ type, props }`).
 */
export function createReactMock() {
  const stateSlots: unknown[] = [];
  let hookCursor = 0;

  const createElement = vi.fn(
    (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): MockReactElement => ({
      type,
      props: {
        ...(props ?? {}),
        ...(children.length > 0 ? { children: children.length === 1 ? children[0] : children } : {}),
      },
    })
  );

  const useState = vi.fn(<T,>(initial: T | (() => T)) => {
    const index = hookCursor++;
    stateSlots[index] ??= typeof initial === "function" ? (initial as () => T)() : initial;
    const setState = (value: unknown) => {
      stateSlots[index] =
        typeof value === "function" ? (value as (prev: T) => T)(stateSlots[index] as T) : value;
    };
    return [stateSlots[index], setState] as const;
  });

  const effects: (() => void)[] = [];
  const useEffect = vi.fn((effect: () => void) => {
    effects.push(effect);
  });

  const useMemo = vi.fn(<T,>(fn: () => T) => fn());

  return {
    createElement,
    Fragment: "Fragment",
    useState,
    useEffect,
    useMemo,
    /** Reset the hook cursor so the next component invocation re-reads existing slots. */
    beginRender: () => {
      hookCursor = 0;
    },
    /** Clear hook state so the next component invocation starts fresh. */
    resetRenderState: () => {
      stateSlots.length = 0;
      hookCursor = 0;
      effects.length = 0;
    },
    /** Read the current hook state slots (for debugging). */
    debugState: () => [...stateSlots],
    /** Run the callbacks registered by useEffect during the last render. */
    runEffects: () => {
      for (const effect of [...effects]) effect();
      effects.length = 0;
    },
  };
}

/**
 * Creates the complete PluginApi mock. Returns the mock plus typed handles
 * for assertions.
 */
export function createPluginApiMock() {
  const react = createReactMock();

  const mutate = vi.fn().mockResolvedValue({});
  const query = vi.fn().mockResolvedValue({
    data: {
      configuration: {
        plugins: { "stash-tv": {} },
        interface: { menuItems: [] },
      },
    },
  });

  const Button = (props: { children?: unknown; onClick?: () => void; variant?: string }) => props;

  const patches: RegisteredPatch[] = [];
  const patch = {
    instead: vi.fn((target: string, implementation: (...args: unknown[]) => unknown) => {
      patches.push({ type: "instead" as const, target, implementation });
    }),
    before: vi.fn((target: string, implementation: (...args: unknown[]) => unknown) => {
      patches.push({ type: "before" as const, target, implementation });
    }),
  };

  const useConfigurationQuery = vi.fn<(data?: unknown, loading?: boolean) => { data: unknown; loading: boolean }>(
    () => ({ data: undefined, loading: true })
  );

  const pluginApi = {
    React: react,
    libraries: {
      Bootstrap: { Button },
      FontAwesomeSolid: {
        faCheck: { iconName: "check", prefix: "fas" },
        faTelevision: { iconName: "television", prefix: "fas" },
      },
    },
    utils: {
      StashService: {
        getClient: () => ({ query, mutate }),
      },
    },
    GQL: {
      useConfigurationQuery,
      ConfigurePluginDocument: "ConfigurePluginDocument",
      ConfigureInterfaceDocument: "ConfigureInterfaceDocument",
      ConfigurationDocument: "ConfigurationDocument",
    },
    patch,
  };

  return {
    pluginApi,
    /** Assertable handles. */
    query,
    mutate,
    useConfigurationQuery,
    react,
    /** All patches registered by the plugin, in registration order. */
    patches,
    /** Get the single registered implementation for a patch target. */
    patchFor: (target: string) => {
      const registered = patches.filter((p) => p.target === target);
      if (registered.length !== 1) {
        throw new Error(
          `Expected exactly one patch registered for ${target}, found ${registered.length}`
        );
      }
      return registered[0];
    },
  };
}

export type PluginApiMock = ReturnType<typeof createPluginApiMock>;

/**
 * The arguments Stash's `PatchFunction` passes an "after" patch for an "instead" patch's result:
 * `args.concat(result)`, which spreads a result that's an array. Another plugin's after patch takes the rendered
 * element from the last of them, so a patch must return a single element for that to be the whole render.
 */
export function afterPatchArgs(args: unknown[], result: unknown): unknown[] {
  return args.concat(result);
}
