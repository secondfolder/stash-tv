/** Every field the scene info panel can show */
export const sceneInfoFieldIds = [
  "studio",
  "title",
  "performers",
  "date",
  "details",
  "tags",
  "groups",
  "code",
  "director",
  "rating",
  "duration",
  "resolution",
  "play-count",
  "o-count",
  "path",
  "urls",
] as const;

export type SceneInfoFieldId = typeof sceneInfoFieldIds[number];

/** Names each field in the panel's editor, and labels the values that don't explain themselves */
export const sceneInfoFieldLabels: Record<SceneInfoFieldId, string> = {
  studio: "Studio",
  title: "Title",
  performers: "Performers",
  date: "Date",
  details: "Details",
  tags: "Tags",
  groups: "Groups",
  code: "Studio code",
  director: "Director",
  rating: "Rating",
  duration: "Duration",
  resolution: "Resolution",
  "play-count": "Play count",
  "o-count": "O-count",
  path: "File path",
  urls: "URLs",
};

/**
 * What a field with no value for the scene shows in the editor, e.g. "No studio code", in sentence case. Only a first
 * word that's simply capitalised is lowercased, so names like "URLs" and "O-count" keep their capitals.
 */
export function noValueLabel(field: SceneInfoFieldId): string {
  return `No ${sceneInfoFieldLabels[field].replace(/^[A-Z][a-z]+\b/, word => word.toLowerCase())}`;
}

/**
 * One of the panel's lines: the fields on it from left to right or, when some are right-aligned, the fields on its left
 * and those on its right (each from left to right). Fields are plain strings because the config comes from persisted
 * user settings and may name a field this version doesn't know (e.g. saved by a newer Stash TV). Those are kept where
 * they are, but not shown.
 */
export type SceneInfoLine = string[] | { left: string[]; right: string[] };

/** `tvConfig.sceneInfoLayout`: the panel's lines, top to bottom */
export type SceneInfoLayout = SceneInfoLine[];

/** What the editor's pills show: each field's name, or its value for the scene */
export type SceneInfoEditorPillContent = "names" | "values";

export const defaultSceneInfoLayout: SceneInfoLayout = [["studio"], ["title"], ["performers"], ["date"]];

export function isKnownField(field: string): field is SceneInfoFieldId {
  return (sceneInfoFieldIds as readonly string[]).includes(field);
}

/** A line's left and right-aligned fields, however it's stored */
export function lineSides(line: SceneInfoLine | undefined): { left: string[]; right: string[] } {
  if (!line) return { left: [], right: [] };
  return Array.isArray(line) ? { left: line, right: [] } : line;
}

/** Every field on a line, from left to right: those on its left, then the right-aligned ones */
export function lineFields(line: SceneInfoLine | undefined): string[] {
  const { left, right } = lineSides(line);
  return [...left, ...right];
}

/** A line with these fields, stored as a plain list unless some are right-aligned */
function makeLine(left: string[], right: string[]): SceneInfoLine {
  return right.length ? { left, right } : left;
}

/** The known fields that aren't in the layout, which can be added to it */
export function fieldsNotInLayout(layout: SceneInfoLayout): SceneInfoFieldId[] {
  return sceneInfoFieldIds.filter(field => !layout.some(line => lineFields(line).includes(field)));
}

/** A field's place in the layout: its line, and where it is among every field on it (`lineFields`) */
export type LayoutPosition = { line: number; index: number };

/** Whether the field at `position` is one of its line's right-aligned fields */
export function isRightAligned(layout: SceneInfoLayout, position: LayoutPosition): boolean {
  return position.index >= lineSides(layout[position.line]).left.length;
}

/**
 * Where a dragged field will go: onto an existing line before the field at `index` among every field on it (or at the
 * end of the line if `index` is their number), onto a new line inserted before line `line` (or at the bottom if it's
 * the number of lines), or out of the layout. `right` is whether it's right-aligned. Between the line's left fields and
 * its right-aligned ones, it could go at the end of either, which `right` decides; elsewhere it must match the side of
 * the fields around `index`.
 */
export type DropTarget =
  | { type: "same-line"; line: number; index: number; right: boolean }
  | { type: "new-line"; line: number; right: boolean }
  | { type: "remove" };

/** Which line a dragged field will go on, or the new line it will go on, before working out where along it */
export type LineDropTarget =
  | { type: "same-line"; line: number }
  | Extract<DropTarget, { type: "new-line" }>;

/**
 * Put `field` at `target`, taking it from `from` if it's already in the layout. Lines left empty are removed, unless
 * `keepEmptyLines`. `target` refers to positions in the layout before the move.
 */
export function placeField(
  layout: SceneInfoLayout,
  field: string,
  from: LayoutPosition | null,
  target: DropTarget,
  { keepEmptyLines = false } = {},
): SceneInfoLayout {
  type Entry = { field: string; moving: boolean; right: boolean };
  const lines: Entry[][] = layout.map((line, lineIndex) => {
    const { left, right } = lineSides(line);
    return [...left, ...right].map((other, index) => ({
      field: other,
      moving: lineIndex === from?.line && index === from?.index,
      right: index >= left.length,
    }));
  });
  const placed: Entry = { field, moving: false, right: target.type !== "remove" && target.right };
  if (target.type === "same-line") lines[target.line]?.splice(target.index, 0, placed);
  else if (target.type === "new-line") lines.splice(target.line, 0, [placed]);
  return lines
    .map(line => line.filter(entry => !entry.moving))
    .filter(line => keepEmptyLines || line.length)
    .map(line => makeLine(
      line.filter(entry => !entry.right).map(entry => entry.field),
      line.filter(entry => entry.right).map(entry => entry.field),
    ));
}

export type Rect = { left: number; right: number; top: number; bottom: number };

/**
 * Which line a field dropped at `point` goes on, given where each line is on screen (where along it is up to the
 * editor). Over the middle of a line it goes on that line. Near the top or bottom edge of a line, between lines, or
 * above or below them all, it goes on a new line there, right-aligned if the pointer's right of `centre` (the middle of
 * the lines).
 */
export function getDropTarget(
  point: { x: number; y: number },
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

type Point = { x: number; y: number };

/**
 * Whether a field on a line starts another row of it, given the field before it: it's left of that field, or below it.
 * Right-aligned fields run from right to left, so they're mirrored first.
 */
export function startsRow(field: Rect, previous: Rect): boolean {
  return field.left < previous.left || field.top >= previous.bottom;
}

/**
 * The indexes of the fields on the row of a line nearest `y`. A line can wrap onto more than one row (see `startsRow`).
 */
export function rowAt(y: number, fields: Rect[]): number[] {
  const rows: number[][] = [];
  fields.forEach((field, index) => {
    const previous = fields[index - 1];
    if (!previous || startsRow(field, previous)) rows.push([index]);
    else rows[rows.length - 1].push(index);
  });
  const distance = (row: number[]) => {
    const top = Math.min(...row.map(index => fields[index].top));
    const bottom = Math.max(...row.map(index => fields[index].bottom));
    return y < top ? top - y : y > bottom ? y - bottom : 0;
  };
  return rows.reduce((nearest, row) => distance(row) < distance(nearest) ? row : nearest, rows[0] ?? []);
}

/** Of `row`, the index of the field `x` is over, if any */
function fieldUnder(x: number, fields: Rect[], row: number[]): number | undefined {
  return row.find(index => x >= fields[index].left && x <= fields[index].right);
}

/**
 * Where on a line a dragged field goes as it arrives on it from another line (or from the unused fields), given where
 * the line's fields are. Over a field, it takes that field's place, before it, and `over` is that field. Otherwise it
 * goes after the fields to its left on the row it's on.
 */
export function getSlotOnArrival(point: Point, fields: Rect[]): { index: number; over: number | null } {
  if (!fields.length) return { index: 0, over: null };
  const row = rowAt(point.y, fields);
  const over = fieldUnder(point.x, fields, row);
  if (over !== undefined) return { index: over, over };
  return { index: row[0] + row.filter(index => fields[index].right < point.x).length, over: null };
}

/**
 * Where on a line a dragged field goes once its ghost is already on that line at `ghostIndex`. `fields` are where the
 * line's other fields are now, in order, with the ghost among them.
 *
 * - Passing over a field in the direction of travel (`direction`: 1 rightwards, -1 leftwards) moves the ghost past it
 *   straight away. The ghost then stays put while the pointer carries on over that field the same way, and only moves
 *   back once the pointer turns back.
 * - `ignore` is the field whose place the ghost took as it arrived on the line, which that pushed along, often under
 *   the pointer. Being over it doesn't move the ghost, for as long as the pointer stays over it. Leaving it across its
 *   far side puts the ghost after it. Leaving it any other way (e.g. it was pushed out from under the pointer, which is
 *   now over the ghost) ends ignoring it, so coming back onto it passes it like any other field.
 * - On a line that wraps, over a field on a different row from the ghost (`ghost`, where it is now), the ghost goes
 *   after that field if it's after the ghost, and before it if it's before, as if the rows were lines of their own.
 *   Going after a later field, rather than taking its place, puts the field roughly where that field was, as moving
 *   it from before shifts that field back. That field is then ignored as above.
 * - Beyond either end of the pointer's row of the line, it goes at that end.
 * - Over the ghost, or on a row the ghost has to itself, it stays put. The ghost moving can move other fields to another
 *   row (e.g. moving it to the end of a wrapped line can pull the field it passed up onto the row before), and treating
 *   the pointer as on the next nearest row would move the ghost back, over and over.
 */
export function getSlotNearGhost(
  point: Point,
  direction: number,
  fields: Rect[],
  ghostIndex: number,
  ignore: number | null = null,
  ghost: Rect | null = null,
): { index: number; ignore: number | null } {
  if (!fields.length) return { index: 0, ignore: null };
  if (ghost && point.y >= ghost.top && point.y <= ghost.bottom) {
    const overGhost = point.x >= ghost.left && point.x <= ghost.right;
    const ghostRowHasFields = fields.some(field => field.top < ghost.bottom && field.bottom > ghost.top);
    // Off the ignored field, so it's no longer ignored
    if (overGhost || !ghostRowHasFields) return { index: ghostIndex, ignore: null };
  }
  const row = rowAt(point.y, fields);
  const first = row[0];
  const last = row[row.length - 1];
  if (point.x < fields[first].left) return { index: first, ignore: null };
  if (point.x > fields[last].right) return { index: last + 1, ignore: null };
  const over = fieldUnder(point.x, fields, row);
  if (over === undefined) {
    if (ignore !== null && row.includes(ignore) && point.x > fields[ignore].right) return { index: ignore + 1, ignore: null };
    return { index: ghostIndex, ignore: null };
  }
  if (over === ignore) return { index: ghostIndex, ignore };
  const rowTop = Math.min(...row.map(index => fields[index].top));
  const rowBottom = Math.max(...row.map(index => fields[index].bottom));
  const ghostOnRow = !ghost || (ghost.top < rowBottom && ghost.bottom > rowTop);
  if (!ghostOnRow) return { index: over >= ghostIndex ? over + 1 : over, ignore: over };
  if (direction > 0 && over >= ghostIndex) return { index: over + 1, ignore: null };
  if (direction < 0 && over < ghostIndex) return { index: over, ignore: null };
  return { index: ghostIndex, ignore: null };
}

/**
 * A new line straight above or below the line a field was dragged off, if that line is now empty, would be where the
 * field already was, so it goes back on its own line instead of adding one. `layout` is without the dragged field, with
 * empty lines kept.
 */
export function preferVacatedLine(target: LineDropTarget, layout: SceneInfoLayout, from: LayoutPosition | null): LineDropTarget {
  if (!from || target.type !== "new-line" || !layout[from.line] || lineFields(layout[from.line]).length) return target;
  if (target.line !== from.line && target.line !== from.line + 1) return target;
  return { type: "same-line", line: from.line };
}

/**
 * Which part of a line `x` is over: its left fields, its right-aligned fields, or the empty space between them. Each
 * side is in a box of its own, wrapping on its own (`leftBox` and `rightBox`, null when the side has no fields). With
 * no right-aligned fields, the space goes to the end of the line (`line`), and with no left fields, from its start.
 * Over the space's left two thirds, a field goes at the end of the left fields, and over its right third, it's
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
 * How many rows a line takes, its left fields `left` wide and its right-aligned ones `right` wide: side by side in a
 * line `width` wide, `sideGap` apart, each side in a box wrapping on its own (fields `gap` apart). As a flexbox does,
 * each box is as wide as its fields on one row if both fit, and otherwise both shrink in proportion to that width, but
 * no narrower than their widest field. Each box's later rows are indented by `indent` (a hanging indent, on the left
 * for the left fields and on the right for the right-aligned ones).
 */
export function countLineRows(
  left: number[],
  right: number[],
  { gap, sideGap, width, indent }: { gap: number; sideGap: number; width: number; indent: number },
): number {
  const oneRow = (widths: number[]) => widths.reduce((total, field) => total + field, 0) + gap * Math.max(widths.length - 1, 0);
  const leftMin = Math.max(left[0] ?? 0, ...left.slice(1).map(field => field + indent));
  const rightMin = Math.max(right[0] ?? 0, ...right.slice(1).map(field => field + indent));
  const room = width - (left.length && right.length ? sideGap : 0);
  let leftWidth = oneRow(left);
  let rightWidth = oneRow(right);
  const overflow = leftWidth + rightWidth - room;
  if (overflow > 0) {
    const total = leftWidth + rightWidth;
    leftWidth -= overflow * leftWidth / total;
    rightWidth -= overflow * rightWidth / total;
    if (leftWidth < leftMin) [leftWidth, rightWidth] = [leftMin, Math.max(rightMin, room - leftMin)];
    else if (rightWidth < rightMin) [leftWidth, rightWidth] = [Math.max(leftMin, room - rightMin), rightMin];
  }
  return Math.max(countRows(left, gap, leftWidth, leftWidth - indent), countRows(right, gap, rightWidth, rightWidth - indent));
}

/**
 * How many rows a line of fields `widths` wide takes, wrapping as a flexbox does: as many fields on a row as fit, with
 * `gap` between them. The first row has `firstRowWidth`, the rest `otherRowWidth` (they're indented).
 */
export function countRows(widths: number[], gap: number, firstRowWidth: number, otherRowWidth: number): number {
  let rows = 0;
  let used = 0;
  for (const width of widths) {
    const rowWidth = rows === 1 ? firstRowWidth : otherRowWidth;
    // Allowing for rounding in the measured widths
    if (rows && used + gap + width <= rowWidth + 0.5) {
      used += gap + width;
    } else {
      rows++;
      used = width;
    }
  }
  return rows;
}

/**
 * Where on a line a dragged field goes when nothing moves aside for it (an insertion line marks the spot rather than its
 * ghost): before or after the field the pointer's over, by which half of it it's over, on the pointer's row.
 */
export function getSlotByMidpoints(point: Point, fields: Rect[]): number {
  if (!fields.length) return 0;
  const row = rowAt(point.y, fields);
  return row[0] + row.filter(index => (fields[index].left + fields[index].right) / 2 < point.x).length;
}
