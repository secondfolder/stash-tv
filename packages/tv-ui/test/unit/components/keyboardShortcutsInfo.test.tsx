/**
 * The keyboard shortcut help only lists the rating shortcuts for Stash's
 * configured rating system.
 *
 * @see docs/keyboard-shortcuts.md § "Help text"
 */

import { describe, expect, it } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { RatingSystemType } from "stash-ui/dist/src/utils/rating";
import helpText from "../../../src/components/settings/KeyboardShortcutsInfo/KeyboardShortcutsInfo.md?raw";
import { KeyboardShortcutsInfo } from "../../../src/components/settings/KeyboardShortcutsInfo";
import { filterShortcutsForRatingSystem } from "../../../src/components/settings/KeyboardShortcutsInfo/filterShortcutsForRatingSystem";

// Assertions key off the shortcut sequences (each row's first cell) so rewording a description doesn't break them
const STAR_ROWS = ["| `r {1-5}` |", "| `r 0` |"];
const DECIMAL_ROWS = ["| `r {0-9} {0-9}` |", "| ``r ` `` |"];

describe("keyboard shortcut help rating filter", () => {
  it("shows only star rating shortcuts when Stash uses stars", () => {
    const filtered = filterShortcutsForRatingSystem(helpText, RatingSystemType.Stars);
    for (const row of STAR_ROWS) expect(filtered).toContain(row);
    for (const row of DECIMAL_ROWS) expect(filtered).not.toContain(row);
  });

  it("shows only decimal rating shortcuts when Stash uses decimal", () => {
    const filtered = filterShortcutsForRatingSystem(helpText, RatingSystemType.Decimal);
    for (const row of DECIMAL_ROWS) expect(filtered).toContain(row);
    for (const row of STAR_ROWS) expect(filtered).not.toContain(row);
  });

  it("keeps untagged shortcuts and strips the rating-system tags", () => {
    const filtered = filterShortcutsForRatingSystem(helpText, RatingSystemType.Stars);
    expect(filtered).toContain("| `d` |");
    expect(filtered).not.toContain("rating-system");
  });
});

describe("KeyboardShortcutsInfo", () => {
  it("renders the filtered help text, defaulting to star ratings when Stash has no rating config", async () => {
    render(<KeyboardShortcutsInfo show onHide={() => {}} />);

    expect(await screen.findByText("r {1-5}")).toBeInTheDocument();
    expect(screen.queryByText("r {0-9} {0-9}")).not.toBeInTheDocument();
  });
});
