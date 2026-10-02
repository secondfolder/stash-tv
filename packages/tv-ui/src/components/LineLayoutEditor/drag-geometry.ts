/**
 * The geometry behind dragging an item in `LineLayoutEditor`: given where the lines and their items are on screen,
 * where a dragged item goes. Pure functions, so they're unit tested without a browser.
 */
import type { LineDropTarget } from "./line-layout";

export type Rect = { left: number; right: number; top: number; bottom: number };

export type Point = { x: number; y: number };

export function contains(rect: Rect, point: Point) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

/**
 * A rect mirrored left to right. A line's right-aligned items are laid out from right to left (the first at the line's
 * end), mirroring its left items, so mirrored they can be worked with as items laid out from left to right.
 */
export function mirror(rect: Rect): Rect {
  return { ...rect, left: -rect.right, right: -rect.left };
}

/**
 * Which line an item dropped at `point` goes on, given where each line is on screen (where along it is up to the
 * editor). Over the middle of a line it goes on that line. Near the top or bottom edge of a line, between lines, or
 * above or below them all, it goes on a new line there, right-aligned if the pointer's right of `centre` (the middle of
 * the lines).
 */
export function getDropTarget(
  point: Point,
  lines: { rect: Rect }[],
  centre: number,
): LineDropTarget {
  const right = point.x > centre;
  for (const [lineIndex, { rect }] of lines.entries()) {
    // Just a sliver of the line itself, so the gap between lines (room for the ghost line) is most of a new line's
    // target, and a line's own target stays the bigger one
    const edge = Math.min(2, (rect.bottom - rect.top) / 4);
    if (point.y < rect.top + edge) return { type: "new-line", line: lineIndex, right };
    if (point.y <= rect.bottom - edge) return { type: "same-line", line: lineIndex };
  }
  return { type: "new-line", line: lines.length, right };
}

/**
 * Whether an item on a line starts another row of it, given the item before it: it's left of that item, or below it.
 * Right-aligned items run from right to left, so they're mirrored first.
 */
export function startsRow(item: Rect, previous: Rect): boolean {
  return item.left < previous.left || item.top >= previous.bottom;
}

/**
 * The indexes of the items on the row of a line nearest `y`. A line can wrap onto more than one row (see `startsRow`).
 */
export function rowAt(y: number, items: Rect[]): number[] {
  const rows: number[][] = [];
  items.forEach((item, index) => {
    const previous = items[index - 1];
    if (!previous || startsRow(item, previous)) rows.push([index]);
    else rows[rows.length - 1].push(index);
  });
  const distance = (row: number[]) => {
    const top = Math.min(...row.map(index => items[index].top));
    const bottom = Math.max(...row.map(index => items[index].bottom));
    return y < top ? top - y : y > bottom ? y - bottom : 0;
  };
  return rows.reduce((nearest, row) => distance(row) < distance(nearest) ? row : nearest, rows[0] ?? []);
}

/** Of `row`, the index of the item `x` is over, if any */
function itemUnder(x: number, items: Rect[], row: number[]): number | undefined {
  return row.find(index => x >= items[index].left && x <= items[index].right);
}

/**
 * Where on a line a dragged item goes as it arrives on it from another line (or from the available items), given where
 * the line's items are. Over an item, it takes that item's place, before it, and `over` is that item. Otherwise it
 * goes after the items to its left on the row it's on.
 */
export function getSlotOnArrival(point: Point, items: Rect[]): { index: number; over: number | null } {
  if (!items.length) return { index: 0, over: null };
  const row = rowAt(point.y, items);
  const over = itemUnder(point.x, items, row);
  if (over !== undefined) return { index: over, over };
  return { index: row[0] + row.filter(index => items[index].right < point.x).length, over: null };
}

/**
 * Where on a line a dragged item goes once its ghost is already on that line at `ghostIndex`. `items` are where the
 * line's other items are now, in order, with the ghost among them.
 *
 * - Passing over an item in the direction of travel (`direction`: 1 rightwards, -1 leftwards) moves the ghost past it
 *   straight away. The ghost then stays put while the pointer carries on over that item the same way, and only moves
 *   back once the pointer turns back.
 * - `ignore` is the item whose place the ghost took as it arrived on the line, which that pushed along, often under
 *   the pointer. Being over it doesn't move the ghost, for as long as the pointer stays over it. Leaving it across its
 *   far side puts the ghost after it. Leaving it any other way (e.g. it was pushed out from under the pointer, which is
 *   now over the ghost) ends ignoring it, so coming back onto it passes it like any other item.
 * - On a line that wraps, over an item on a different row from the ghost (`ghost`, where it is now), the ghost goes
 *   after that item if it's after the ghost, and before it if it's before, as if the rows were lines of their own.
 *   Going after a later item, rather than taking its place, puts the item roughly where that item was, as moving
 *   it from before shifts that item back. That item is then ignored as above.
 * - Beyond either end of the pointer's row of the line, it goes at that end.
 * - Over the ghost, or on a row the ghost has to itself, it stays put. The ghost moving can move other items to another
 *   row (e.g. moving it to the end of a wrapped line can pull the item it passed up onto the row before), and treating
 *   the pointer as on the next nearest row would move the ghost back, over and over.
 */
export function getSlotNearGhost(
  point: Point,
  direction: number,
  items: Rect[],
  ghostIndex: number,
  ignore: number | null = null,
  ghost: Rect | null = null,
): { index: number; ignore: number | null } {
  if (!items.length) return { index: 0, ignore: null };
  if (ghost && point.y >= ghost.top && point.y <= ghost.bottom) {
    const overGhost = point.x >= ghost.left && point.x <= ghost.right;
    const ghostRowHasItems = items.some(item => item.top < ghost.bottom && item.bottom > ghost.top);
    // Off the ignored item, so it's no longer ignored
    if (overGhost || !ghostRowHasItems) return { index: ghostIndex, ignore: null };
  }
  const row = rowAt(point.y, items);
  const first = row[0];
  const last = row[row.length - 1];
  if (point.x < items[first].left) return { index: first, ignore: null };
  if (point.x > items[last].right) return { index: last + 1, ignore: null };
  const over = itemUnder(point.x, items, row);
  if (over === undefined) {
    if (ignore !== null && row.includes(ignore) && point.x > items[ignore].right) return { index: ignore + 1, ignore: null };
    return { index: ghostIndex, ignore: null };
  }
  if (over === ignore) return { index: ghostIndex, ignore };
  const rowTop = Math.min(...row.map(index => items[index].top));
  const rowBottom = Math.max(...row.map(index => items[index].bottom));
  const ghostOnRow = !ghost || (ghost.top < rowBottom && ghost.bottom > rowTop);
  if (!ghostOnRow) return { index: over >= ghostIndex ? over + 1 : over, ignore: over };
  if (direction > 0 && over >= ghostIndex) return { index: over + 1, ignore: null };
  if (direction < 0 && over < ghostIndex) return { index: over, ignore: null };
  return { index: ghostIndex, ignore: null };
}

/**
 * Which part of a line `x` is over: its left items, its right-aligned items, or the empty space between them. Each
 * side is in a box of its own, wrapping on its own (`leftBox` and `rightBox`, null when the side has no items). With
 * no right-aligned items, the space goes to the end of the line (`line`), and with no left items, from its start.
 * Over the space's left two thirds, an item goes at the end of the left items, and over its right third, it's
 * right-aligned (`right`), at the end of the others, which run from the line's end, so it's beside the space.
 */
export function sideAt(
  x: number,
  line: { left: number; right: number },
  leftBox: Rect | null,
  rightBox: Rect | null,
): { side: "left" | "right" } | { side: "space"; right: boolean } {
  if (leftBox && x < leftBox.right) return { side: "left" };
  if (rightBox && x > rightBox.left) return { side: "right" };
  const spaceLeft = leftBox?.right ?? line.left;
  const spaceRight = rightBox?.left ?? line.right;
  return { side: "space", right: x >= spaceLeft + (spaceRight - spaceLeft) * 2 / 3 };
}

/**
 * Where on a line a dragged item goes when nothing moves aside for it (an insertion line marks the spot rather than its
 * ghost): before or after the item the pointer's over, by which half of it it's over, on the pointer's row.
 */
export function getSlotByMidpoints(point: Point, items: Rect[]): number {
  if (!items.length) return 0;
  const row = rowAt(point.y, items);
  return row[0] + row.filter(index => (items[index].left + items[index].right) / 2 < point.x).length;
}
