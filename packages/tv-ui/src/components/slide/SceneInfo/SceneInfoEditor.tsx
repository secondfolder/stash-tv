import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LayoutGroup, motion } from "framer-motion";
import { unstable_batchedUpdates } from "react-dom";
import cx from "classnames";
import { Badge, Button, ButtonGroup } from "react-bootstrap";
import { ArrowReturnRight, XLg } from "react-bootstrap-icons";
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
  countRows,
  noValueLabel,
  isKnownField,
  LayoutPosition,
  placeField,
  preferVacatedLine,
  Rect,
  SceneInfoEditorPillContent,
  SceneInfoLayout,
  sceneInfoFieldLabels,
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
  // (and its space, see vacatedLineHeight) until it's dropped, even if it's left empty, so the lines after it don't move
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
  const startingLinesRef = useRef<{ rect: Rect; fields: Rect[] }[]>([]);
  // Where the lines' container was then. The panel grows upwards (e.g. as the unused fields take the ghost), moving the
  // lines, so the pointer is compared with where the lines were relative to where the container is now.
  const startingLinesTopRef = useRef(0);
  const vacatedLineHeight = drag?.from ? lineHeight(startingLinesRef.current[drag.from.line]?.rect) : undefined;
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
  const measureLines = () => {
    const container = linesRef.current;
    if (!container) return [];
    const containerRect = container.getBoundingClientRect();
    const lines: { rect: Rect; fields: Rect[] }[] = [];
    for (const item of container.querySelectorAll<HTMLElement>(":scope > [data-line]")) {
      const itemRect = layoutRect(item, containerRect);
      const line = lines[Number(item.dataset.line)] ??= {
        rect: { left: containerRect.left, right: containerRect.right, top: itemRect.top, bottom: itemRect.bottom },
        fields: [],
      };
      line.rect.top = Math.min(line.rect.top, itemRect.top);
      line.rect.bottom = Math.max(line.rect.bottom, itemRect.bottom);
      if (item.classList.contains("field-pill") && !item.classList.contains("ghost")) line.fields.push(itemRect);
    }
    return lines;
  }

  const measureGhost = () => {
    const container = linesRef.current;
    const ghost = container?.querySelector<HTMLElement>(":scope > .field-pill.ghost");
    return container && ghost ? layoutRect(ghost, container.getBoundingClientRect()) : null;
  }

  /** Where the ghost line goes for a new line before line `line` (or after the last): halfway between the lines */
  const measureNewLineAt = (line: number) => {
    const container = linesRef.current;
    if (!container) return null;
    const lines = measureLines();
    const containerTop = container.getBoundingClientRect().top;
    // Half the space between lines, which is the pills' margins
    const pill = container.querySelector<HTMLElement>(":scope > .field-pill");
    const halfGap = pill ? parseFloat(getComputedStyle(pill).marginBottom) || 0 : 0;
    const above = lines[line - 1]?.rect;
    const below = lines[line]?.rect;
    const y = above && below ? (above.bottom + below.top) / 2
      : above ? above.bottom + halfGap
      : below ? below.top - halfGap
      : containerTop + container.clientHeight / 2;
    return y - containerTop;
  }

  /**
   * If putting the dragged field on line `line` at `index` would make the line wrap onto another row, where to show the
   * line marking the spot instead of the ghost. `fields` are where the line's other fields are.
   */
  const measureInsertAt = (line: number, index: number, fields: Rect[], current: Drag): Drag["insertAt"] => {
    const container = linesRef.current;
    if (!container) return null;
    // All to the fraction of a pixel (offsetWidth and clientWidth round): over a line's worth of fields, rounding was
    // enough to get it wrong when the field only just fits, or only just doesn't
    const style = getComputedStyle(container);
    const gap = parseFloat(style.columnGap) || 0;
    const indent = parseFloat(style.paddingLeft) || 0;
    const otherRowWidth = container.getBoundingClientRect().width - indent - (parseFloat(style.paddingRight) || 0);
    const pills = [...container.querySelectorAll<HTMLElement>(`:scope > .field-pill[data-line="${line}"]:not(.ghost)`)];
    const widths = pills.map(pill => pill.getBoundingClientRect().width);
    // A field dragged from the unused fields gets a × on the line, which they don't have
    let draggedWidth = current.grab.width;
    const removeButton = container.querySelector<HTMLElement>(":scope > .field-pill .remove-field");
    if (!current.from && removeButton?.parentElement) {
      draggedWidth += removeButton.getBoundingClientRect().width + (parseFloat(getComputedStyle(removeButton.parentElement).columnGap) || 0);
    }
    const withField = [...widths.slice(0, index), draggedWidth, ...widths.slice(index)];
    // The line as it is in the layout: with the field if it's the line it's being dragged along
    const asItIs = current.from?.line === line
      ? [...widths.slice(0, current.from.index), draggedWidth, ...widths.slice(current.from.index)]
      : widths;
    const rows = (lineWidths: number[]) => countRows(lineWidths, gap, otherRowWidth + indent, otherRowWidth);
    if (rows(withField) <= rows(asItIs)) return null;
    const containerRect = container.getBoundingClientRect();
    const next = fields[index];
    const previous = fields[index - 1];
    const beside = next ?? previous;
    if (!beside) return null;
    const left = next ? next.left - gap / 2 : previous.right + gap / 2;
    return { left: left - containerRect.left, top: beside.top - containerRect.top, height: beside.bottom - beside.top };
  }

  /** Where the field dragged to `point` would go, given where it would go before (`current.target`) */
  const measureTarget = (point: { x: number, y: number }, current: Drag): Pick<Drag, "target" | "arrivedOver" | "newLineAt" | "insertAt"> => {
    const unusedRect = unusedRef.current?.getBoundingClientRect();
    if (unusedRect && contains(unusedRect, point)) return { target: { type: "remove" }, arrivedOver: null, newLineAt: null, insertAt: null };
    const linesMoved = (linesRef.current?.getBoundingClientRect().top ?? 0) - startingLinesTopRef.current;
    const pointAtStart = { x: point.x, y: point.y - linesMoved };
    const target = preferVacatedLine(getDropTarget(pointAtStart, startingLinesRef.current), baseLayout, current.from);
    if (target.type === "new-line") return { target, arrivedOver: null, newLineAt: measureNewLineAt(target.line), insertAt: null };
    if (target.type !== "same-line") return { target, arrivedOver: null, newLineAt: null, insertAt: null };
    // Along the line, where its fields are now, since they move aside for the ghost
    const fields = measureLines()[target.line]?.fields ?? [];
    if (current.insertAt && current.target?.type === "same-line" && current.target.line === target.line) {
      // Nothing moves aside for an insertion line, so it simply goes by which half of a field the pointer's over
      const index = getSlotByMidpoints(point, fields);
      return { target: { ...target, index }, arrivedOver: null, newLineAt: null, insertAt: measureInsertAt(target.line, index, fields, current) };
    }
    if (current.target?.type === "same-line" && current.target.line === target.line) {
      const direction = Math.sign(point.x - current.lastX);
      const { index, ignore } = getSlotNearGhost(point, direction, fields, current.target.index, current.arrivedOver, measureGhost());
      return { target: { ...target, index }, arrivedOver: ignore, newLineAt: null, insertAt: measureInsertAt(target.line, index, fields, current) };
    }
    const { index, over } = getSlotOnArrival(point, fields);
    return { target: { ...target, index }, arrivedOver: over, newLineAt: null, insertAt: measureInsertAt(target.line, index, fields, current) };
  }

  const startDrag = (event: React.PointerEvent<HTMLElement>, field: string, key: string, from: LayoutPosition | null) => {
    if (event.button !== 0 || dragRef.current) return;
    const pillRect = event.currentTarget.getBoundingClientRect();
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
          ? { target: { type: "same-line", ...current.from }, arrivedOver: null, newLineAt: null, insertAt: null }
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
   * Where the lines that wrap onto more rows have their later rows, from the top of the lines' container, for the
   * marker showing they're one line. Measured after every render (and when the editor's resized) as wrapping is down to
   * layout.
   */
  const [wrappedRows, setWrappedRows] = useState<{ line: number; top: number; height: number }[]>([]);
  const measureWrappedRows = () => {
    const container = linesRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    const next = measureLines().flatMap(({ fields }, line) => {
      // Later rows start with a field left of the one before it
      const laterRows = fields.filter((field, index) => index > 0 && field.left < fields[index - 1].left);
      if (!laterRows.length) return [];
      const first = fields.indexOf(laterRows[0]);
      const top = Math.min(...fields.slice(first).map(field => field.top));
      const bottom = Math.max(...fields.slice(first).map(field => field.bottom));
      return [{ line, top: top - containerTop, height: bottom - top }];
    });
    setWrappedRows(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
  }
  useLayoutEffect(measureWrappedRows);
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
        <span aria-hidden>Show</span>
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
      Every line's fields are in one flexbox, each line ending in a break, rather than a box per line, so a field moving
      to another line isn't re-mounted, and slides there like any other move
    */}
    <div
      className="editor-lines"
      ref={linesRef}
      style={isDragging && drag.startingHeights ? { minHeight: drag.startingHeights.lines } : undefined}
    >
      {(() => {
        // A field can only be in the layout once, apart from fields this version doesn't know, which still need unique keys
        const seen = new Map<string, number>();
        return shownLayout.flatMap((line, lineIndex) => [
        ...line.length ? line.map((field, index) => {
          if (field === ghostField && drag) {
            return linePill({ field: drag.field, key: drag.key, line: lineIndex, from: null, isGhost: true });
          }
          // Only its position in the saved layout when nothing is being dragged, the only time it's used
          const from = { line: lineIndex, index };
          const occurrence = seen.get(field) ?? 0;
          seen.set(field, occurrence + 1);
          return linePill({ field, key: occurrence ? `${field}-${occurrence}` : field, line: lineIndex, from, isGhost: false });
        }) : [
          // The line a field was dragged off, keeping its space
          <div key={`vacated-${lineIndex}`} className="vacated-line" data-line={lineIndex} style={{ height: vacatedLineHeight }} />,
        ],
        <div key={`end-${lineIndex}`} className="line-end" />,
        ]);
      })()}
      {!shownLayout.length && <div className="editor-empty">No fields shown. Drag some up from below.</div>}
      {wrappedRows.map(({ line, top, height }) => (
        // In the indent of the line's later rows, one for all of them. Slides with them, like the pills.
        <motion.div layout="position" key={line} className="wrapped-line-marker" style={{ top, height }} aria-hidden>
          <ArrowReturnRight />
        </motion.div>
      ))}
      {isDragging && drag.target?.type === "same-line" && drag.insertAt && <div
        className="insertion-line"
        style={drag.insertAt}
        aria-hidden
      />}
      {isDragging && drag.target?.type === "new-line" && drag.newLineAt !== null && <div
        className="ghost-line"
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
              onChange(placeField(layout, field, null, { type: "new-line", line: layout.length }));
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
