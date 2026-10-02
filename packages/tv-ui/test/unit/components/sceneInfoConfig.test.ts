import { describe, expect, it } from "vitest";
import {
  fieldsNotInLayout,
  getDropTarget,
  getSlotNearGhost,
  getSlotByMidpoints,
  noValueLabel,
  getSlotOnArrival,
  preferVacatedLine,
  placeField,
  sideAt,
  startsRow,
  type Rect,
} from "../../../src/components/slide/SceneInfo/scene-info-config";

/** @see docs/scene-info-panel.md § "Moving fields" */
describe("placing a field in the scene info panel's layout", () => {
  const layout = [["studio"], ["title", "date"], ["performers"]];

  it("moves a field beside another on the same line", () => {
    expect(placeField(layout, "performers", { line: 2, index: 0 }, { type: "same-line", line: 1, index: 1, right: false }))
      .toEqual([["studio"], ["title", "performers", "date"]]);
  });

  it("moves a field later along its own line", () => {
    expect(placeField(layout, "title", { line: 1, index: 0 }, { type: "same-line", line: 1, index: 2, right: false }))
      .toEqual([["studio"], ["date", "title"], ["performers"]]);
  });

  it("moves a field onto a new line, removing the line it leaves empty", () => {
    expect(placeField(layout, "studio", { line: 0, index: 0 }, { type: "new-line", line: 3, right: false }))
      .toEqual([["title", "date"], ["performers"], ["studio"]]);
  });

  it("keeps the line a field leaves empty when asked to, as the editor does while it's dragged", () => {
    expect(placeField(layout, "studio", { line: 0, index: 0 }, { type: "same-line", line: 1, index: 0, right: false }, { keepEmptyLines: true }))
      .toEqual([[], ["studio", "title", "date"], ["performers"]]);
  });

  it("splits a field off onto a new line between two lines", () => {
    expect(placeField(layout, "date", { line: 1, index: 1 }, { type: "new-line", line: 1, right: false }))
      .toEqual([["studio"], ["date"], ["title"], ["performers"]]);
  });

  it("adds a field that isn't in the layout yet", () => {
    expect(placeField(layout, "tags", null, { type: "same-line", line: 0, index: 0, right: false }))
      .toEqual([["tags", "studio"], ["title", "date"], ["performers"]]);
  });

  it("removes a field", () => {
    expect(placeField(layout, "date", { line: 1, index: 1 }, { type: "remove" }))
      .toEqual([["studio"], ["title"], ["performers"]]);
  });

  it("keeps fields it doesn't know, so a newer Stash TV using the same Stash server doesn't lose them", () => {
    expect(placeField([["from-a-newer-version", "date"]], "date", { line: 0, index: 1 }, { type: "new-line", line: 0, right: false }))
      .toEqual([["date"], ["from-a-newer-version"]]);
  });

  it("right-aligns a field, keeping a line with none as a plain list", () => {
    expect(placeField(layout, "performers", { line: 2, index: 0 }, { type: "same-line", line: 1, index: 2, right: true }))
      .toEqual([["studio"], { left: ["title", "date"], right: ["performers"] }]);
    expect(placeField(layout, "studio", { line: 0, index: 0 }, { type: "new-line", line: 3, right: true }))
      .toEqual([["title", "date"], ["performers"], { left: [], right: ["studio"] }]);
  });

  it("goes at the end of a line's left fields, or the start of its right-aligned ones, between the two", () => {
    const aligned = [{ left: ["title"], right: ["date"] }];
    expect(placeField(aligned, "tags", null, { type: "same-line", line: 0, index: 1, right: false }))
      .toEqual([{ left: ["title", "tags"], right: ["date"] }]);
    expect(placeField(aligned, "tags", null, { type: "same-line", line: 0, index: 1, right: true }))
      .toEqual([{ left: ["title"], right: ["tags", "date"] }]);
  });

  it("goes back to a plain list once a line has no right-aligned fields", () => {
    expect(placeField([{ left: ["title"], right: ["date"] }], "date", { line: 0, index: 1 }, { type: "same-line", line: 0, index: 0, right: false }))
      .toEqual([["date", "title"]]);
  });

  it("offers only the fields that aren't in the layout to add", () => {
    const notInLayout = fieldsNotInLayout(layout);
    expect(notInLayout).toContain("tags");
    expect(notInLayout).not.toContain("title");
    expect(fieldsNotInLayout([{ left: [], right: ["tags"] }])).not.toContain("tags");
  });
});

/** @see docs/scene-info-panel.md § "Moving fields" */
describe("which line a dragged field is dropped on", () => {
  const rect = (left: number, right: number, top: number, bottom: number): Rect => ({ left, right, top, bottom });
  // Two 20px-high lines 10px apart, 300px wide
  const lines = [{ rect: rect(0, 300, 0, 20) }, { rect: rect(0, 300, 30, 50) }];
  const centre = 150;

  it("goes on the line it's over", () => {
    expect(getDropTarget({ x: 70, y: 10 }, lines, centre)).toEqual({ type: "same-line", line: 0 });
    expect(getDropTarget({ x: 250, y: 40 }, lines, centre)).toEqual({ type: "same-line", line: 1 });
  });

  it("goes on a new line when between two lines", () => {
    expect(getDropTarget({ x: 20, y: 25 }, lines, centre)).toEqual({ type: "new-line", line: 1, right: false });
  });

  it("right-aligns a new line when the pointer's over the right half of the lines", () => {
    expect(getDropTarget({ x: 200, y: 25 }, lines, centre)).toEqual({ type: "new-line", line: 1, right: true });
  });

  it("goes on a new line when near the top edge of a line", () => {
    expect(getDropTarget({ x: 20, y: 1 }, lines, centre)).toEqual({ type: "new-line", line: 0, right: false });
  });

  it("goes on the line just inside its edge", () => {
    expect(getDropTarget({ x: 20, y: 3 }, lines, centre)).toEqual({ type: "same-line", line: 0 });
  });

  it("goes on a new line at the bottom when below every line", () => {
    expect(getDropTarget({ x: 20, y: 200 }, lines, centre)).toEqual({ type: "new-line", line: 2, right: false });
  });

  it("goes on the first line when there are no lines", () => {
    expect(getDropTarget({ x: 20, y: 20 }, [], centre)).toEqual({ type: "new-line", line: 0, right: false });
  });
});

/** @see docs/scene-info-panel.md § "Moving fields" */
describe("which side of a line a dragged field goes on", () => {
  const rect = (left: number, right: number): Rect => ({ left, right, top: 0, bottom: 20 });
  const line = { left: 0, right: 300 };

  describe("on a line with no right-aligned fields", () => {
    // Its fields from 0 to 110, then empty space to 300
    const leftBox = rect(0, 110);

    it("goes after the last field over the left two thirds of the space after the fields", () => {
      expect(sideAt(150, line, leftBox, null)).toEqual({ side: "space", right: false });
      expect(sideAt(235, line, leftBox, null)).toEqual({ side: "space", right: false });
    });

    it("is right-aligned over the right third of that space, and beyond the end of the line", () => {
      expect(sideAt(240, line, leftBox, null)).toEqual({ side: "space", right: true });
      expect(sideAt(350, line, leftBox, null)).toEqual({ side: "space", right: true });
    });

    it("goes among the fields over them", () => {
      expect(sideAt(20, line, leftBox, null)).toEqual({ side: "left" });
    });
  });

  describe("on a line with fields on both sides", () => {
    // The left fields from 0 to 50, the right-aligned ones from 200: the space between them is 50-200
    const leftBox = rect(0, 50);
    const rightBox = rect(200, 300);

    it("goes after the left fields or before the right-aligned ones, by which part of the space it's over", () => {
      expect(sideAt(140, line, leftBox, rightBox)).toEqual({ side: "space", right: false });
      expect(sideAt(160, line, leftBox, rightBox)).toEqual({ side: "space", right: true });
    });

    it("goes among the fields on the side it's over", () => {
      expect(sideAt(30, line, leftBox, rightBox)).toEqual({ side: "left" });
      expect(sideAt(250, line, leftBox, rightBox)).toEqual({ side: "right" });
    });
  });

  it("splits the space before a line's right-aligned fields when it has no left ones", () => {
    expect(sideAt(100, line, null, rect(200, 300))).toEqual({ side: "space", right: false });
    expect(sideAt(150, line, null, rect(200, 300))).toEqual({ side: "space", right: true });
  });

  it("splits the whole of an empty line the same way", () => {
    expect(sideAt(150, line, null, null)).toEqual({ side: "space", right: false });
    expect(sideAt(250, line, null, null)).toEqual({ side: "space", right: true });
  });
});

describe("where a line's rows start", () => {
  it("starts a row with a field left of the one before it, or below it", () => {
    expect(startsRow({ left: 0, right: 50, top: 30, bottom: 50 }, { left: 60, right: 110, top: 0, bottom: 20 })).toBe(true);
    // A right-aligned field wrapped onto the next row, right of the field before it
    expect(startsRow({ left: 250, right: 300, top: 30, bottom: 50 }, { left: 60, right: 110, top: 0, bottom: 20 })).toBe(true);
    expect(startsRow({ left: 120, right: 170, top: 0, bottom: 20 }, { left: 60, right: 110, top: 0, bottom: 20 })).toBe(false);
  });
});

/** @see docs/scene-info-panel.md § "Moving fields" */
describe("where a dragged field goes along the line its ghost is on", () => {
  const rect = (left: number, right: number, top = 0): Rect => ({ left, right, top, bottom: top + 20 });
  const at = (x: number, y = 10) => ({ x, y });
  // [short][ghost][very long] — the ghost (not passed) is between the two at 30-50
  const fields = [rect(0, 20), rect(60, 200)];

  it("moves past a field as soon as the pointer is over it, heading away from the ghost", () => {
    expect(getSlotNearGhost(at(70), 1, fields, 1).index).toBe(2);
    expect(getSlotNearGhost(at(15), -1, fields, 1).index).toBe(0);
  });

  it("stays put while the pointer carries on over the field it just passed", () => {
    // The ghost is now after the long field, which the pointer is still over, still heading right
    expect(getSlotNearGhost(at(150), 1, fields, 2).index).toBe(2);
  });

  it("moves back once the pointer turns back over that field", () => {
    expect(getSlotNearGhost(at(150), -1, fields, 2).index).toBe(1);
  });

  it("stays put over the gaps between fields, and when the pointer isn't moving sideways", () => {
    expect(getSlotNearGhost(at(40), 1, fields, 1).index).toBe(1);
    expect(getSlotNearGhost(at(70), 0, fields, 1).index).toBe(1);
  });

  it("goes at the end of the line beyond its ends", () => {
    expect(getSlotNearGhost(at(250), -1, fields, 0).index).toBe(2);
    expect(getSlotNearGhost(at(-10), 1, fields, 2).index).toBe(0);
  });

  it("ignores the field whose place it took as it arrived on the line, as it was pushed under the pointer", () => {
    expect(getSlotNearGhost(at(70), 1, fields, 1, 1)).toEqual({ index: 1, ignore: 1 });
  });

  it("goes after the field whose place it took once the pointer leaves it across its far side", () => {
    // [ghost][a][b] — the ghost took a's place; the pointer has crossed a into the gap before b
    const line = [rect(40, 80), rect(90, 130)];
    expect(getSlotNearGhost(at(85), 1, line, 0, 0)).toEqual({ index: 1, ignore: null });
  });

  it("stops ignoring that field once the pointer's off it, so coming back onto it passes it", () => {
    // [ghost][a] — a was pushed out from under the pointer, which is over the ghost
    const line = [rect(60, 110)];
    expect(getSlotNearGhost(at(30), 1, line, 0, 0)).toEqual({ index: 0, ignore: null });
    expect(getSlotNearGhost(at(65), 1, line, 0, null)).toEqual({ index: 1, ignore: null });
  });

  it("stops ignoring that field once the pointer's over another one", () => {
    expect(getSlotNearGhost(at(15), -1, fields, 1, 1)).toEqual({ index: 0, ignore: null });
  });

  describe("on a line that wraps onto a second row", () => {
    // [a][b][c] on the first row, [d][e] wrapped onto the second
    const wrapped = [rect(0, 50), rect(60, 110), rect(120, 170), rect(0, 50, 30), rect(60, 110, 30)];

    it("goes past a field on the row the pointer's on", () => {
      expect(getSlotNearGhost(at(70, 10), 1, wrapped, 1).index).toBe(2);
    });

    it("goes after a later field on another row, whichever way the pointer's moving sideways", () => {
      const ghostOnFirstRow = rect(180, 230);
      expect(getSlotNearGhost(at(70, 40), -1, wrapped, 3, null, ghostOnFirstRow)).toEqual({ index: 5, ignore: 4 });
      expect(getSlotNearGhost(at(70, 40), 0, wrapped, 3, null, ghostOnFirstRow)).toEqual({ index: 5, ignore: 4 });
    });

    it("goes before an earlier field on another row", () => {
      const ghostOnSecondRow = rect(120, 170, 30);
      expect(getSlotNearGhost(at(70, 10), 1, wrapped, 5, null, ghostOnSecondRow)).toEqual({ index: 1, ignore: 1 });
    });

    it("stays put over the ghost, or on a row the ghost has to itself", () => {
      // The ghost alone on a third row at 60-110
      const ghostAlone = rect(60, 110, 60);
      expect(getSlotNearGhost(at(80, 70), 1, wrapped, 5, null, ghostAlone).index).toBe(5);
      expect(getSlotNearGhost(at(150, 70), -1, wrapped, 5, null, ghostAlone).index).toBe(5);
      // Over the ghost on a row with other fields
      expect(getSlotNearGhost(at(190, 10), 1, wrapped, 3, null, rect(180, 230)).index).toBe(3);
    });

    it("goes at the end of the pointer's row beyond it, not at the end of the line", () => {
      expect(getSlotNearGhost(at(200, 10), 1, wrapped, 1).index).toBe(3);
      expect(getSlotNearGhost(at(200, 40), 1, wrapped, 1).index).toBe(5);
    });
  });
});

/** @see docs/scene-info-panel.md § "Moving fields" */
describe("where a dragged field goes as it arrives on another line", () => {
  const rect = (left: number, right: number, top = 0): Rect => ({ left, right, top, bottom: top + 20 });
  const fields = [rect(0, 50), rect(60, 200)];

  it("takes the place of the field it's over, whichever half of it the pointer is over", () => {
    expect(getSlotOnArrival({ x: 190, y: 10 }, fields)).toEqual({ index: 1, over: 1 });
    expect(getSlotOnArrival({ x: 10, y: 10 }, fields)).toEqual({ index: 0, over: 0 });
  });

  it("goes after the fields to its left when it isn't over one", () => {
    expect(getSlotOnArrival({ x: 55, y: 10 }, fields)).toEqual({ index: 1, over: null });
    expect(getSlotOnArrival({ x: 300, y: 10 }, fields)).toEqual({ index: 2, over: null });
  });

  it("goes by the row of a wrapped line the pointer's on", () => {
    const wrapped = [rect(0, 50), rect(60, 110), rect(0, 50, 30), rect(60, 110, 30)];
    expect(getSlotOnArrival({ x: 70, y: 40 }, wrapped)).toEqual({ index: 3, over: 3 });
    expect(getSlotOnArrival({ x: 200, y: 40 }, wrapped)).toEqual({ index: 4, over: null });
  });
});

/** @see docs/scene-info-panel.md § "Moving fields" */
describe("a field dragged off a line it was alone on", () => {
  // Without the dragged field, whose line (1) is left empty
  const layout = [["studio"], [], ["performers"]];
  const from = { line: 1, index: 0 };

  it("goes back on its own line rather than a new line straight above or below it", () => {
    expect(preferVacatedLine({ type: "new-line", line: 1, right: false }, layout, from)).toEqual({ type: "same-line", line: 1 });
    expect(preferVacatedLine({ type: "new-line", line: 2, right: true }, layout, from)).toEqual({ type: "same-line", line: 1 });
  });

  it("goes on a new line further away", () => {
    expect(preferVacatedLine({ type: "new-line", line: 3, right: false }, layout, from)).toEqual({ type: "new-line", line: 3, right: false });
  });

  it("goes on a new line beside a line it shared with other fields", () => {
    expect(preferVacatedLine({ type: "new-line", line: 1, right: false }, [["studio"], { left: [], right: ["title"] }], { line: 1, index: 1 }))
      .toEqual({ type: "new-line", line: 1, right: false });
  });
});

/** @see docs/scene-info-panel.md § "Moving fields" */
describe("where a dragged field goes on a line marked with an insertion line", () => {
  const rect = (left: number, right: number, top = 0): Rect => ({ left, right, top, bottom: top + 20 });
  const fields = [rect(0, 50), rect(60, 200), rect(0, 50, 30)];

  it("goes before or after the field the pointer's over, by which half it's over", () => {
    expect(getSlotByMidpoints({ x: 70, y: 10 }, fields)).toBe(1);
    expect(getSlotByMidpoints({ x: 190, y: 10 }, fields)).toBe(2);
  });

  it("goes by the row the pointer's on", () => {
    expect(getSlotByMidpoints({ x: 40, y: 40 }, fields)).toBe(3);
  });
});

/** @see docs/scene-info-panel.md § "Customising the panel" */
describe("what a field with no value shows", () => {
  it("reads in sentence case", () => {
    expect(noValueLabel("studio")).toBe("No studio");
    expect(noValueLabel("code")).toBe("No studio code");
  });

  it("keeps the capitals of names that aren't simply capitalised", () => {
    expect(noValueLabel("urls")).toBe("No URLs");
    expect(noValueLabel("o-count")).toBe("No O-count");
  });
});
