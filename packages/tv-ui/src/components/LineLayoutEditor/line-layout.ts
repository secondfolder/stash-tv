/**
 * A layout of items on lines, as `LineLayoutEditor` edits it: lines top to bottom, each with its items from left to
 * right or, when some are right-aligned, the items on its left and those on its right (each from left to right).
 */
export type Line<T> = T[] | { left: T[]; right: T[] };

export type Layout<T> = Line<T>[];

/** A line's left and right-aligned items, however it's stored */
export function lineSides<T>(line: Line<T> | undefined): { left: T[]; right: T[] } {
  if (!line) return { left: [], right: [] };
  return Array.isArray(line) ? { left: line, right: [] } : line;
}

/** Every item on a line, from left to right: those on its left, then the right-aligned ones */
export function lineItems<T>(line: Line<T> | undefined): T[] {
  const { left, right } = lineSides(line);
  return [...left, ...right];
}

/** A line with these items, stored as a plain list unless some are right-aligned */
function makeLine<T>(left: T[], right: T[]): Line<T> {
  return right.length ? { left, right } : left;
}

/** An item's place in the layout: its line, and where it is among every item on it (`lineItems`) */
export type LayoutPosition = { line: number; index: number };

/** Whether the item at `position` is one of its line's right-aligned items */
export function isRightAligned<T>(layout: Layout<T>, position: LayoutPosition): boolean {
  return position.index >= lineSides(layout[position.line]).left.length;
}

/**
 * Where a dragged item will go: onto an existing line before the item at `index` among every item on it (or at the
 * end of the line if `index` is their number), onto a new line inserted before line `line` (or at the bottom if it's
 * the number of lines), or out of the layout. `right` is whether it's right-aligned. Between the line's left items and
 * its right-aligned ones, it could go at the end of either, which `right` decides; elsewhere it must match the side of
 * the items around `index`.
 */
export type DropTarget =
  | { type: "same-line"; line: number; index: number; right: boolean }
  | { type: "new-line"; line: number; right: boolean }
  | { type: "remove" };

/** Which line a dragged item will go on, or the new line it will go on, before working out where along it */
export type LineDropTarget =
  | { type: "same-line"; line: number }
  | Extract<DropTarget, { type: "new-line" }>;

/**
 * Put `item` at `target`, taking it from `from` if it's already in the layout. Lines left empty are removed, unless
 * `keepEmptyLines`. `target` refers to positions in the layout before the move.
 */
export function placeItem<T>(
  layout: Layout<T>,
  item: T,
  from: LayoutPosition | null,
  target: DropTarget,
  { keepEmptyLines = false } = {},
): Layout<T> {
  type Entry = { item: T; moving: boolean; right: boolean };
  const lines: Entry[][] = layout.map((line, lineIndex) => {
    const { left, right } = lineSides(line);
    return [...left, ...right].map((other, index) => ({
      item: other,
      moving: lineIndex === from?.line && index === from?.index,
      right: index >= left.length,
    }));
  });
  const placed: Entry = { item, moving: false, right: target.type !== "remove" && target.right };
  if (target.type === "same-line") lines[target.line]?.splice(target.index, 0, placed);
  else if (target.type === "new-line") lines.splice(target.line, 0, [placed]);
  return lines
    .map(line => line.filter(entry => !entry.moving))
    .filter(line => keepEmptyLines || line.length)
    .map(line => makeLine(
      line.filter(entry => !entry.right).map(entry => entry.item),
      line.filter(entry => entry.right).map(entry => entry.item),
    ));
}

/** `layout` with the item whose key (`getKey`) is `key` replaced by `item`, e.g. one with new options */
export function replaceItem<T>(layout: Layout<T>, getKey: (item: T) => string, key: string, item: T): Layout<T> {
  const replace = (items: T[]) => items.map(other => getKey(other) === key ? item : other);
  return layout.map(line => Array.isArray(line) ? replace(line) : { left: replace(line.left), right: replace(line.right) });
}

/**
 * A new line straight above or below the line an item was dragged off, if that line is now empty, would be where the
 * item already was, so it goes back on its own line instead of adding one. `layout` is without the dragged item, with
 * empty lines kept.
 */
export function preferVacatedLine<T>(target: LineDropTarget, layout: Layout<T>, from: LayoutPosition | null): LineDropTarget {
  if (!from || target.type !== "new-line" || !layout[from.line] || lineItems(layout[from.line]).length) return target;
  if (target.line !== from.line && target.line !== from.line + 1) return target;
  return { type: "same-line", line: from.line };
}
