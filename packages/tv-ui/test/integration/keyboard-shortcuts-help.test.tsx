/**
 * The keyboard shortcut list opens from the settings. (`?` opening it is unit tested, in
 * test/unit/hooks/useShortcutListKey.test.tsx.)
 *
 * @see docs/keyboard-shortcuts.md § "Help text"
 */

import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { setupIntegrationTest, bootApp } from "./helpers/harness";

setupIntegrationTest();

describe("Keyboard shortcuts help", () => {
  it("opens the keyboard shortcut list from the settings button", async () => {
    const app = await bootApp();

    // fireEvent rather than userEvent: userEvent defines `detail` on its click events as a non-configurable property,
    // which makes MediaSlide's use-gesture workaround (redefining `detail` on every click) throw. Real clicks don't.
    fireEvent.click(screen.getByRole("button", { name: "Show Keyboard Shortcuts" }));

    expect(await screen.findByRole("dialog", { name: "Keyboard Shortcuts" })).toBeInTheDocument();

    await app.unmount();
  });
});
