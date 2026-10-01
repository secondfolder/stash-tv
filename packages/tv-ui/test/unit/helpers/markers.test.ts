/**
 * How the create-marker button's panels list a scene's markers.
 *
 * @see docs/action-buttons.md § "Create-Marker Button"
 */

import { describe, expect, it } from "vitest";
import { markerLabel, sortMarkersByStartTime } from "../../../src/helpers/markers";

function marker(id: string, seconds: number) {
  return { id, seconds };
}

describe("sortMarkersByStartTime", () => {
  it("orders markers by start time without changing the original list", () => {
    const markers = [marker("late", 30), marker("early", 5), marker("middle", 12)];

    expect(sortMarkersByStartTime(markers).map((m) => m.id)).toEqual(["early", "middle", "late"]);
    expect(markers.map((m) => m.id)).toEqual(["late", "early", "middle"]);
  });
});

describe("markerLabel", () => {
  it("shows the start time and title", () => {
    expect(markerLabel({ seconds: 65, title: "Intro", primary_tag: { id: "1", name: "Alpha" } })).toBe("1:05 Intro");
  });

  it("falls back to the primary tag's name for an untitled marker", () => {
    expect(markerLabel({ seconds: 3, title: "", primary_tag: { id: "1", name: "Alpha" } })).toBe("0:03 Alpha");
  });
});
