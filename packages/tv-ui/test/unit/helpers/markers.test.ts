/**
 * Choosing which existing marker the create-marker button's panel offers for editing first.
 *
 * @see docs/action-buttons.md § "Create-Marker Button"
 */

import { describe, expect, it } from "vitest";
import { defaultMarkerToEdit, markerLabel, sortMarkersByStartTime } from "../../../src/helpers/markers";

const now = Date.parse("2026-10-01T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(now - minutes * 60 * 1000).toISOString();
const longAgo = "2024-01-01T00:00:00Z";

function marker(id: string, seconds: number, created_at = longAgo) {
  return { id, seconds, created_at };
}

describe("defaultMarkerToEdit", () => {
  it("picks the most recently added marker when it was added in the last 10 minutes", () => {
    const markers = [marker("a", 10, minutesAgo(8)), marker("b", 50, minutesAgo(3)), marker("c", 20)];

    expect(defaultMarkerToEdit(markers, { playerPosition: 20, now })?.id).toBe("b");
  });

  it("picks the marker closest to the playhead when none were added in the last 10 minutes", () => {
    const markers = [marker("a", 10, minutesAgo(11)), marker("b", 50), marker("c", 32)];

    expect(defaultMarkerToEdit(markers, { playerPosition: 40, now })?.id).toBe("c");
  });

  it("counts a marker ahead of the playhead as close as one behind it", () => {
    const markers = [marker("behind", 30), marker("ahead", 42)];

    expect(defaultMarkerToEdit(markers, { playerPosition: 40, now })?.id).toBe("ahead");
  });

  it("returns nothing for a scene without markers", () => {
    expect(defaultMarkerToEdit([], { playerPosition: 0, now })).toBeUndefined();
  });
});

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
