import videojs, { type VideoJsPlayer } from "video.js";

/**
 * Additions to Video.js itself (its lifecycle hooks and middleware) that are replaced, not added again, when the module
 * adding them is evaluated again.
 *
 * Video.js is one instance shared by every copy of our modules. Modules add hooks and middleware to it as they're
 * evaluated, so a module evaluated again adds them again: on each hot reload in development, and on each boot in the
 * integration tests, which import the app afresh. Every copy then ran on every player from then on. Video.js can't
 * remove middleware, so instead the first copy added under a key calls whichever copy was added last.
 */

// Kept on Video.js itself so that it's shared by every copy of this module too
const latestAdditionsKey = Symbol.for("stash-tv.videojs-latest-additions");
type VideoJsWithAdditions = typeof videojs & { [latestAdditionsKey]?: Map<string, Function> };
const latestAdditions = ((videojs as VideoJsWithAdditions)[latestAdditionsKey] ??= new Map());

/** Make `fn` the latest addition under `key`, returning a function that calls the latest one if it's the first */
function delegateToLatest<Fn extends (this: unknown, ...args: never[]) => unknown>(key: string, fn: Fn): Fn | undefined {
  const isFirst = !latestAdditions.has(key);
  latestAdditions.set(key, fn);
  if (!isFirst) return undefined;
  return function (this: unknown, ...args: Parameters<Fn>) {
    return latestAdditions.get(key)!.apply(this, args);
  } as Fn;
}

type BeforeErrorHook = (player: VideoJsPlayer, error: unknown) => unknown;

/** Add a hook to a Video.js lifecycle (`videojs.hook()`), replacing the one added under the same key before */
export function addVideoJsHook(key: string, type: "setup", fn: videojs.Hook.Setup): void;
export function addVideoJsHook(key: string, type: "beforesetup", fn: videojs.Hook.BeforeSetup): void;
export function addVideoJsHook(key: string, type: "beforeerror", fn: BeforeErrorHook): void;
export function addVideoJsHook(
  key: string,
  type: "setup" | "beforesetup" | "beforeerror",
  fn: videojs.Hook.Setup | videojs.Hook.BeforeSetup | BeforeErrorHook
) {
  const delegate = delegateToLatest(`hook:${type}:${key}`, fn);
  // Video.js's hook arguments aren't typed beyond setup and beforesetup, so its general `hooks()` takes no arguments
  if (delegate) videojs.hooks(type, delegate as () => unknown);
}

/** Add middleware to Video.js (`videojs.use()`), replacing the one added under the same key before */
export function useVideoJsMiddleware(key: string, type: string, middleware: Parameters<typeof videojs.use>[1]) {
  const delegate = delegateToLatest(`middleware:${type}:${key}`, middleware);
  if (delegate) videojs.use(type, delegate);
}
