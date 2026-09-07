/**
 * Media items modifier function integration tests.
 *
 * Tests the custom media modifier feature: a user-supplied JavaScript function
 * (stored as a string) that transforms the media list before display. With dev
 * options enabled, setting a filter function should remove non-matching scenes
 * from the feed DOM.
 *
 * @see docs/media-loading.md § "Media items modifier"
 */

import { describe, expect, it } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { setupIntegrationTest, bootApp } from "./helpers/harness";

const integration = setupIntegrationTest();

// Keeps only odd-numbered fixture scenes (scene-1/3/5/7)
const ODD_SCENES_MODIFIER = "(items) => items.filter(item => item.id.endsWith('1') || item.id.endsWith('3') || item.id.endsWith('5') || item.id.endsWith('7'))";

describe("Media items modifier function integration", () => {
  it("filters the feed using the configured modifier function", async () => {
    const app = await bootApp();

    // The unmodified first page renders both odd and even scenes
    const initialContent = app.rendered.container.textContent ?? "";
    expect(initialContent).toContain("Aurora Ascending"); // scene-1
    expect(initialContent).toContain("Blueprint Boulevard"); // scene-2

    const { useTvConfig } = await import("../../src/store/tvConfig");
    const { set: setTvConfig } = useTvConfig.getState();

    await act(async () => {
      setTvConfig("showDevOptions", true);
      setTvConfig("mediaItemsModifierFunction", ODD_SCENES_MODIFIER);
    });

    // The modifier only runs with dev options enabled: even-numbered scenes
    // should disappear from the feed, odd ones remain
    await waitFor(
      () => {
        const content = app.rendered.container.textContent ?? "";
        expect(content).not.toContain("Blueprint Boulevard"); // scene-2
        expect(content).not.toContain("Foothill Flight"); // scene-6
      },
      { timeout: 5000 }
    );
    const content = app.rendered.container.textContent ?? "";
    expect(content).toContain("Aurora Ascending"); // scene-1
    expect(content).toContain("Cascade Calm"); // scene-3

    await app.unmount();
  });
});
