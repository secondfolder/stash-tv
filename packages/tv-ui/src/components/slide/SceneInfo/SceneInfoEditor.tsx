import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LayoutGroup, motion } from "framer-motion";
import { unstable_batchedUpdates } from "react-dom";
import cx from "classnames";
import { Badge, Button, ButtonGroup } from "react-bootstrap";
import { ArrowReturnLeft, ArrowReturnRight, XLg } from "react-bootstrap-icons";
import { SceneInfoField } from "./fields";
import { useWindowSize } from "../../../hooks/useWindowSize";
import { useGlobalState } from "../../../store/globalState";
import {
  DropTarget,
  fieldsNotInLayout,
  getDropTarget,
  getSlotNearGhost,
  getSlotOnArrival,
  getSlotByMidpoints,
  noValueLabel,
  isKnownField,
  isRightAligned,
  LayoutPosition,
  lineFields,
  lineSides,
  placeField,
  preferVacatedLine,
  Rect,
  SceneInfoEditorPillContent,
  SceneInfoLayout,
  sceneInfoFieldLabels,
  sideAt,
  startsRow,
} from "./scene-info-config";

type Drag = {
  field: string;
  /** The React key of the field's pill, which is kept by its ghost so it's the same element, just moved and dimmed */
  key: string;
  /** Where the field was in the layout, or null if it's being dragged in from the unused fields */
  from: LayoutPosition | null;
  pointerId: number;
  startX: number;
  startY: number;
  /** Whether the pointer has moved far enough for this to be a drag rather than a tap */
  active: boolean;
  /** Where in the pill it was grabbed, and its size, so the pill being dragged stays under the pointer */
  grab: { x: number; y: number; width: number };
  /** Where the pill being dragged is, relative to the editor */
  position: { left: number; top: number };
  /** Where it will go, in `baseLayout` */
  target: DropTarget | null;
  /** The pointer's last horizontal position, to tell which way it's moving */
  lastX: number;
  /**
   * Where the ghost line marking a new line for the field is, from the top of the lines' container, when that's where
   * it will go
   */
  newLineAt: number | null;
  /**
   * Where the line marking where the field will go on a line is, relative to the lines' container, when showing its
   * ghost there would make the line wrap onto another row. It's shown instead of the ghost, and the line only wraps
   * once the field's dropped.
   */
  insertAt: { left: number; top: number; height: number } | null;
  /**
   * The heights of the lines and of the unused fields when the drag started, which they don't shrink below until it
   * ends: the field leaving either (or making a line stop wrapping) would otherwise shrink the panel, moving what's
   * above. The panel grows upwards, so that moved every line above, and back again as the field moved on.
   */
  startingHeights: { lines: number; unused: number } | null;
  /** The field whose place the ghost took as it arrived on the line, while it's ignored (see getSlotNearGhost) */
  arrivedOver: number | null;
};

/** A line in the editor as it's laid out: where it is, and its fields (but not the ghost) and their boxes */
type MeasuredLine = {
  rect: Rect;
  /** Its left fields, then its right-aligned ones */
  fields: Rect[];
  leftCount: number;
  /** The boxes each side's fields wrap in, null if the side has none (the ghost included) */
  leftBox: Rect | null;
  rightBox: Rect | null;
};

let nextEditorId = 0;

/** How far the pointer must move before pressing a field starts dragging it */
const dragThreshold = 5;

/** Stands in the layout for the ghost of the dragged field, showing where it will go */
const ghostField = "\u0000ghost";

const shownValuesLabels: Record<SceneInfoEditorPillContent, string> = {
  names: "Field name",
  values: "Field value",
};

/**
 * Identifies a field's pill to framer-motion, so it can animate it moving between the lines and the unused fields. Only
 * the current slide's panel shows the editor, so these are unique.
 */
function layoutId(field: string) {
  return `scene-info-field-${field}`;
}

function lineHeight(rect: Rect | undefined) {
  return rect && rect.bottom - rect.top;
}

function fieldName(field: string) {
  return isKnownField(field) ? sceneInfoFieldLabels[field] : "Unknown field";
}

/**
 * A rect mirrored left to right. A line's right-aligned fields are laid out from right to left (the first at the line's
 * end), mirroring its left fields, so mirrored they can be worked with as fields laid out from left to right.
 */
function mirror(rect: Rect): Rect {
  return { ...rect, left: -rect.right, right: -rect.left };
}

function contains(rect: Rect, point: { x: number, y: number }) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

/**
 * The panel's fields as pills, laid out on the lines they're shown on. Pills are dragged onto a line beside other
 * fields or onto a new line, and the fields not in the panel are listed below to drag in.
 */
export function SceneInfoEditor({ scene, layout, onChange, onReset, isDefault, onSave, onCancel }: {
  scene: GQL.SceneDataFragment;
  layout: SceneInfoLayout;
  onChange: (layout: SceneInfoLayout) => void;
  onReset: () => void;
  /** Whether the layout is the default one, which hides "Reset to default" as in the settings */
  isDefault: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  // Global state, as each slide has its own editor, so it's kept moving to another slide while editing
  const { sceneInfoEditorPillContent: shownValues, set: setGlobalState } = useGlobalState();
  const setShownValues = (content: SceneInfoEditorPillContent) => setGlobalState("sceneInfoEditorPillContent", content);
  // Scopes the pills' layoutIds to this editor. Otherwise moving to another slide while editing (each slide has its own
  // editor) had the new editor's pills slide in from where the old one's were, now off screen.
  const [layoutGroupId] = useState(() => `scene-info-editor-${nextEditorId++}`);
  // Side by side when the screen's wider than it's tall (useWindowSize allows for forced landscape)
  const { orientation } = useWindowSize();
  const showValues = shownValues === "values";
  const editorRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const unusedRef = useRef<HTMLDivElement>(null);

  // Kept in a ref as well as state: pointer events can arrive faster than the component re-renders
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  }
  // A drag ends with a click on whatever was pressed (e.g. a pill's ×), which mustn't count as a tap
  const justDraggedRef = useRef(false);

  // While a field is dragged, targets are positions in the layout without it. The line it's dragged off keeps its place
  // (and its space, see fromLineHeight) until it's dropped, even if it's left empty, so the lines after it don't move
  // up and back.
  const isDragging = !!drag?.active;
  const baseLayout = drag?.from
    ? placeField(layout, drag.field, drag.from, { type: "remove" }, { keepEmptyLines: true })
    : layout;
  // Going on a line, the layout is shown as it will be when the field's dropped, with a ghost of it in its place. Going
  // on a new line, the lines stay as they are, with a ghost line between them where the new line will go: making the
  // new line as the field's dragged would move every line after it, and back as the field moves on. The lines move to
  // make room once it's dropped there.
  const ghostTarget = isDragging && drag.target?.type === "same-line" && !drag.insertAt ? drag.target : null;
  const shownLayout = isDragging
    ? placeField(baseLayout, ghostField, null, ghostTarget ?? { type: "remove" }, { keepEmptyLines: true })
    : layout;
  // In their usual order, including the dragged field: its ghost shows here, in its place, when it's dragged here
  const unused = fieldsNotInLayout(isDragging ? baseLayout : layout);

  /**
   * Where the lines and pills were when the drag started. Which line a field goes on is worked out from these rather
   * than from where the lines are now: a ghost on a new line moves the lines after it down, and its leaving moves them
   * back, which would otherwise move the target under a pointer that's held still.
   */
  const startingLinesRef = useRef<MeasuredLine[]>([]);
  // Where the lines' container was then. The panel grows upwards (e.g. as the unused fields take the ghost), moving the
  // lines, so the pointer is compared with where the lines were relative to where the container is now.
  const startingLinesTopRef = useRef(0);
  // The line a field's dragged off doesn't get shorter until it's dropped: its leaving (making the line stop wrapping,
  // or a pill on it stop wrapping its text) would move every line after it
  const fromLineHeight = isDragging && drag.from ? lineHeight(startingLinesRef.current[drag.from.line]?.rect) : undefined;
  /**
   * Where an item in the lines is laid out on screen: where it's going rather than where it is, while framer-motion
   * slides it there with a transform. Measured mid-slide, items moved under a still pointer, so the target jumped about.
   * Items are positioned relative to the lines' container (it's `position: relative`), which isn't transformed.
   */
  const layoutRect = (item: HTMLElement, containerRect: DOMRect): Rect => {
    const left = containerRect.left + item.offsetLeft;
    const top = containerRect.top + item.offsetTop;
    return { left, right: left + item.offsetWidth, top, bottom: top + item.offsetHeight };
  }

  /** Each line shown, with where it is and where its fields (but not the ghost) are */
  const measureLines = (): MeasuredLine[] => {
    const container = linesRef.current;
    if (!container) return [];
    const containerRect = container.getBoundingClientRect();
    return [...container.querySelectorAll<HTMLElement>(":scope > .editor-line")].map(lineElement => {
      const side = (name: "left" | "right") => {
        const box = lineElement.querySelector<HTMLElement>(`:scope > .line-side.${name}`);
        const pills = box ? [...box.querySelectorAll<HTMLElement>(":scope > .field-pill:not(.ghost)")] : [];
        return {
          box: box?.childElementCount ? layoutRect(box, containerRect) : null,
          fields: pills.map(pill => layoutRect(pill, containerRect)),
        };
      };
      const left = side("left");
      const right = side("right");
      return {
        // The whole width of the lines, beyond the end of either side
        rect: { ...layoutRect(lineElement, containerRect), left: containerRect.left, right: containerRect.right },
        fields: [...left.fields, ...right.fields],
        leftCount: left.fields.length,
        leftBox: left.box,
        rightBox: right.box,
      };
    });
  }

  const measureGhost = () => {
    const container = linesRef.current;
    const ghost = container?.querySelector<HTMLElement>(".field-pill.ghost");
    return container && ghost ? layoutRect(ghost, container.getBoundingClientRect()) : null;
  }

  /** Where the ghost line goes for a new line before line `line` (or after the last): halfway between the lines */
  const measureNewLineAt = (line: number) => {
    const container = linesRef.current;
    if (!container) return null;
    const lines = measureLines();
    const containerTop = container.getBoundingClientRect().top;
    // Half the space between lines, which is their margins
    const lineElement = container.querySelector<HTMLElement>(":scope > .editor-line");
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
   * How tall line `line` would be with the dragged field on side `right` at `sideIndex` among that side's fields, or
   * without it if `place` is null. Measured on a hidden copy of the line, laid out like it in the lines' container, so
   * the browser decides: showing values, pills shrink and their text wraps (a long description or URL), so the line can
   * grow without taking another row, which working it out from the pills' widths missed. Cached for the drag (cleared
   * as it starts), as the lines without the dragged field don't change during one.
   */
  const probeHeightsRef = useRef(new Map<string, number>());
  const probeLineHeight = (line: number, place: { right: boolean, sideIndex: number } | null, field: string) => {
    const container = linesRef.current;
    const lineElement = container?.querySelectorAll<HTMLElement>(":scope > .editor-line")[line];
    if (!container || !lineElement) return 0;
    const key = `${container.clientWidth}:${line}:${place ? `${place.right}:${place.sideIndex}` : "none"}`;
    const cached = probeHeightsRef.current.get(key);
    if (cached !== undefined) return cached;
    const copy = lineElement.cloneNode(true) as HTMLElement;
    copy.removeAttribute("style");
    copy.classList.add("height-probe");
    copy.setAttribute("aria-hidden", "true");
    copy.querySelectorAll(".field-pill.ghost").forEach(ghost => ghost.remove());
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
      side.insertBefore(copyOfDraggedPill(field), side.children[place.sideIndex] ?? null);
    }
    container.append(copy);
    const height = copy.getBoundingClientRect().height;
    copy.remove();
    probeHeightsRef.current.set(key, height);
    return height;
  }

  /** A copy of the dragged field's pill as it is on a line (with its ×), for `probeLineHeight` */
  const copyOfDraggedPill = (field: string) => {
    const editor = editorRef.current!;
    // The pill following the pointer, or before it's shown (the drag's first move), the field's pill itself
    const source = editor.querySelector<HTMLElement>(".drag-overlay .field-pill")
      ?? editor.querySelector<HTMLElement>(`.field-pill[data-field="${CSS.escape(field)}"]`);
    // A div, like the pills on the lines: the unused fields' are buttons, which are styled a little differently
    const pill = document.createElement("div");
    if (!source) return pill;
    pill.className = source.className;
    pill.classList.remove("dragged", "ghost");
    pill.append(...[...source.childNodes].map(node => node.cloneNode(true)));
    // The unused fields have no ×, which they get on a line
    const removeButton = editor.querySelector(".editor-lines .field-pill .remove-field");
    if (!pill.querySelector(".remove-field") && removeButton) pill.append(removeButton.cloneNode(true));
    return pill;
  }

  /**
   * If putting the dragged field on line `line` at `index` would change the line's height, where to show the line
   * marking the spot instead of the ghost: the ghost would move every line after it. It can make the line taller (taking
   * another row, or a pill on it wrapping its text) or shorter (e.g. with fields on both sides, which share the line in
   * proportion to their fields' widths). `measured` is where the line and its other fields are.
   */
  const measureInsertAt = (line: number, { index, right }: { index: number, right: boolean }, measured: MeasuredLine, current: Drag): Drag["insertAt"] => {
    const container = linesRef.current;
    if (!container) return null;
    const sideIndex = right ? index - measured.leftCount : index;
    // The line as it is in the layout: with the field if it's the line it's being dragged along
    const from = current.from?.line === line ? current.from : null;
    const fromRight = from ? isRightAligned(layout, from) : false;
    const asItIs = probeLineHeight(line, from && {
      right: fromRight,
      sideIndex: fromRight ? from.index - lineSides(layout[line]).left.length : from.index,
    }, current.field);
    const withField = probeLineHeight(line, { right, sideIndex }, current.field);
    // Allowing for rounding. The line the field's dragged off can't get shorter while it's dragged (see fromLineHeight),
    // so on that one only its getting taller would move the lines after it.
    if (from ? withField <= asItIs + 0.5 : Math.abs(withField - asItIs) <= 0.5) return null;
    // Beside the fields on its side, or at that end of the line if there are none
    const containerRect = container.getBoundingClientRect();
    const sideBox = container.querySelectorAll(":scope > .editor-line")[line]?.querySelector(":scope > .line-side");
    const gap = sideBox ? parseFloat(getComputedStyle(sideBox).columnGap) || 0 : 0;
    const sideFields = right ? measured.fields.slice(measured.leftCount) : measured.fields.slice(0, measured.leftCount);
    const next = sideFields[sideIndex];
    const previous = sideFields[sideIndex - 1];
    const beside = next ?? previous ?? measured.rect;
    // The right-aligned fields run from right to left
    const left = right
      ? next ? next.right + gap / 2 : previous ? previous.left - gap / 2 : containerRect.right
      : next ? next.left - gap / 2 : previous ? previous.right + gap / 2 : containerRect.left;
    return { left: left - containerRect.left, top: beside.top - containerRect.top, height: beside.bottom - beside.top };
  }

  /** Where the field dragged to `point` would go, given where it would go before (`current.target`) */
  const measureTarget = (point: { x: number, y: number }, current: Drag): Pick<Drag, "target" | "arrivedOver" | "newLineAt" | "insertAt"> => {
    const unusedRect = unusedRef.current?.getBoundingClientRect();
    if (unusedRect && contains(unusedRect, point)) return { target: { type: "remove" }, arrivedOver: null, newLineAt: null, insertAt: null };
    const linesRect = linesRef.current?.getBoundingClientRect();
    const linesMoved = (linesRect?.top ?? 0) - startingLinesTopRef.current;
    const pointAtStart = { x: point.x, y: point.y - linesMoved };
    const centre = linesRect ? (linesRect.left + linesRect.right) / 2 : 0;
    const lineTarget = preferVacatedLine(getDropTarget(pointAtStart, startingLinesRef.current, centre), baseLayout, current.from);
    if (lineTarget.type === "new-line") return { target: lineTarget, arrivedOver: null, newLineAt: measureNewLineAt(lineTarget.line), insertAt: null };
    // Along the line, where its fields are now, since they move aside for the ghost
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
    // Beside the space: at the end of the left fields, or of the right-aligned ones (which run from right to left)
    if (where.side === "space") return place(where.right ? measured.fields.length : measured.leftCount, where.right, null);
    // Each side wraps on its own, so where along it goes by that side's fields alone. The right-aligned fields run from
    // right to left, so they're mirrored, along with the pointer and the ghost, to work with them like the left ones.
    const right = where.side === "right";
    const offset = right ? measured.leftCount : 0;
    const flip = right ? mirror : (rect: Rect) => rect;
    const fields = (right ? measured.fields.slice(measured.leftCount) : measured.fields.slice(0, measured.leftCount)).map(flip);
    const sidePoint = right ? { x: -point.x, y: point.y } : point;
    const ghost = measureGhost();
    const onLine = current.target?.type === "same-line" && current.target.line === line ? current.target : null;
    if (onLine && current.insertAt) {
      // Nothing moves aside for an insertion line, so it simply goes by which half of a field the pointer's over
      return place(offset + getSlotByMidpoints(sidePoint, fields), right, null);
    }
    const fromSide = (index: number | null) => index === null ? null : index + offset;
    if (onLine && onLine.right === right) {
      const direction = Math.sign(point.x - current.lastX) * (right ? -1 : 1);
      const arrivedOver = current.arrivedOver !== null && current.arrivedOver >= offset ? current.arrivedOver - offset : null;
      const { index, ignore } = getSlotNearGhost(sidePoint, direction, fields, onLine.index - offset, arrivedOver, ghost && flip(ghost));
      return place(offset + index, right, fromSide(ignore));
    }
    const { index, over } = getSlotOnArrival(sidePoint, fields);
    return place(offset + index, right, fromSide(over));
  }

  const startDrag = (event: React.PointerEvent<HTMLElement>, field: string, key: string, from: LayoutPosition | null) => {
    if (event.button !== 0 || dragRef.current) return;
    const pillRect = event.currentTarget.getBoundingClientRect();
    probeHeightsRef.current.clear();
    setDrag({
      field,
      key,
      from,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      grab: { x: event.clientX - pillRect.left, y: event.clientY - pillRect.top, width: pillRect.width },
      newLineAt: null,
      insertAt: null,
      startingHeights: null,
      position: { left: 0, top: 0 },
      target: null,
      lastX: event.clientX,
      arrivedOver: null,
    });
  }

  // Pointer events are followed on the window rather than the pressed pill, which re-renders elsewhere (as the
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
      let measured: Pick<Drag, "target" | "arrivedOver" | "newLineAt" | "insertAt">;
      if (!current.active) {
        // The layout on screen is still as it was when the drag started until it's re-rendered for the drag
        startingLinesRef.current = measureLines();
        startingLinesTopRef.current = linesRef.current?.getBoundingClientRect().top ?? 0;
        // The ghost starts where the field was
        measured = current.from
          ? { target: { type: "same-line", ...current.from, right: isRightAligned(layout, current.from) }, arrivedOver: null, newLineAt: null, insertAt: null }
          : measureTarget({ x: event.clientX, y: event.clientY }, current);
      } else {
        measured = measureTarget({ x: event.clientX, y: event.clientY }, current);
      }
      const startingHeights = current.startingHeights ?? {
        lines: linesRef.current?.offsetHeight ?? 0,
        unused: unusedRef.current?.offsetHeight ?? 0,
      };
      setDrag({ ...current, ...measured, active: true, position, lastX: event.clientX, startingHeights });
    },
    end: (event) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      // In one render: dropping the field and ending the drag. Rendered one at a time, the new layout would briefly be
      // shown with the old drag's ghost and target.
      unstable_batchedUpdates(() => {
        if (current.active) {
          justDraggedRef.current = true;
          setTimeout(() => justDraggedRef.current = false);
          if (current.target) onChange(placeField(baseLayout, current.field, null, current.target));
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
    const nextRows = measureLines().flatMap(({ fields, leftCount }, line) => (["left", "right"] as const).flatMap(side => {
      // Each side wraps on its own. Its later rows start with a field before (left of, mirrored on the right), or below,
      // the one before it.
      const sideFields = side === "left" ? fields.slice(0, leftCount) : fields.slice(leftCount).map(mirror);
      const first = sideFields.findIndex((field, index) => index > 0 && startsRow(field, sideFields[index - 1]));
      if (first === -1) return [];
      const top = Math.min(...sideFields.slice(first).map(field => field.top));
      const bottom = Math.max(...sideFields.slice(first).map(field => field.bottom));
      return [{ line, side, top: top - containerRect.top, height: bottom - top }];
    }));
    setWrappedRows(previous => JSON.stringify(previous) === JSON.stringify(nextRows) ? previous : nextRows);
  }
  useLayoutEffect(measureWrappedRows);

  // Highlighted, so it's clear which right-aligned fields share it with which left ones. Hovering a line does too (CSS).
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

  /**
   * A field's pill on the lines. The dragged field's ghost is its own pill (same key), moved to where it will go and
   * dimmed, so it slides there like any other pill. A separate ghost element sharing its layoutId would be cross-faded
   * with it by framer-motion, flickering solid.
   */
  const linePill = ({ field, key, line, from, isGhost }: {
    /** Null for the ghost shown in the unused fields */
    field: string, key: string, line: number | null, from: LayoutPosition | null, isGhost: boolean,
  }) => <Badge
    as={motion.div}
    // Pills slide into their new places as fields move about
    layout="position"
    // Lets a field slide between the lines and the unused fields, as it's re-mounted moving between them
    layoutId={layoutId(key)}
    variant="secondary"
    pill
    key={key}
    className={cx("tag-item", "field-pill", {unknown: !isKnownField(field), ghost: isGhost})}
    data-field={field}
    data-line={line ?? undefined}
    aria-hidden={isGhost || undefined}
    onPointerDown={from ? (event: React.PointerEvent<HTMLElement>) => startDrag(event, field, key, from) : undefined}
  >
    <PillContent field={field} scene={scene} showValues={showValues} />
    {/* Pressing the × and dragging still drags the pill. The ghost has one too, so it's the same size as the pill. */}
    {line !== null && <Button
      className="remove-field"
      aria-label={`Remove ${fieldName(field)}`}
      tabIndex={isGhost ? -1 : undefined}
      onClick={() => {
        if (justDraggedRef.current || !from) return;
        onChange(placeField(layout, field, from, { type: "remove" }));
      }}
    >
      <XLg />
    </Button>}
  </Badge>;

  return <LayoutGroup id={layoutGroupId}><div
    className={cx("editor", {dragging: isDragging, "showing-values": showValues, "side-by-side": orientation === "landscape"})}
    ref={editorRef}
  >
    {/* Slides, like the pills, when the panel grows or shrinks */}
    <motion.div layout="position" className="editor-toolbar">
      <div className="shown-values">
        {/* The group's own label names it for screen readers */}
        <span aria-hidden>Show…</span>
        <ButtonGroup aria-label="Show">
          {(["names", "values"] as const).map(option => {
            const active = option === shownValues;
            return <Button
              key={option}
              variant={active ? "primary" : "secondary"}
              active={active}
              aria-pressed={active}
              onClick={() => setShownValues(option)}
            >
              {shownValuesLabels[option]}
            </Button>
          })}
        </ButtonGroup>
      </div>
      <div className="editor-actions">
        {/* As in the settings */}
        {!isDefault && <Button variant="outline-warning" className="reset" onClick={onReset}>Reset to default</Button>}
        <Button variant="secondary" className="cancel" onClick={onCancel}>Cancel</Button>
        <Button className="save" onClick={onSave}>Save</Button>
      </div>
    </motion.div>
    {/*
      Each line has its left fields and its right-aligned ones side by side, each in a box wrapping on its own. A field
      moving to another line or side is re-mounted there, and slides there as its layoutId is the same.
    */}
    <div
      className="editor-lines"
      ref={linesRef}
      style={isDragging && drag.startingHeights ? { minHeight: drag.startingHeights.lines } : undefined}
    >
      {(() => {
        // A field can only be in the layout once, apart from fields this version doesn't know, which still need unique keys
        const seen = new Map<string, number>();
        return shownLayout.map((line, lineIndex) => {
          const { left, right } = lineSides(line);
          const pill = (field: string, index: number) => {
            if (field === ghostField && drag) {
              return linePill({ field: drag.field, key: drag.key, line: lineIndex, from: null, isGhost: true });
            }
            // Only its position in the saved layout when nothing is being dragged, the only time it's used
            const from = { line: lineIndex, index };
            const occurrence = seen.get(field) ?? 0;
            seen.set(field, occurrence + 1);
            return linePill({ field, key: occurrence ? `${field}-${occurrence}` : field, line: lineIndex, from, isGhost: false });
          };
          // The line a field was dragged off, which keeps its space, left empty
          const vacated = !left.length && !right.length;
          return <div
            key={lineIndex}
            className={cx("editor-line", { "vacated-line": vacated, target: lineIndex === targetLine })}
            data-line={lineIndex}
            style={lineIndex === drag?.from?.line && fromLineHeight !== undefined ? { minHeight: fromLineHeight } : undefined}
          >
            {!vacated && <div className="line-side left">{left.map((field, index) => pill(field, index))}</div>}
            {right.length > 0 && <div className="line-side right">{right.map((field, index) => pill(field, left.length + index))}</div>}
          </div>;
        });
      })()}
      {!shownLayout.length && <div className="editor-empty">No fields shown. Drag some up from below.</div>}
      {wrappedRows.map(({ line, side, top, height }) => (
        // In the indent of the side's later rows, one for all of them. Slides with them, like the pills.
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
      className={cx("unused-fields", {"drop-to-remove": isDragging && drag.from && drag.target?.type === "remove"})}
      style={isDragging && drag.startingHeights ? { minHeight: drag.startingHeights.unused } : undefined}
      ref={unusedRef}
    >
      <p className="hint">
        {unused.length || isDragging ? "Drag the fields you want to show into the section above" : "Every field is shown. Drag one down here to hide it."}
      </p>
      <div className="unused-field-list">
        {unused.map(field => isDragging && field === drag.field
          ? drag.target?.type === "remove" && linePill({ field: drag.field, key: drag.key, line: null, from: null, isGhost: true })
          : (
          <Badge
            as={motion.button}
            layout="position"
            layoutId={layoutId(field)}
            type="button"
            variant="secondary"
            pill
            key={field}
            className={cx("tag-item", "field-pill")}
            data-field={field}
            aria-label={`Add ${fieldName(field)}`}
            onPointerDown={(event: React.PointerEvent<HTMLElement>) => startDrag(event, field, field, null)}
            onClick={() => {
              // Tapping one adds it at the bottom
              if (justDraggedRef.current) return;
              onChange(placeField(layout, field, null, { type: "new-line", line: layout.length, right: false }));
            }}
          >
            <PillContent field={field} scene={scene} showValues={showValues} />
          </Badge>
        ))}
      </div>
    </motion.div>
    {isDragging && <div
      className="drag-overlay"
      style={{ left: drag.position.left, top: drag.position.top, width: drag.grab.width }}
    >
      <Badge as="div" variant="secondary" pill className={cx("tag-item", "field-pill", "dragged")}>
        <PillContent field={drag.field} scene={scene} showValues={showValues} />
        {drag.from && <span className="remove-field btn"><XLg /></span>}
      </Badge>
    </div>}
  </div></LayoutGroup>
}

/** A pill's name or, with `showValues`, the field's value for this scene */
function PillContent({ field, scene, showValues }: { field: string, scene: GQL.SceneDataFragment, showValues: boolean }) {
  if (!isKnownField(field)) return <span className="pill-name">Unknown field</span>;
  if (!showValues) return <span className="pill-name">{sceneInfoFieldLabels[field]}</span>;
  return <span className="pill-value" data-empty-label={noValueLabel(field)}>
    {/* Empty when the scene has no value for the field, which the CSS fills in with the field's name */}
    <SceneInfoField field={field} scene={scene} />
  </span>;
}
