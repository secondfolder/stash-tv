import "./LineLayoutEditor.css";
import React, { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { LayoutGroup, motion } from "framer-motion";
import { unstable_batchedUpdates } from "react-dom";
import cx from "classnames";
import { Badge, Button } from "react-bootstrap";
import { ArrowReturnLeft, ArrowReturnRight, XLg } from "react-bootstrap-icons";
import {
  DropTarget,
  isRightAligned,
  Layout,
  LayoutPosition,
  lineSides,
  placeItem,
  preferVacatedLine,
} from "./line-layout";
import {
  contains,
  getDropTarget,
  getSlotByMidpoints,
  getSlotNearGhost,
  getSlotOnArrival,
  mirror,
  Rect,
  sideAt,
  startsRow,
} from "./drag-geometry";

type Drag<T> = {
  item: T;
  /** The React key of the item's element, which is kept by its ghost so it's the same element, just moved and dimmed */
  key: string;
  /** Where the item was in the layout, or null if it's being dragged in from the available items */
  from: LayoutPosition | null;
  pointerId: number;
  startX: number;
  startY: number;
  /** Whether the pointer has moved far enough for this to be a drag rather than a tap */
  active: boolean;
  /** Where in the item it was grabbed, and its size, so the item being dragged stays under the pointer */
  grab: { x: number; y: number; width: number };
  /** Where the item being dragged is, relative to the editor */
  position: { left: number; top: number };
  /** Where it will go, in `baseLayout` */
  target: DropTarget | null;
  /** The pointer's last horizontal position, to tell which way it's moving */
  lastX: number;
  /**
   * Where the ghost line marking a new line for the item is, from the top of the lines' container, when that's where
   * it will go
   */
  newLineAt: number | null;
  /**
   * Where the line marking where the item will go on a line is, relative to the lines' container, when showing its
   * ghost there would change the line's height. It's shown instead of the ghost, and the line only changes once the
   * item's dropped.
   */
  insertAt: { left: number; top: number; height: number } | null;
  /**
   * The heights of the lines and of the available items when the drag started, which they don't shrink below until it
   * ends: the item leaving either (or making a line stop wrapping) would otherwise shrink the editor, moving what's
   * above it when it grows upwards (as the scene info panel does), and back again as the item moved on.
   */
  startingHeights: { lines: number; available: number } | null;
  /** The item whose place the ghost took as it arrived on the line, while it's ignored (see getSlotNearGhost) */
  arrivedOver: number | null;
};

/** A line in the editor as it's laid out: where it is, and its items (but not the ghost) and their boxes */
type MeasuredLine = {
  rect: Rect;
  /** Its left items, then its right-aligned ones */
  items: Rect[];
  leftCount: number;
  /** The boxes each side's items wrap in, null if the side has none (the ghost included) */
  leftBox: Rect | null;
  rightBox: Rect | null;
};

/** Where an item's being rendered: on a line, among the available items, following the pointer, or for measuring */
export type LineLayoutItemArea = "line" | "available" | "overlay" | "probe";

export type LineLayoutItemContext = {
  area: LineLayoutItemArea;
  /** Whether it's the dragged item's ghost, showing where it will go */
  isGhost: boolean;
  /** Whether it's among its line's right-aligned items */
  rightAligned: boolean;
};

export type LineLayoutActionContext = {
  isGhost: boolean;
  /**
   * False for copies of the item that aren't to be interacted with (the one following the pointer, and the one measured
   * to see whether a line would change height), which should render the same, but as plain elements rather than
   * buttons
   */
  interactive: boolean;
  /** Wraps a click handler so that it ignores the click a drag ends with (e.g. on a button that was pressed to drag) */
  onTap: (handler: () => void) => () => void;
};

export type LineLayoutEditorProps<T> = {
  layout: Layout<T>;
  onChange: (layout: Layout<T>) => void;
  /** What tells an item apart from the layout's others: its React key, layoutId and `data-key` */
  getKey: (item: T) => string;
  /**
   * The items that can be added to `layout` (it's without the dragged item while one's dragged), in their usual order.
   * Listed below the lines, or beside them (`availableBeside`).
   */
  getAvailable: (layout: Layout<T>) => T[];
  /**
   * What adding an available item (dragging it up, or tapping it) puts in the layout. By default the item itself, which
   * then leaves the available items. Something else (e.g. a new instance of it) leaves it there, to add again.
   */
  take?: (item: T) => T;
  /** An item's content */
  renderItem: (item: T, context: LineLayoutItemContext) => ReactNode;
  /** Buttons of an item's own, beside its × (on the lines only) */
  renderItemActions?: (item: T, context: LineLayoutActionContext) => ReactNode;
  /** What an item's called, for its buttons ("Remove …", "Add …") */
  itemLabel: (item: T) => string;
  /** Classes and data attributes of an item's element */
  itemProps?: (item: T) => { className?: string } & { [attribute: `data-${string}`]: string | undefined };
  /** Above the lines (e.g. the editor's buttons). Slides with the rest as the editor grows or shrinks. */
  toolbar?: ReactNode;
  availableHint: ReactNode;
  /** Shown in place of the lines when there are none */
  emptyHint: ReactNode;
  /** Whether the available items are beside the lines rather than below them */
  availableBeside?: boolean;
  className?: string;
};

let nextEditorId = 0;

/** How far the pointer must move before pressing an item starts dragging it */
const dragThreshold = 5;

/** Stands in the layout for the ghost of the dragged item, showing where it will go */
const ghostItem = Symbol("ghost");

function lineHeight(rect: Rect | undefined) {
  return rect && rect.bottom - rect.top;
}

/**
 * An editor for a layout of items on lines (see `Layout`), as tokens dragged onto a line beside other items, onto a
 * new line, or off the lines, and right-aligned on a line or not. The items not in the layout are listed below (or
 * beside) the lines, to drag in. How it works, and why: docs/line-layout-editor.md.
 */
export function LineLayoutEditor<T>({
  layout, onChange, getKey, getAvailable, take = item => item, renderItem, renderItemActions, itemLabel, itemProps,
  toolbar, availableHint, emptyHint, availableBeside = false, className,
}: LineLayoutEditorProps<T>) {
  // Scopes the items' layoutIds to this editor. Otherwise moving between editors (e.g. each slide has its own scene info
  // panel) had the new editor's items slide in from where the old one's were, now off screen.
  const [layoutGroupId] = useState(() => `line-layout-editor-${nextEditorId++}`);
  const editorRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const availableRef = useRef<HTMLDivElement>(null);

  // Kept in a ref as well as state: pointer events can arrive faster than the component re-renders
  const [drag, setDragState] = useState<Drag<T> | null>(null);
  const dragRef = useRef<Drag<T> | null>(null);
  const setDrag = (next: Drag<T> | null) => {
    dragRef.current = next;
    setDragState(next);
  }
  // A drag ends with a click on whatever was pressed (e.g. an item's ×), which mustn't count as a tap
  const justDraggedRef = useRef(false);

  // While an item is dragged, targets are positions in the layout without it. The line it's dragged off keeps its place
  // (and its space, see fromLineHeight) until it's dropped, even if it's left empty, so the lines after it don't move
  // up and back.
  const isDragging = !!drag?.active;
  const baseLayout = drag?.from
    ? placeItem(layout, drag.item, drag.from, { type: "remove" }, { keepEmptyLines: true })
    : layout;
  // Going on a line, the layout is shown as it will be when the item's dropped, with a ghost of it in its place. Going
  // on a new line, the lines stay as they are, with a ghost line between them where the new line will go: making the
  // new line as the item's dragged would move every line after it, and back as the item moves on. The lines move to
  // make room once it's dropped there.
  const ghostTarget = isDragging && drag.target?.type === "same-line" && !drag.insertAt ? drag.target : null;
  const shownLayout: Layout<T | typeof ghostItem> = isDragging
    ? placeItem<T | typeof ghostItem>(baseLayout, ghostItem, null, ghostTarget ?? { type: "remove" }, { keepEmptyLines: true })
    : layout;
  // In their usual order, including the dragged item: its ghost shows here, in its place, when it's dragged here
  const available = getAvailable(isDragging ? baseLayout : layout);

  /** Identifies an item's element to framer-motion, so it can animate it moving between the lines and the available items */
  const layoutId = (key: string) => `${layoutGroupId}-${key}`;

  /**
   * Where the lines and items were when the drag started. Which line an item goes on is worked out from these rather
   * than from where the lines are now: a ghost on a new line moves the lines after it down, and its leaving moves them
   * back, which would otherwise move the target under a pointer that's held still.
   */
  const startingLinesRef = useRef<MeasuredLine[]>([]);
  // Where the lines' container was then. The editor can grow upwards (e.g. as the available items take the ghost),
  // moving the lines, so the pointer is compared with where the lines were relative to where the container is now.
  const startingLinesTopRef = useRef(0);
  // The line an item's dragged off doesn't get shorter until it's dropped: its leaving (making the line stop wrapping,
  // or an item on it stop wrapping its text) would move every line after it
  const fromLineHeight = isDragging && drag.from ? lineHeight(startingLinesRef.current[drag.from.line]?.rect) : undefined;
  /**
   * Where an element in the lines is laid out on screen: where it's going rather than where it is, while framer-motion
   * slides it there with a transform. Measured mid-slide, items moved under a still pointer, so the target jumped about.
   * Items are positioned relative to the lines' container (it's `position: relative`), which isn't transformed.
   */
  const layoutRect = (element: HTMLElement, containerRect: DOMRect): Rect => {
    const left = containerRect.left + element.offsetLeft;
    const top = containerRect.top + element.offsetTop;
    return { left, right: left + element.offsetWidth, top, bottom: top + element.offsetHeight };
  }

  /** Each line shown, with where it is and where its items (but not the ghost) are */
  const measureLines = (): MeasuredLine[] => {
    const container = linesRef.current;
    if (!container) return [];
    const containerRect = container.getBoundingClientRect();
    return [...container.querySelectorAll<HTMLElement>(":scope > .layout-line")].map(lineElement => {
      const side = (name: "left" | "right") => {
        const box = lineElement.querySelector<HTMLElement>(`:scope > .line-side.${name}`);
        const items = box ? [...box.querySelectorAll<HTMLElement>(":scope > .layout-item:not(.ghost)")] : [];
        return {
          box: box?.childElementCount ? layoutRect(box, containerRect) : null,
          items: items.map(item => layoutRect(item, containerRect)),
        };
      };
      const left = side("left");
      const right = side("right");
      return {
        // The whole width of the lines, beyond the end of either side
        rect: { ...layoutRect(lineElement, containerRect), left: containerRect.left, right: containerRect.right },
        items: [...left.items, ...right.items],
        leftCount: left.items.length,
        leftBox: left.box,
        rightBox: right.box,
      };
    });
  }

  const measureGhost = () => {
    const container = linesRef.current;
    const ghost = container?.querySelector<HTMLElement>(".layout-item.ghost");
    return container && ghost ? layoutRect(ghost, container.getBoundingClientRect()) : null;
  }

  /** Where the ghost line goes for a new line before line `line` (or after the last): halfway between the lines */
  const measureNewLineAt = (line: number) => {
    const container = linesRef.current;
    if (!container) return null;
    const lines = measureLines();
    const containerTop = container.getBoundingClientRect().top;
    // Half the space between lines, which is their margins
    const lineElement = container.querySelector<HTMLElement>(":scope > .layout-line");
    const halfGap = lineElement ? parseFloat(getComputedStyle(lineElement).marginBottom) || 0 : 0;
    const above = lines[line - 1]?.rect;
    const below = lines[line]?.rect;
    const y = above && below ? (above.bottom + below.top) / 2
      : above ? above.bottom + halfGap
      : below ? below.top - halfGap
      : containerTop + container.clientHeight / 2;
    return y - containerTop;
  }

  /**
   * How tall line `line` would be with the dragged item on side `right` at `sideIndex` among that side's items, or
   * without it if `place` is null. Measured on a hidden copy of the line, laid out like it in the lines' container, so
   * the browser decides: items can shrink and wrap their text, so the line can grow without taking another row, which
   * working it out from the items' widths missed. Cached for the drag (cleared as it starts), as the lines without the
   * dragged item don't change during one.
   */
  const probeHeightsRef = useRef(new Map<string, number>());
  const probeLineHeight = (line: number, place: { right: boolean, sideIndex: number } | null) => {
    const container = linesRef.current;
    const lineElement = container?.querySelectorAll<HTMLElement>(":scope > .layout-line")[line];
    if (!container || !lineElement) return 0;
    const key = `${container.clientWidth}:${line}:${place ? `${place.right}:${place.sideIndex}` : "none"}`;
    const cached = probeHeightsRef.current.get(key);
    if (cached !== undefined) return cached;
    const copy = lineElement.cloneNode(true) as HTMLElement;
    copy.removeAttribute("style");
    copy.classList.add("height-probe");
    copy.setAttribute("aria-hidden", "true");
    copy.querySelectorAll(".layout-item.ghost").forEach(ghost => ghost.remove());
    copy.querySelectorAll(":scope > .line-side.right:empty").forEach(side => side.remove());
    if (place) {
      const sideName = place.right ? "right" : "left";
      let side = copy.querySelector<HTMLElement>(`:scope > .line-side.${sideName}`);
      if (!side) {
        side = document.createElement("div");
        side.className = `line-side ${sideName}`;
        if (place.right) copy.append(side);
        else copy.prepend(side);
      }
      // The dragged item as it would be on a line (see the probe source rendered below)
      const probeItem = editorRef.current?.querySelector(":scope > .probe-source > .layout-item");
      side.insertBefore(probeItem?.cloneNode(true) ?? document.createElement("div"), side.children[place.sideIndex] ?? null);
    }
    container.append(copy);
    const height = copy.getBoundingClientRect().height;
    copy.remove();
    probeHeightsRef.current.set(key, height);
    return height;
  }

  /**
   * If putting the dragged item on line `line` at `index` would change the line's height, where to show the line
   * marking the spot instead of the ghost: the ghost would move every line after it. It can make the line taller (taking
   * another row, or an item on it wrapping its text) or shorter (e.g. with items on both sides, which share the line in
   * proportion to their items' widths). `measured` is where the line and its other items are.
   */
  const measureInsertAt = (line: number, { index, right }: { index: number, right: boolean }, measured: MeasuredLine, current: Drag<T>): Drag<T>["insertAt"] => {
    const container = linesRef.current;
    if (!container) return null;
    const sideIndex = right ? index - measured.leftCount : index;
    // The line as it is in the layout: with the item if it's the line it's being dragged along
    const from = current.from?.line === line ? current.from : null;
    const fromRight = from ? isRightAligned(layout, from) : false;
    const asItIs = probeLineHeight(line, from && {
      right: fromRight,
      sideIndex: fromRight ? from.index - lineSides(layout[line]).left.length : from.index,
    });
    const withItem = probeLineHeight(line, { right, sideIndex });
    // Allowing for rounding. The line the item's dragged off can't get shorter while it's dragged (see fromLineHeight),
    // so on that one only its getting taller would move the lines after it.
    if (from ? withItem <= asItIs + 0.5 : Math.abs(withItem - asItIs) <= 0.5) return null;
    // Beside the items on its side, or at that end of the line if there are none
    const containerRect = container.getBoundingClientRect();
    const sideBox = container.querySelectorAll(":scope > .layout-line")[line]?.querySelector(":scope > .line-side");
    const gap = sideBox ? parseFloat(getComputedStyle(sideBox).columnGap) || 0 : 0;
    const sideItems = right ? measured.items.slice(measured.leftCount) : measured.items.slice(0, measured.leftCount);
    const next = sideItems[sideIndex];
    const previous = sideItems[sideIndex - 1];
    const beside = next ?? previous ?? measured.rect;
    // The right-aligned items run from right to left
    const left = right
      ? next ? next.right + gap / 2 : previous ? previous.left - gap / 2 : containerRect.right
      : next ? next.left - gap / 2 : previous ? previous.right + gap / 2 : containerRect.left;
    return { left: left - containerRect.left, top: beside.top - containerRect.top, height: beside.bottom - beside.top };
  }

  /** Where the item dragged to `point` would go, given where it would go before (`current.target`) */
  const measureTarget = (point: { x: number, y: number }, current: Drag<T>): Pick<Drag<T>, "target" | "arrivedOver" | "newLineAt" | "insertAt"> => {
    const availableRect = availableRef.current?.getBoundingClientRect();
    if (availableRect && contains(availableRect, point)) return { target: { type: "remove" }, arrivedOver: null, newLineAt: null, insertAt: null };
    const linesRect = linesRef.current?.getBoundingClientRect();
    const linesMoved = (linesRect?.top ?? 0) - startingLinesTopRef.current;
    const pointAtStart = { x: point.x, y: point.y - linesMoved };
    const centre = linesRect ? (linesRect.left + linesRect.right) / 2 : 0;
    const lineTarget = preferVacatedLine(getDropTarget(pointAtStart, startingLinesRef.current, centre), baseLayout, current.from);
    if (lineTarget.type === "new-line") return { target: lineTarget, arrivedOver: null, newLineAt: measureNewLineAt(lineTarget.line), insertAt: null };
    // Along the line, where its items are now, since they move aside for the ghost
    const { line } = lineTarget;
    const measured = measureLines()[line];
    if (!measured) return { target: { type: "same-line", line, index: 0, right: false }, arrivedOver: null, newLineAt: null, insertAt: null };
    const place = (index: number, right: boolean, arrivedOver: number | null) => ({
      target: { type: "same-line", line, index, right } as const,
      arrivedOver,
      newLineAt: null,
      insertAt: measureInsertAt(line, { index, right }, measured, current),
    });
    const where = sideAt(point.x, measured.rect, measured.leftBox, measured.rightBox);
    // Beside the space: at the end of the left items, or of the right-aligned ones (which run from right to left)
    if (where.side === "space") return place(where.right ? measured.items.length : measured.leftCount, where.right, null);
    // Each side wraps on its own, so where along it goes by that side's items alone. The right-aligned items run from
    // right to left, so they're mirrored, along with the pointer and the ghost, to work with them like the left ones.
    const right = where.side === "right";
    const offset = right ? measured.leftCount : 0;
    const flip = right ? mirror : (rect: Rect) => rect;
    const items = (right ? measured.items.slice(measured.leftCount) : measured.items.slice(0, measured.leftCount)).map(flip);
    const sidePoint = right ? { x: -point.x, y: point.y } : point;
    const ghost = measureGhost();
    const onLine = current.target?.type === "same-line" && current.target.line === line ? current.target : null;
    if (onLine && current.insertAt) {
      // Nothing moves aside for an insertion line, so it simply goes by which half of an item the pointer's over
      return place(offset + getSlotByMidpoints(sidePoint, items), right, null);
    }
    const fromSide = (index: number | null) => index === null ? null : index + offset;
    if (onLine && onLine.right === right) {
      const direction = Math.sign(point.x - current.lastX) * (right ? -1 : 1);
      const arrivedOver = current.arrivedOver !== null && current.arrivedOver >= offset ? current.arrivedOver - offset : null;
      const { index, ignore } = getSlotNearGhost(sidePoint, direction, items, onLine.index - offset, arrivedOver, ghost && flip(ghost));
      return place(offset + index, right, fromSide(ignore));
    }
    const { index, over } = getSlotOnArrival(sidePoint, items);
    return place(offset + index, right, fromSide(over));
  }

  const startDrag = (event: React.PointerEvent<HTMLElement>, item: T, key: string, from: LayoutPosition | null) => {
    if (event.button !== 0 || dragRef.current) return;
    const itemRect = event.currentTarget.getBoundingClientRect();
    probeHeightsRef.current.clear();
    setDrag({
      item,
      key,
      from,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      grab: { x: event.clientX - itemRect.left, y: event.clientY - itemRect.top, width: itemRect.width },
      newLineAt: null,
      insertAt: null,
      startingHeights: null,
      position: { left: 0, top: 0 },
      target: null,
      lastX: event.clientX,
      arrivedOver: null,
    });
  }

  // Pointer events are followed on the window rather than the pressed item, which re-renders elsewhere (as the
  // ghost) once the drag starts. Kept in a ref so the listeners always see the latest layout.
  const pointerHandlersRef = useRef<{ move: (event: PointerEvent) => void, end: (event: PointerEvent) => void }>({ move: () => {}, end: () => {} });
  pointerHandlersRef.current = {
    move: (event) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      if (!current.active && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < dragThreshold) return;
      const editorRect = editorRef.current?.getBoundingClientRect();
      const position = {
        left: event.clientX - current.grab.x - (editorRect?.left ?? 0),
        top: event.clientY - current.grab.y - (editorRect?.top ?? 0),
      };
      let measured: Pick<Drag<T>, "target" | "arrivedOver" | "newLineAt" | "insertAt">;
      if (!current.active) {
        // The layout on screen is still as it was when the drag started until it's re-rendered for the drag
        startingLinesRef.current = measureLines();
        startingLinesTopRef.current = linesRef.current?.getBoundingClientRect().top ?? 0;
        // The ghost starts where the item was
        measured = current.from
          ? { target: { type: "same-line", ...current.from, right: isRightAligned(layout, current.from) }, arrivedOver: null, newLineAt: null, insertAt: null }
          : measureTarget({ x: event.clientX, y: event.clientY }, current);
      } else {
        measured = measureTarget({ x: event.clientX, y: event.clientY }, current);
      }
      const startingHeights = current.startingHeights ?? {
        lines: linesRef.current?.offsetHeight ?? 0,
        available: availableRef.current?.offsetHeight ?? 0,
      };
      setDrag({ ...current, ...measured, active: true, position, lastX: event.clientX, startingHeights });
    },
    end: (event) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      // In one render: dropping the item and ending the drag. Rendered one at a time, the new layout would briefly be
      // shown with the old drag's ghost and target.
      unstable_batchedUpdates(() => {
        if (current.active) {
          justDraggedRef.current = true;
          setTimeout(() => justDraggedRef.current = false);
          if (current.target) onChange(placeItem(baseLayout, current.item, null, current.target));
        }
        setDrag(null);
      });
    },
  };
  /**
   * Where each side of the lines that wrap onto more rows has its later rows, from the top of the lines' container, for
   * the marker showing they're one line. Measured after every render (and when the editor's resized) as wrapping is down
   * to layout.
   */
  const [wrappedRows, setWrappedRows] = useState<{ line: number; side: "left" | "right"; top: number; height: number }[]>([]);
  const measureWrappedRows = () => {
    const container = linesRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const nextRows = measureLines().flatMap(({ items, leftCount }, line) => (["left", "right"] as const).flatMap(side => {
      // Each side wraps on its own. Its later rows start with an item before (left of, mirrored on the right), or below,
      // the one before it.
      const sideItems = side === "left" ? items.slice(0, leftCount) : items.slice(leftCount).map(mirror);
      const first = sideItems.findIndex((item, index) => index > 0 && startsRow(item, sideItems[index - 1]));
      if (first === -1) return [];
      const top = Math.min(...sideItems.slice(first).map(item => item.top));
      const bottom = Math.max(...sideItems.slice(first).map(item => item.bottom));
      return [{ line, side, top: top - containerRect.top, height: bottom - top }];
    }));
    setWrappedRows(previous => JSON.stringify(previous) === JSON.stringify(nextRows) ? previous : nextRows);
  }
  useLayoutEffect(measureWrappedRows);

  // Highlighted, so it's clear which right-aligned items share it with which left ones. Hovering a line does too (CSS).
  const targetLine = isDragging && drag.target?.type === "same-line" ? drag.target.line : null;

  useEffect(() => {
    const container = linesRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => measureWrappedRows());
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const hasDrag = drag !== null;
  useEffect(() => {
    if (!hasDrag) return;
    const move = (event: PointerEvent) => pointerHandlersRef.current.move(event);
    const end = (event: PointerEvent) => pointerHandlersRef.current.end(event);
    const cancel = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [hasDrag]);

  const onTap = (handler: () => void) => () => {
    if (justDraggedRef.current) return;
    handler();
  };

  /** The item's buttons, as on a line, for copies of it that aren't to be interacted with */
  const staticActions = (item: T) => <>
    {renderItemActions?.(item, { isGhost: false, interactive: false, onTap })}
    <span className="item-button remove-item btn"><XLg /></span>
  </>;

  /**
   * An item on the lines. The dragged item's ghost is its own element (same key), moved to where it will go and
   * dimmed, so it slides there like any other item. A separate ghost element sharing its layoutId would be cross-faded
   * with it by framer-motion, flickering solid.
   */
  const lineItem = ({ item, key, line, from, isGhost, rightAligned = false }: {
    /** Null for the ghost shown in the available items */
    item: T, key: string, line: number | null, from: LayoutPosition | null, isGhost: boolean,
    /** Whether it's among its line's right-aligned items */
    rightAligned?: boolean,
  }) => {
    const { className: itemClassName, ...dataAttributes } = itemProps?.(item) ?? {};
    return <Badge
      as={motion.div}
      // Items slide into their new places as they move about
      layout="position"
      // Lets an item slide between the lines and the available items, as it's re-mounted moving between them
      layoutId={layoutId(key)}
      variant="secondary"
      pill
      key={key}
      className={cx("tag-item", "layout-item", itemClassName, { ghost: isGhost })}
      {...dataAttributes}
      data-key={getKey(item)}
      data-line={line ?? undefined}
      aria-hidden={isGhost || undefined}
      onPointerDown={from ? (event: React.PointerEvent<HTMLElement>) => startDrag(event, item, key, from) : undefined}
    >
      {renderItem(item, { area: line === null ? "available" : "line", isGhost, rightAligned })}
      {/* As with the ×, pressing them and dragging still drags the item, and the ghost has them too */}
      {line !== null && renderItemActions?.(item, { isGhost, interactive: true, onTap: handler => onTap(() => from && handler()) })}
      {/* Pressing the × and dragging still drags the item. The ghost has one too, so it's the same size as the item. */}
      {line !== null && <Button
        className="item-button remove-item"
        aria-label={`Remove ${itemLabel(item)}`}
        tabIndex={isGhost ? -1 : undefined}
        onClick={onTap(() => {
          if (from) onChange(placeItem(layout, item, from, { type: "remove" }));
        })}
      >
        <XLg />
      </Button>}
    </Badge>;
  };

  return <LayoutGroup id={layoutGroupId}><div
    className={cx("LineLayoutEditor", className, { dragging: isDragging, "side-by-side": availableBeside })}
    ref={editorRef}
  >
    {/* Slides, like the items, when the editor grows or shrinks */}
    {toolbar && <motion.div layout="position" className="layout-toolbar">{toolbar}</motion.div>}
    {/*
      Each line has its left items and its right-aligned ones side by side, each in a box wrapping on its own. An item
      moving to another line or side is re-mounted there, and slides there as its layoutId is the same.
    */}
    <div
      className="layout-lines"
      ref={linesRef}
      style={isDragging && drag.startingHeights ? { minHeight: drag.startingHeights.lines } : undefined}
    >
      {(() => {
        // Items need unique keys, which the layout may not give them (e.g. items this version of the layout's owner
        // doesn't know, which it keeps as they are)
        const seen = new Map<string, number>();
        return shownLayout.map((line, lineIndex) => {
          const { left, right } = lineSides(line);
          const item = (entry: T | typeof ghostItem, index: number) => {
            const rightAligned = index >= left.length;
            if (entry === ghostItem) {
              return drag && lineItem({ item: drag.item, key: drag.key, line: lineIndex, from: null, isGhost: true, rightAligned });
            }
            // Only its position in the saved layout when nothing is being dragged, the only time it's used
            const from = { line: lineIndex, index };
            const key = getKey(entry);
            const occurrence = seen.get(key) ?? 0;
            seen.set(key, occurrence + 1);
            return lineItem({ item: entry, key: occurrence ? `${key}-${occurrence}` : key, line: lineIndex, from, isGhost: false, rightAligned });
          };
          // The line an item was dragged off, which keeps its space, left empty
          const vacated = !left.length && !right.length;
          return <div
            key={lineIndex}
            className={cx("layout-line", { "vacated-line": vacated, target: lineIndex === targetLine })}
            data-line={lineIndex}
            style={lineIndex === drag?.from?.line && fromLineHeight !== undefined ? { minHeight: fromLineHeight } : undefined}
          >
            {!vacated && <div className="line-side left">{left.map((entry, index) => item(entry, index))}</div>}
            {right.length > 0 && <div className="line-side right">{right.map((entry, index) => item(entry, left.length + index))}</div>}
          </div>;
        });
      })()}
      {!shownLayout.length && <div className="layout-empty">{emptyHint}</div>}
      {wrappedRows.map(({ line, side, top, height }) => (
        // In the indent of the side's later rows, one for all of them. Slides with them, like the items.
        <motion.div layout="position" key={`${line}-${side}`} className={cx("wrapped-line-marker", side)} style={{ top, height }} aria-hidden>
          {side === "left" ? <ArrowReturnRight /> : <ArrowReturnLeft />}
        </motion.div>
      ))}
      {isDragging && drag.target?.type === "same-line" && drag.insertAt && <div
        className="insertion-line"
        style={drag.insertAt}
        aria-hidden
      />}
      {isDragging && drag.target?.type === "new-line" && drag.newLineAt !== null && <div
        className={cx("ghost-line", { right: drag.target.right })}
        style={{ top: drag.newLineAt }}
        aria-hidden
      />}
    </div>
    <motion.div
      layout="position"
      className={cx("available-items", {"drop-to-remove": isDragging && drag.from && drag.target?.type === "remove"})}
      style={isDragging && drag.startingHeights ? { minHeight: drag.startingHeights.available } : undefined}
      ref={availableRef}
    >
      <p className="hint">{availableHint}</p>
      <div className="available-item-list">
        {available.map(item => {
          const key = getKey(item);
          if (isDragging && key === getKey(drag.item)) {
            return drag.target?.type === "remove" && lineItem({ item: drag.item, key: drag.key, line: null, from: null, isGhost: true });
          }
          const { className: itemClassName, ...dataAttributes } = itemProps?.(item) ?? {};
          return <Badge
            as={motion.button}
            layout="position"
            layoutId={layoutId(key)}
            type="button"
            variant="secondary"
            pill
            key={key}
            className={cx("tag-item", "layout-item", itemClassName)}
            {...dataAttributes}
            data-key={key}
            aria-label={`Add ${itemLabel(item)}`}
            onPointerDown={(event: React.PointerEvent<HTMLElement>) => {
              // What's dragged is what adding it puts in the layout (e.g. a new instance of it, leaving it here), which
              // keeps its key from its ghost to its element once it's dropped
              const taken = take(item);
              startDrag(event, taken, getKey(taken), null);
            }}
            onClick={onTap(() => {
              // Tapping one adds it at the bottom
              onChange(placeItem(layout, take(item), null, { type: "new-line", line: layout.length, right: false }));
            })}
          >
            {renderItem(item, { area: "available", isGhost: false, rightAligned: false })}
          </Badge>;
        })}
      </div>
    </motion.div>
    {isDragging && <div
      className="drag-overlay"
      style={{ left: drag.position.left, top: drag.position.top, width: drag.grab.width }}
    >
      <Badge as="div" variant="secondary" pill className={cx("tag-item", "layout-item", "dragged", itemProps?.(drag.item).className)}>
        {renderItem(drag.item, { area: "overlay", isGhost: false, rightAligned: false })}
        {drag.from && staticActions(drag.item)}
      </Badge>
    </div>}
    {/*
      The dragged item as it would be on a line (with its buttons), unseen, for measuring whether a line would change
      height with it on (see probeLineHeight). Rendered as the item's pressed, before the drag's first move measures.
      Laid out (not `display: none`), as the item following the pointer is, so items that measure themselves (e.g.
      capping their contents to a number of rows) do so as they would there.
    */}
    {drag && <div className="probe-source" aria-hidden style={{ width: drag.from ? drag.grab.width : undefined }}>
      <Badge as="div" variant="secondary" pill className={cx("tag-item", "layout-item", itemProps?.(drag.item).className)}>
        {renderItem(drag.item, { area: "probe", isGhost: false, rightAligned: false })}
        {staticActions(drag.item)}
      </Badge>
    </div>}
  </div></LayoutGroup>
}
