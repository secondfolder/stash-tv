import { describe, expect, it } from "vitest";
import {
  fieldsNotInLayout,
  getDropTarget,
  getSlotNearGhost,
  getSlotByMidpoints,
  countRows,
  noValueLabel,
  getSlotOnArrival,
  preferVacatedLine,
  placeField,
  type Rect,
} from "../../../src/components/slide/SceneInfo/scene-info-config";

/** @see docs/scene-info-panel.md § "Moving fields" */
describe("placing a field in the scene info panel's layout", () => {
  const layout = [["studio"], ["title", "date"], ["performers"]];

  it("moves a field beside another on the same line", () => {
    expect(placeField(layout, "performers", { line: 2, index: 0 }, { type: "same-line", line: 1, index: 1 }))
      .toEqual([["studio"], ["title", "performers", "date"]]);
  });

  it("moves a field later along its own line", () => {
    expect(placeField(layout, "title", { line: 1, index: 0 }, { type: "same-line", line: 1, index: 2 }))
      .toEqual([["studio"], ["date", "title"], ["performers"]]);
  });

  it("moves a field onto a new line, removing the line it leaves empty", () => {
    expect(placeField(layout, "studio", { line: 0, index: 0 }, { type: "new-line", line: 3 }))
      .toEqual([["title", "date"], ["performers"], ["studio"]]);
  });

  it("keeps the line a field leaves empty when asked to, as the editor does while it's dragged", () => {
    expect(placeField(layout, "studio", { line: 0, index: 0 }, { type: "same-line", line: 1, index: 0 }, { keepEmptyLines: true }))
      .toEqual([[], ["studio", "title", "date"], ["performers"]]);
  });

  it("splits a field off onto a new line between two lines", () => {
    expect(placeField(layout, "date", { line: 1, index: 1 }, { type: "new-line", line: 1 }))
      .toEqual([["studio"], ["date"], ["title"], ["performers"]]);
  });

  it("adds a field that isn't in the layout yet", () => {
    expect(placeField(layout, "tags", null, { type: "same-line", line: 0, index: 0 }))
      .toEqual([["tags", "studio"], ["title", "date"], ["performers"]]);
  });

  it("removes a field", () => {
    expect(placeField(layout, "date", { line: 1, index: 1 }, { type: "remove" }))
      .toEqual([["studio"], ["title"], ["performers"]]);
  });

  it("keeps fields it doesn't know, so a newer Stash TV using the same Stash server doesn't lose them", () => {
    expect(placeField([["from-a-newer-version", "date"]], "date", { line: 0, index: 1 }, { type: "new-line", line: 0 }))
      .toEqual([["date"], ["from-a-newer-version"]]);
  });

  it("offers only the fields that aren't in the layout to add", () => {
    const notInLayout = fieldsNotInLayout(layout);
    expect(notInLayout).toContain("tags");
    expect(notInLayout).not.toContain("title");
  });
});

/** @see docs/scene-info-panel.md § "Moving fields" */
describe("where a dragged field is dropped", () => {
  const rect = (left: number, right: number, top: number, bottom: number): Rect => ({ left, right, top, bottom });
  // Two 20px-high lines 10px apart: [A][B] and [C]
  const lines = [
    { rect: rect(0, 300, 0, 20), fields: [rect(0, 50, 0, 20), rect(60, 110, 0, 20)] },
    { rect: rect(0, 300, 30, 50), fields: [rect(0, 50, 30, 50)] },
  ];

  it("goes to the left of a field when over its left half", () => {
    expect(getDropTarget({ x: 70, y: 10 }, lines)).toEqual({ type: "same-line", line: 0, index: 1 });
  });

  it("goes to the right of a field when over its right half", () => {
    expect(getDropTarget({ x: 100, y: 10 }, lines)).toEqual({ type: "same-line", line: 0, index: 2 });
  });

  it("goes at the end of a line when past its last field", () => {
    expect(getDropTarget({ x: 250, y: 40 }, lines)).toEqual({ type: "same-line", line: 1, index: 1 });
  });

  it("goes on a new line when between two lines", () => {
    expect(getDropTarget({ x: 20, y: 25 }, lines)).toEqual({ type: "new-line", line: 1 });
  });

  it("goes on a new line when near the top edge of a line", () => {
    expect(getDropTarget({ x: 20, y: 1 }, lines)).toEqual({ type: "new-line", line: 0 });
  });

  it("goes on the line just inside its edge", () => {
    expect(getDropTarget({ x: 20, y: 3 }, lines)).toEqual({ type: "same-line", line: 0, index: 0 });
  });

  it("goes on a new line at the bottom when below every line", () => {
    expect(getDropTarget({ x: 20, y: 200 }, lines)).toEqual({ type: "new-line", line: 2 });
  });

  it("goes on the first line when there are no lines", () => {
    expect(getDropTarget({ x: 20, y: 20 }, [])).toEqual({ type: "new-line", line: 0 });
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
    expect(preferVacatedLine({ type: "new-line", line: 1 }, layout, from)).toEqual({ type: "same-line", line: 1, index: 0 });
    expect(preferVacatedLine({ type: "new-line", line: 2 }, layout, from)).toEqual({ type: "same-line", line: 1, index: 0 });
  });

  it("goes on a new line further away", () => {
    expect(preferVacatedLine({ type: "new-line", line: 3 }, layout, from)).toEqual({ type: "new-line", line: 3 });
  });

  it("goes on a new line beside a line it shared with other fields", () => {
    expect(preferVacatedLine({ type: "new-line", line: 1 }, [["studio"], ["title"]], { line: 1, index: 1 }))
      .toEqual({ type: "new-line", line: 1 });
  });
});

/** @see docs/scene-info-panel.md § "Moving fields" */
describe("how many rows a line takes", () => {
  it("fits as many fields on a row as there's room for, with the gaps between them", () => {
    // 40 + 10 + 40 = 90 fits in 100; another 10 + 40 doesn't
    expect(countRows([40, 40, 40], 10, 100, 100)).toBe(2);
    expect(countRows([40, 40], 10, 100, 100)).toBe(1);
  });

  it("gives the later, indented rows less room than the first", () => {
    expect(countRows([40, 40, 40, 40], 10, 100, 80)).toBe(3);
    expect(countRows([40, 40, 40, 40], 10, 100, 100)).toBe(2);
  });

  it("takes no rows with no fields", () => {
    expect(countRows([], 10, 100, 100)).toBe(0);
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
