/**
 * A gamepad's controls, as the browser's standard mapping numbers them (https://w3c.github.io/gamepad/#remapping), and
 * what they're called on Xbox and PlayStation controllers.
 *
 * @see docs/gamepad.md § "Controls"
 */

/** Whose names the controls are shown with */
export type ControllerLayout = "xbox" | "playstation";

export const CONTROL_GROUPS = ["Face buttons", "Shoulders & triggers", "D-pad", "Left stick", "Right stick", "Menu buttons"] as const;
export type ControlGroup = typeof CONTROL_GROUPS[number];

type Labels = string | Record<ControllerLayout, string>;

type ButtonControl = {
  kind: "button",
  index: number,
  group: ControlGroup,
  labels: Labels,
  /** Whether how far it's pressed is read too, not just whether it is (the triggers) */
  analog: boolean,
};
/** A stick pushed one way, as a button, or read as how far it's pushed that way */
type StickDirectionControl = {
  kind: "stick-direction",
  /** The axis it's pushed along (the standard mapping's axes are left X, left Y, right X, right Y; Y is down) */
  axis: number,
  /** Which way along the axis */
  sign: 1 | -1,
  group: ControlGroup,
  labels: Labels,
};

const button = (index: number, group: ControlGroup, labels: Labels, { analog = false } = {}): ButtonControl =>
  ({ kind: "button", index, group, labels, analog });
const stickDirection = (axis: number, sign: 1 | -1, group: ControlGroup, labels: Labels): StickDirectionControl =>
  ({ kind: "stick-direction", axis, sign, group, labels });

export const CONTROLS = {
  "south": button(0, "Face buttons", { xbox: "A", playstation: "✕" }),
  "east": button(1, "Face buttons", { xbox: "B", playstation: "○" }),
  "west": button(2, "Face buttons", { xbox: "X", playstation: "□" }),
  "north": button(3, "Face buttons", { xbox: "Y", playstation: "△" }),
  "lb": button(4, "Shoulders & triggers", { xbox: "LB", playstation: "L1" }),
  "rb": button(5, "Shoulders & triggers", { xbox: "RB", playstation: "R1" }),
  "lt": button(6, "Shoulders & triggers", { xbox: "LT", playstation: "L2" }, { analog: true }),
  "rt": button(7, "Shoulders & triggers", { xbox: "RT", playstation: "R2" }, { analog: true }),
  "dpad-up": button(12, "D-pad", "D-pad ↑"),
  "dpad-down": button(13, "D-pad", "D-pad ↓"),
  "dpad-left": button(14, "D-pad", "D-pad ←"),
  "dpad-right": button(15, "D-pad", "D-pad →"),
  "left-stick-left": stickDirection(0, -1, "Left stick", "Left stick ←"),
  "left-stick-right": stickDirection(0, 1, "Left stick", "Left stick →"),
  "left-stick-up": stickDirection(1, -1, "Left stick", "Left stick ↑"),
  "left-stick-down": stickDirection(1, 1, "Left stick", "Left stick ↓"),
  "l3": button(10, "Left stick", { xbox: "Left stick press (LS)", playstation: "Left stick press (L3)" }),
  "right-stick-left": stickDirection(2, -1, "Right stick", "Right stick ←"),
  "right-stick-right": stickDirection(2, 1, "Right stick", "Right stick →"),
  "right-stick-up": stickDirection(3, -1, "Right stick", "Right stick ↑"),
  "right-stick-down": stickDirection(3, 1, "Right stick", "Right stick ↓"),
  "r3": button(11, "Right stick", { xbox: "Right stick press (RS)", playstation: "Right stick press (R3)" }),
  "select": button(8, "Menu buttons", { xbox: "View", playstation: "Share" }),
  "start": button(9, "Menu buttons", { xbox: "Menu", playstation: "Options" }),
  "home": button(16, "Menu buttons", { xbox: "Guide", playstation: "PS" }),
  "touchpad": button(17, "Menu buttons", { xbox: "Share", playstation: "Touchpad" }),
} as const satisfies Record<string, ButtonControl | StickDirectionControl>;

export type ControlId = keyof typeof CONTROLS;
export const CONTROL_IDS = Object.keys(CONTROLS) as ControlId[];

export function getControl(controlId: ControlId): ButtonControl | StickDirectionControl {
  return CONTROLS[controlId];
}

/** What a control is called on the given kind of controller */
export function controlLabel(controlId: ControlId, layout: ControllerLayout): string {
  const { labels } = getControl(controlId);
  return typeof labels === "string" ? labels : labels[layout];
}

/** Whether how far a control's pushed or pressed can be read (a stick direction or a trigger), for seeking */
export function isAnalogControl(controlId: ControlId): boolean {
  const control = getControl(controlId);
  return control.kind === "stick-direction" || control.analog;
}

const dpadArrows: Partial<Record<ControlId, string>> = {
  "dpad-up": "↑",
  "dpad-down": "↓",
  "dpad-left": "←",
  "dpad-right": "→",
};

/** The arrow for a d-pad button or stick direction (←, →, ↑ or ↓), or null for any other control */
export function directionArrow(controlId: ControlId): string | null {
  const control = getControl(controlId);
  if (control.kind !== "stick-direction") return dpadArrows[controlId] ?? null;
  // The standard mapping's even axes are across (X), odd ones up and down (Y, down being positive)
  const across = control.axis % 2 === 0;
  return across ? (control.sign < 0 ? "←" : "→") : (control.sign < 0 ? "↑" : "↓");
}

/** The stick presses' names under their stick's heading */
const stickPressLabels: Partial<Record<ControlId, Record<ControllerLayout, string>>> = {
  "l3": { xbox: "Press (LS)", playstation: "Press (L3)" },
  "r3": { xbox: "Press (RS)", playstation: "Press (R3)" },
};

/**
 * What a control is called under its group's heading (in the custom settings), without what the heading already says:
 * the d-pad's buttons and the sticks' directions as just their arrows, a stick's press as "Press (L3)"
 */
export function controlShortLabel(controlId: ControlId, layout: ControllerLayout): string {
  return directionArrow(controlId) ?? stickPressLabels[controlId]?.[layout] ?? controlLabel(controlId, layout);
}

/** Whose names a controller's controls have, going by the name the browser gives it (Xbox's unless it's Sony's) */
export function controllerLayout(gamepadId: string): ControllerLayout {
  // 054c is Sony's USB vendor ID
  return /054c|playstation|dualshock|dualsense/i.test(gamepadId) ? "playstation" : "xbox";
}
