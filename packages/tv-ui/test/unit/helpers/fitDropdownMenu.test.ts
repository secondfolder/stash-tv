/**
 * Where dropdown menus in an action button's side panel open.
 *
 * @see docs/action-buttons.md § "`ActionButtonBase`"
 */

import { describe, expect, it } from "vitest";
import { chooseMenuFit } from "../../../src/helpers/fitDropdownMenu";

// A menu whose option list is 200px tall, plus 10px of padding around it
const menu = { listContentHeight: 200, menuChromeHeight: 10 };

describe("chooseMenuFit", () => {
  it("opens below the input when the menu fits there", () => {
    expect(chooseMenuFit({ ...menu, spaceAbove: 500, spaceBelow: 210 })).toEqual({ placement: "below", maxListHeight: 300 });
  });

  it("opens above the input when the menu only fits there", () => {
    expect(chooseMenuFit({ ...menu, spaceAbove: 210, spaceBelow: 209 })).toEqual({ placement: "above", maxListHeight: 300 });
  });

  it("shortens the menu to fit the side with more room when it fits on neither", () => {
    expect(chooseMenuFit({ ...menu, spaceAbove: 150, spaceBelow: 100 })).toEqual({ placement: "above", maxListHeight: 140 });
    expect(chooseMenuFit({ ...menu, spaceAbove: 100, spaceBelow: 150 })).toEqual({ placement: "below", maxListHeight: 140 });
  });

  it("only needs room for the menu at its maximum height when there are more options than fit", () => {
    const longMenu = { listContentHeight: 1000, menuChromeHeight: 10, preferredMaxListHeight: 300 };

    expect(chooseMenuFit({ ...longMenu, spaceAbove: 0, spaceBelow: 310 })).toEqual({ placement: "below", maxListHeight: 300 });
  });
});
