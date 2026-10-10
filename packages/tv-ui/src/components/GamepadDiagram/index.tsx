import React, { useState } from "react";
import cx from "classnames";
import "./GamepadDiagram.scss";
import { getShortcutAction } from "../../helpers/shortcut-actions/actions";
import { controlActions, type GamepadBindings } from "../../helpers/gamepad/bindings";
import {
  CONTROL_IDS,
  controlLabel,
  getControl,
  type ControllerLayout,
  type ControlId,
} from "../../helpers/gamepad/controls";

/**
 * A picture of a gamepad showing what its controls do: the controls bound to something are picked out, and in the
 * large size each is labelled with its action. Controls held down are lit up, and hovering over a label lights up its
 * line and control.
 *
 * Two views: the front, with every control but the shoulders and triggers, and the top edge (seen from above, the
 * front of the controller towards the bottom), with just those.
 *
 * Drawn around the controller's middle (x 0). It's shown small (the settings are narrow), so its controls are drawn
 * larger than a real controller's, and its labels are large for it.
 *
 * @see docs/gamepad.md § "Settings"
 */

type Point = { x: number, y: number };
type Rect = { x: number, y: number, width: number, height: number };
export type GamepadDiagramView = "front" | "top";

/* --------------------------------- Front ---------------------------------- */

/** The controller's outline from the front: rounded shoulders, and a grip each side reaching well below the middle */
const frontBodyPath = [
  "M -85 0 Q 0 -8 85 0",
  "C 125 5 145 29 156 61 C 169 107 180 156 169 182 C 159 202 132 204 119 187",
  "C 105 170 94 144 75 132 C 46 135 -46 135 -75 132",
  "C -94 144 -105 170 -119 187 C -132 204 -159 202 -169 182",
  "C -180 156 -169 107 -156 61 C -145 29 -125 5 -85 0 Z",
].join(" ");

/** How far each of the d-pad's arms reaches from its middle, and how wide they are */
const dpadArm = 27;
const dpadArmWidth = 20;
const face = { x: 98, y: 52 };
/** How far each face button is from the middle of the four */
const faceGap = 26;
const faceRadius = 14;
const stickRadius = 24;
/** How far from a stick's middle is its press, rather than a direction */
const stickPressRadius = 10;
/** How far from a stick's middle its directions' label lines end: inside it, rather than at its edge */
const stickInset = 16;
const upperLeft = { x: -98, y: 52 };
const lowerLeft = { x: -52, y: 104 };
const lowerRight = { x: 52, y: 104 };

type Geometry = {
  dpad: Point,
  sticks: { left: Point, right: Point },
  select: Point,
  start: Point,
  home: Point & { radius: number },
  /** The touchpad (PlayStation), or the share button between View and Menu (Xbox) */
  touchpad: Point & { width: number, height: number },
};

/**
 * Where things are on each kind of controller: PlayStation's d-pad above both sticks, with a touchpad between its
 * shoulders and the PS button between the sticks; Xbox's left stick above its d-pad, with View, Share and Menu in a row
 * under the Guide button.
 */
const geometries: Record<ControllerLayout, Geometry> = {
  playstation: {
    dpad: upperLeft,
    sticks: { left: lowerLeft, right: lowerRight },
    select: { x: -58, y: 16 },
    start: { x: 58, y: 16 },
    home: { x: 0, y: 76, radius: 10 },
    touchpad: { x: 0, y: 28, width: 76, height: 38 },
  },
  xbox: {
    dpad: lowerLeft,
    sticks: { left: upperLeft, right: lowerRight },
    select: { x: -32, y: 58 },
    start: { x: 32, y: 58 },
    home: { x: 0, y: 24, radius: 14 },
    touchpad: { x: 0, y: 58, width: 15, height: 10 },
  },
};

/** The controls in the middle of the front, labelled above the controller (or below it, if they're low down) */
const middleControls: readonly ControlId[] = ["select", "start", "home", "touchpad"];

/* ---------------------------------- Top ----------------------------------- */

/** The controller's top edge seen from above: its back at the top, its front (where the face is) at the bottom */
const topBodyPath = [
  "M -150 12 Q 0 2 150 12",
  "C 176 16 184 42 177 64 C 172 82 152 90 122 90",
  "Q 0 98 -122 90",
  "C -152 90 -172 82 -177 64 C -184 42 -176 16 -150 12 Z",
].join(" ");

/** The triggers are on the back of the top edge, and the shoulders in front of them */
const shoulderRects: Record<"lb" | "rb" | "lt" | "rt", Rect> = {
  lt: { x: -140, y: 4, width: 68, height: 38 },
  rt: { x: 72, y: 4, width: 68, height: 38 },
  lb: { x: -156, y: 52, width: 96, height: 20 },
  rb: { x: 60, y: 52, width: 96, height: 20 },
};
const shoulderIds = ["lt", "rt", "lb", "rb"] as const;
type ShoulderId = typeof shoulderIds[number];

/** The short names written on the shoulders and triggers */
const shoulderLabels: Record<ControllerLayout, Record<ShoulderId, string>> = {
  xbox: { lb: "LB", rb: "RB", lt: "LT", rt: "RT" },
  playstation: { lb: "L1", rb: "R1", lt: "L2", rt: "R2" },
};

/* --------------------------------- Anchors -------------------------------- */

const middleOf = ({ x, y, width, height }: Rect): Point => ({ x: x + width / 2, y: y + height / 2 });

/** Where each control is drawn (and its label's line points to) on a kind of controller, in the view it's in */
function controlAnchors({ dpad, sticks, select, start, home, touchpad }: Geometry): Record<ControlId, Point> {
  return {
    "south": { x: face.x, y: face.y + faceGap },
    "east": { x: face.x + faceGap, y: face.y },
    "west": { x: face.x - faceGap, y: face.y },
    "north": { x: face.x, y: face.y - faceGap },
    "lb": middleOf(shoulderRects.lb),
    "rb": middleOf(shoulderRects.rb),
    "lt": middleOf(shoulderRects.lt),
    "rt": middleOf(shoulderRects.rt),
    "dpad-up": { x: dpad.x, y: dpad.y - dpadArm / 2 - 2 },
    "dpad-down": { x: dpad.x, y: dpad.y + dpadArm / 2 + 2 },
    "dpad-left": { x: dpad.x - dpadArm / 2 - 2, y: dpad.y },
    "dpad-right": { x: dpad.x + dpadArm / 2 + 2, y: dpad.y },
    "left-stick-up": { x: sticks.left.x, y: sticks.left.y - stickInset },
    "left-stick-down": { x: sticks.left.x, y: sticks.left.y + stickInset },
    "left-stick-left": { x: sticks.left.x - stickInset, y: sticks.left.y },
    "left-stick-right": { x: sticks.left.x + stickInset, y: sticks.left.y },
    "l3": sticks.left,
    "right-stick-up": { x: sticks.right.x, y: sticks.right.y - stickInset },
    "right-stick-down": { x: sticks.right.x, y: sticks.right.y + stickInset },
    "right-stick-left": { x: sticks.right.x - stickInset, y: sticks.right.y },
    "right-stick-right": { x: sticks.right.x + stickInset, y: sticks.right.y },
    "r3": sticks.right,
    "select": select,
    "start": start,
    "home": home,
    "touchpad": touchpad,
  };
}

/* --------------------------------- Labels --------------------------------- */

/**
 * How far a control with a name on it reaches either side of its anchor: a label down a side has its line start at
 * the control's edge, so it doesn't run over the name
 */
const halfWidths: Partial<Record<ControlId, number>> = {
  south: faceRadius,
  east: faceRadius,
  west: faceRadius,
  north: faceRadius,
  ...Object.fromEntries(shoulderIds.map((controlId) => [controlId, shoulderRects[controlId].width / 2])),
};

/**
 * A control's label: its action, or which way it seeks. What it does while holding a seek control (speeding up or
 * slowing down) is left out, unless it does nothing else. Null for a control that does nothing.
 */
function calloutText(bindings: GamepadBindings, controlId: ControlId): string | null {
  const analog = bindings.analog[controlId];
  if (analog) return analog === "analog-seek-forwards" ? "Fast fwd" : "Rewind";
  const { plain, heldWith } = controlActions(bindings, controlId);
  const actionId = plain ?? heldWith;
  return actionId ? getShortcutAction(actionId).shortTitle : null;
}

/** The height of a label (whose text is 24 high) */
const labelHeight = 27;
/** About how wide a label's text is per letter */
const letterWidth = 13;
/** The space between labels */
const labelGap = 3;
/**
 * The space between the labels of one cluster of controls (the d-pad, a stick…) and the next, so each cluster's labels
 * look like one: the most of these there's room for
 */
const clusterGaps = [20, 12, 6];
/** Where the side labels' lines end, just clear of the controller's sides */
const labelColumn = 192;
/** How far across the labels can go */
const labelReach = 335;
/** Where the rows of labels above and below the front go */
const rows = { above: -32, below: 168 };

type Placement =
  /** Down a side, level with `y` */
  | { kind: "side", direction: -1 | 1, y: number }
  /** In a row above or below the controller, centred on `x` */
  | { kind: "row", row: keyof typeof rows, x: number };

type Callout = { controlId: ControlId, text: string, anchor: Point, placement: Placement };

/** Which cluster a control's in: each shoulder and trigger on its own, otherwise its group (the d-pad, a stick…) */
const clusterOf = (controlId: ControlId) =>
  (shoulderIds as readonly ControlId[]).includes(controlId) ? controlId : getControl(controlId).group;

/**
 * The labels down one side: each cluster's together (in the order of what they point to), centred on its controls, with
 * as big a gap between clusters as there's room for
 */
function layOutSide(
  callouts: Omit<Callout, "placement">[],
  direction: -1 | 1,
  bounds: { top: number, bottom: number },
): Callout[] {
  const clusters = [...new Set(callouts.map((callout) => clusterOf(callout.controlId)))]
    .map((cluster) => callouts
      .filter((callout) => clusterOf(callout.controlId) === cluster)
      .sort((a, b) => a.anchor.y - b.anchor.y || a.anchor.x - b.anchor.x))
    .map((members) => ({
      members,
      middle: members.reduce((sum, callout) => sum + callout.anchor.y, 0) / members.length,
      height: members.length * labelHeight + (members.length - 1) * labelGap,
    }))
    .sort((a, b) => a.middle - b.middle);

  /** Each cluster's top, with the given gap between clusters, and whether they fit */
  const place = (gap: number) => {
    const tops: number[] = [];
    clusters.forEach((cluster, index) => {
      const highest = index ? tops[index - 1] + clusters[index - 1].height + gap : bounds.top;
      tops.push(Math.max(cluster.middle - cluster.height / 2, highest));
    });
    // Moved back up if they've run off the bottom
    let limit = bounds.bottom;
    for (let index = clusters.length - 1; index >= 0; index--) {
      tops[index] = Math.min(tops[index], limit - clusters[index].height);
      limit = tops[index] - gap;
    }
    return { tops, fits: !clusters.length || tops[0] >= bounds.top };
  };
  const { tops } = clusterGaps.map(place).find(({ fits }) => fits) ?? place(labelGap);

  return clusters.flatMap((cluster, index) => cluster.members.map((callout, position) => ({
    ...callout,
    placement: {
      kind: "side" as const,
      direction,
      y: tops[index] + position * (labelHeight + labelGap) + labelHeight / 2,
    },
  })));
}

/**
 * The labels in a row, in the order of what they point to (so their lines don't cross), each as near over (or under)
 * it as there's room for
 */
function layOutRow(callouts: Omit<Callout, "placement">[], row: keyof typeof rows): Callout[] {
  const sorted = [...callouts].sort((a, b) => a.anchor.x - b.anchor.x);
  const width = (callout: Omit<Callout, "placement">) => callout.text.length * letterWidth;
  const xs: number[] = [];
  sorted.forEach((callout, index) => {
    const leftmost = index ? xs[index - 1] + (width(sorted[index - 1]) + width(callout)) / 2 + letterWidth : -Infinity;
    xs.push(Math.max(callout.anchor.x, leftmost));
  });
  // Moved back over the controller by as much as they've drifted away from it, keeping them within reach
  if (sorted.length) {
    const drift = (xs[0] + xs[xs.length - 1]) / 2 - (sorted[0].anchor.x + sorted[sorted.length - 1].anchor.x) / 2;
    const left = xs[0] - width(sorted[0]) / 2 - drift;
    const right = xs[xs.length - 1] + width(sorted[sorted.length - 1]) / 2 - drift;
    const shift = drift + Math.max(0, right - labelReach) - Math.max(0, -labelReach - left);
    xs.forEach((_, index) => { xs[index] -= shift; });
  }
  return sorted.map((callout, index) => ({ ...callout, placement: { kind: "row", row, x: xs[index] } }));
}

/** Where a label's line starts and ends (bending on the way, down a side), and where its text goes */
function calloutGeometry({ controlId, anchor, placement }: Callout) {
  if (placement.kind === "side") {
    const columnX = labelColumn * placement.direction;
    return {
      start: { x: anchor.x + (halfWidths[controlId] ?? 0) * placement.direction, y: anchor.y },
      bend: { x: columnX - 14 * placement.direction, y: placement.y },
      end: { x: columnX, y: placement.y },
      textAnchor: placement.direction < 0 ? "end" : "start",
      textAt: { x: columnX + 6 * placement.direction, y: placement.y },
    } as const;
  }
  const y = rows[placement.row];
  return {
    start: anchor,
    bend: null,
    end: { x: placement.x, y: y + (placement.row === "above" ? 14 : -14) },
    textAnchor: "middle",
    textAt: { x: placement.x, y },
  } as const;
}

/* -------------------------------- Diagram --------------------------------- */

/** What each view shows of the drawing (x, y, width, height). A large one's as tall as its labels need. */
const viewBoxes = {
  front: { large: [-340, -60, 680, 270], small: [-186, -14, 372, 222] },
  top: { large: [-340, -6, 680, 110], small: [-186, -6, 372, 110] },
};

export function GamepadDiagram({
  bindings,
  layout,
  view = "front",
  size = "large",
  pressedControls,
  hovered: hoveredProp,
  onHoveredChange,
  onControlClick,
  className,
}: {
  bindings: GamepadBindings,
  layout: ControllerLayout,
  view?: GamepadDiagramView,
  /** Small leaves out the labels, for previews */
  size?: "small" | "large",
  /** Controls to light up, as they're held down */
  pressedControls?: ReadonlySet<ControlId>,
  /**
   * The control hovered over, for a diagram whose hovering is shared (e.g. with the settings' fields), with
   * `onHoveredChange` called as it changes. Otherwise it keeps its own.
   */
  hovered?: ControlId | null,
  onHoveredChange?: (controlId: ControlId | null) => void,
  /** Called when a control, or its label, is clicked */
  onControlClick?: (controlId: ControlId) => void,
  className?: string,
}) {
  const [ownHovered, setOwnHovered] = useState<ControlId | null>(null);
  const hovered = hoveredProp !== undefined ? hoveredProp : ownHovered;
  const setHovered = onHoveredChange ?? setOwnHovered;
  const geometry = geometries[layout];
  const { dpad, sticks, select, start, home, touchpad } = geometry;
  const anchors = controlAnchors(geometry);
  const isShoulder = (controlId: ControlId) => (shoulderIds as readonly ControlId[]).includes(controlId);
  const controls = CONTROL_IDS.filter((controlId) => isShoulder(controlId) === (view === "top"));
  const labels = new Map(controls.map((controlId) => [controlId, calloutText(bindings, controlId)]));
  const isBound = (controlId: ControlId) => Boolean(labels.get(controlId));
  const isPressed = (controlId: ControlId) => pressedControls?.has(controlId) ?? false;
  const controlClass = (...controlIds: ControlId[]) => cx("control", {
    bound: controlIds.some(isBound),
    pressed: controlIds.some(isPressed),
    hovered: hovered !== null && controlIds.includes(hovered),
  });
  /** Hovering over a control, or its label or line, lights them all up, and clicking calls `onControlClick` */
  const interactions = (controlId: ControlId) => ({
    onMouseEnter: () => setHovered(controlId),
    onMouseLeave: () => setHovered(null),
    ...(onControlClick && { onClick: () => onControlClick(controlId), style: { cursor: "pointer" } }),
  });
  const controlProps = (controlId: ControlId) => ({
    className: controlClass(controlId),
    "data-control": controlId,
    ...interactions(controlId),
  });

  const unplaced = controls.flatMap((controlId) => {
    const text = labels.get(controlId);
    return text ? [{ controlId, text, anchor: anchors[controlId] }] : [];
  });
  const inMiddle = (callout: Omit<Callout, "placement">) => view === "front" && middleControls.includes(callout.controlId);
  // Down the sides of the front, labels can go below the grips, so there's room for gaps between clusters
  const sideBounds = view === "front" ? { top: -16, bottom: 266 } : { top: 0, bottom: 100 };
  const callouts = size === "small" ? [] : [
    ...layOutSide(unplaced.filter((callout) => !inMiddle(callout) && callout.anchor.x < 0), -1, sideBounds),
    ...layOutSide(unplaced.filter((callout) => !inMiddle(callout) && callout.anchor.x >= 0), 1, sideBounds),
    // Those low down (the PS button, between the sticks) are labelled below, so their lines don't cross the others
    ...layOutRow(unplaced.filter((callout) => inMiddle(callout) && callout.anchor.y <= 70), "above"),
    ...layOutRow(unplaced.filter((callout) => inMiddle(callout) && callout.anchor.y > 70), "below"),
  ];

  const [viewX, viewY, viewWidth, viewHeight] = viewBoxes[view][size];
  const lowestLabel = Math.max(...callouts.map((callout) => calloutGeometry(callout).textAt.y + labelHeight / 2));
  const viewBox = [viewX, viewY, viewWidth, Math.max(viewHeight, lowestLabel - viewY)];

  const buttonLabel = (controlId: ControlId) => controlLabel(controlId, layout);
  const faceButton = (controlId: "south" | "east" | "west" | "north") => (
    <g {...controlProps(controlId)}>
      <circle cx={anchors[controlId].x} cy={anchors[controlId].y} r={faceRadius} />
      <text x={anchors[controlId].x} y={anchors[controlId].y} className="glyph">{buttonLabel(controlId)}</text>
    </g>
  );
  const shoulder = (controlId: ShoulderId) => {
    const { x, y, width, height } = shoulderRects[controlId];
    const isTrigger = controlId === "lt" || controlId === "rt";
    return (
      <g {...controlProps(controlId)}>
        <rect x={x} y={y} width={width} height={height} rx={isTrigger ? 14 : height / 2} />
        <text x={anchors[controlId].x} y={anchors[controlId].y} className="glyph shoulder-glyph">
          {shoulderLabels[layout][controlId]}
        </text>
      </g>
    );
  };
  /** A d-pad arm, pointed where it meets the others, reaching out from the middle one way (`dx` or `dy` 1 or -1) */
  const dpadArmPath = (dx: number, dy: number) => {
    const half = dpadArmWidth / 2;
    // Along the arm, and across it
    const along = { x: dx, y: dy };
    const across = { x: along.y, y: along.x };
    const point = (distance: number, side: number) =>
      `${dpad.x + along.x * distance + across.x * side} ${dpad.y + along.y * distance + across.y * side}`;
    return `M ${point(dpadArm, -half)} L ${point(dpadArm, half)} L ${point(half, half)} L ${point(0, 0)} L ${point(half, -half)} Z`;
  };
  /**
   * A stick, in five parts that light up on their own: its middle (its press), and a quarter of the ring around it for
   * each direction, so hovering over or pushing one direction lights up just that quarter
   */
  const stick = (side: "left" | "right") => {
    const centre = sticks[side];
    const press: ControlId = side === "left" ? "l3" : "r3";
    const directions = (["up", "right", "down", "left"] as const).map((direction, index) => ({
      controlId: `${side}-stick-${direction}` as ControlId,
      // The middle of the quarter, clockwise from the top
      angle: (index - 1) * 90,
    }));
    const pointAt = (angle: number, radius: number) => {
      const radians = (angle * Math.PI) / 180;
      return `${centre.x + radius * Math.cos(radians)} ${centre.y + radius * Math.sin(radians)}`;
    };
    // A quarter of the ring, and its outer edge
    const quarter = (angle: number) => [
      `M ${pointAt(angle - 45, stickRadius)}`,
      `A ${stickRadius} ${stickRadius} 0 0 1 ${pointAt(angle + 45, stickRadius)}`,
      `L ${pointAt(angle + 45, stickPressRadius)}`,
      `A ${stickPressRadius} ${stickPressRadius} 0 0 0 ${pointAt(angle - 45, stickPressRadius)}`,
      "Z",
    ].join(" ");
    const edge = (angle: number) =>
      `M ${pointAt(angle - 45, stickRadius)} A ${stickRadius} ${stickRadius} 0 0 1 ${pointAt(angle + 45, stickRadius)}`;
    const partState = (controlId: ControlId) => ({ pressed: isPressed(controlId), hovered: hovered === controlId });
    return <g className="stick">
      <circle
        className={cx("control", { bound: [press, ...directions.map(({ controlId }) => controlId)].some(isBound) })}
        cx={centre.x}
        cy={centre.y}
        r={stickRadius}
      />
      {directions.map(({ controlId, angle }) => (
        <g key={controlId} data-control={controlId} {...interactions(controlId)}>
          <path className={cx("stick-part", partState(controlId))} d={quarter(angle)} />
          <path className={cx("stick-part-edge", partState(controlId))} d={edge(angle)} />
        </g>
      ))}
      <circle
        className={cx("stick-part", "stick-press", partState(press))}
        data-control={press}
        cx={centre.x}
        cy={centre.y}
        r={stickPressRadius}
        {...interactions(press)}
      />
    </g>;
  };

  // Each label is drawn over the controls, but the wide area for hovering over its line is under them, so a line
  // crossing a control never takes the hover from it
  const calloutLayer = (layer: "hit-areas" | "labels") => callouts.map((callout) => {
    const { start, bend, end, textAnchor, textAt } = calloutGeometry(callout);
    const points = [start, ...(bend ? [bend] : []), end].map(({ x, y }) => `${x},${y}`).join(" ");
    const hover = interactions(callout.controlId);
    if (layer === "hit-areas") {
      // Wider than the line, so it's easy to hover over
      return <polyline key={callout.controlId} className="callout-hit-area" points={points} {...hover} />;
    }
    return (
      <g
        key={callout.controlId}
        className={cx("callout", { pressed: isPressed(callout.controlId), hovered: hovered === callout.controlId })}
        data-control={callout.controlId}
        {...hover}
      >
        <polyline className="line" points={points} />
        <text x={textAt.x} y={textAt.y} textAnchor={textAnchor}>{callout.text}</text>
      </g>
    );
  });

  return (
    <svg
      className={cx("GamepadDiagram", `size-${size}`, `view-${view}`, className)}
      viewBox={viewBox.join(" ")}
      role="img"
      aria-label={size === "large"
        ? `Gamepad ${view === "top" ? "shoulders and triggers" : "front"}: ${callouts.map((callout) => `${buttonLabel(callout.controlId)}: ${callout.text}`).join(", ")}`
        : "Gamepad"}
    >
      {view === "front" ? <>
        <path className="body" d={frontBodyPath} />
        {calloutLayer("hit-areas")}
        <rect
          {...controlProps("touchpad")}
          x={touchpad.x - touchpad.width / 2}
          y={touchpad.y - touchpad.height / 2}
          width={touchpad.width}
          height={touchpad.height}
          rx={Math.min(7, touchpad.height / 2)}
        />
        <rect {...controlProps("select")} x={select.x - 10} y={select.y - 6} width={20} height={12} rx={6} />
        <rect {...controlProps("start")} x={start.x - 10} y={start.y - 6} width={20} height={12} rx={6} />
        <circle {...controlProps("home")} cx={home.x} cy={home.y} r={home.radius} />
        <path {...controlProps("dpad-up")} d={dpadArmPath(0, -1)} />
        <path {...controlProps("dpad-down")} d={dpadArmPath(0, 1)} />
        <path {...controlProps("dpad-left")} d={dpadArmPath(-1, 0)} />
        <path {...controlProps("dpad-right")} d={dpadArmPath(1, 0)} />
        {faceButton("north")}
        {faceButton("south")}
        {faceButton("west")}
        {faceButton("east")}
        {stick("left")}
        {stick("right")}
      </> : <>
        <path className="body" d={topBodyPath} />
        {calloutLayer("hit-areas")}
        {shoulderIds.map((controlId) => <React.Fragment key={controlId}>{shoulder(controlId)}</React.Fragment>)}
      </>}
      {calloutLayer("labels")}
    </svg>
  );
}
