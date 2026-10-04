/**
 * Hooks and middleware added to Video.js (one instance shared by every copy of our modules) are replaced, not added
 * again, when the module adding them is evaluated again.
 *
 * @see docs/video-player.md § "Architecture"
 */

import { describe, expect, it, vi } from "vitest";
import videojs from "video.js";

/** A fresh copy of the module, as after a hot reload or another integration test boot */
async function freshGlobalAdditions() {
  vi.resetModules();
  return await import("../../../src/components/ScenePlayer/video.js/global-additions");
}

describe("addVideoJsHook", () => {
  it("runs only the hook added last under a key, however many copies of the module added one", async () => {
    const hooksBefore = videojs.hooks("beforeerror").length;
    const first = vi.fn((_player: unknown, error: unknown) => error);
    const second = vi.fn((_player: unknown, error: unknown) => `handled ${error}`);

    (await freshGlobalAdditions()).addVideoJsHook("test-key", "beforeerror", first);
    (await freshGlobalAdditions()).addVideoJsHook("test-key", "beforeerror", second);

    const hooks = videojs.hooks("beforeerror");
    expect(hooks).toHaveLength(hooksBefore + 1);
    // Video.js types hooks as taking no arguments, but calls beforeerror hooks with the player and the error
    expect(Reflect.apply(hooks[hooks.length - 1], undefined, [null, "an error"])).toBe("handled an error");
    expect(first).not.toHaveBeenCalled();
  });

  it("keeps hooks added under different keys", async () => {
    const hooksBefore = videojs.hooks("beforeerror").length;
    const { addVideoJsHook } = await freshGlobalAdditions();

    addVideoJsHook("test-key-a", "beforeerror", (_player, error) => error);
    addVideoJsHook("test-key-b", "beforeerror", (_player, error) => error);

    expect(videojs.hooks("beforeerror")).toHaveLength(hooksBefore + 2);
  });
});
