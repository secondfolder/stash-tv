import React, { useMemo, useRef, useState } from "react";
import cx from "classnames";
import { Button, ButtonGroup, Dropdown, Form } from "react-bootstrap";
import "./GamepadSettings.scss";
import Select from "../Select";
import { GamepadDiagram } from "../../GamepadDiagram";
import { useTvConfig } from "../../../store/tvConfig";
import { useGamepadState } from "../../../store/gamepadState";
import {
  getShortcutAction,
  SHORTCUT_GROUPS,
  type ShortcutActionId,
} from "../../../helpers/shortcut-actions/actions";
import {
  ANALOG_ACTIONS,
  controlActions,
  GAMEPAD_ACTION_IDS,
  resolveGamepadBindings,
  withAnalogAction,
  withControlAction,
  type AnalogAction,
  type GamepadBindings,
} from "../../../helpers/gamepad/bindings";
import {
  CONTROL_GROUPS,
  CONTROL_IDS,
  controlLabel,
  controlShortLabel,
  directionArrow,
  getControl,
  isAnalogControl,
  type ControllerLayout,
  type ControlId,
} from "../../../helpers/gamepad/controls";
import { GAMEPAD_PRESET_IDS, GAMEPAD_PRESETS, type GamepadPresetId } from "../../../helpers/gamepad/presets";

/**
 * Settings → Game Controller: picking one of the presets for what a gamepad's controls do, or the user's own, where each
 * control can be given any shortcut action, or (for a stick direction or trigger) seeking.
 *
 * @see docs/gamepad.md § "Settings"
 */

/** An option for what a control does: an action, nothing, or (for a stick direction or trigger) seeking */
type ActionOption = {
  value: ShortcutActionId | AnalogAction | null,
  label: string,
  /** What's shown for it once chosen, if shorter than its label */
  chosenLabel?: string,
};

const noAction: ActionOption = { value: null, label: "Nothing" };

/** The option for a stick direction or trigger to seek one way, at a speed set by how far it's pushed or pressed */
function analogOption(controlId: ControlId, action: AnalogAction): ActionOption {
  const chosenLabel = action === "analog-seek-forwards" ? "Fast forward" : "Rewind";
  const how = getControl(controlId).kind === "stick-direction" ? "the further it's pushed" : "the harder it's pressed";
  return { value: action, label: `${chosenLabel} (faster ${how})`, chosenLabel };
}

/**
 * What a control can be given, by group: every action a gamepad can do but speeding up and slowing down (which are for
 * while a seek control is held), and for a stick direction or trigger, seeking, with the other playback actions
 */
function actionOptions(controlId: ControlId) {
  const analog = isAnalogControl(controlId) ? ANALOG_ACTIONS.map((action) => analogOption(controlId, action)) : [];
  return [
    noAction,
    ...SHORTCUT_GROUPS.map((group) => ({
      label: group,
      options: GAMEPAD_ACTION_IDS
        .filter((actionId) => getShortcutAction(actionId).group === group && !getShortcutAction(actionId).heldWith)
        .flatMap((actionId): ActionOption[] => [
          { value: actionId, label: getShortcutAction(actionId).title },
          // After jumping forwards (and backwards)
          ...(actionId === "seek-forwards" ? analog : []),
        ]),
    })),
  ];
}

const findOption = (actionId: ShortcutActionId | null): ActionOption =>
  actionId === null ? noAction : { value: actionId, label: getShortcutAction(actionId).title };

export function GamepadSettings() {
  const { set: setTvConfig } = useTvConfig();
  const gamepadMapping = useTvConfig((state) => state.gamepadMapping);
  const layout = useGamepadState((state) => state.layout);
  const pressedControls = useGamepadState((state) => state.pressedControls);
  const bindings = useMemo(() => resolveGamepadBindings(gamepadMapping), [gamepadMapping]);
  const customBindings = gamepadMapping.custom ? resolveGamepadBindings({ preset: "custom", custom: gamepadMapping.custom }) : null;

  const choosePreset = (preset: GamepadPresetId | "custom") => {
    // The user's own mapping starts as a copy of the one they had
    setTvConfig("gamepadMapping", (previous) => preset === "custom"
      ? { preset, custom: previous.custom ?? resolveGamepadBindings(previous) }
      : { ...previous, preset });
  };
  const setCustom = (custom: GamepadBindings) => setTvConfig("gamepadMapping", { preset: "custom", custom });

  const choices = [
    ...GAMEPAD_PRESET_IDS.map((presetId) => ({
      id: presetId,
      title: GAMEPAD_PRESETS[presetId].title,
      description: GAMEPAD_PRESETS[presetId].description,
      bindings: GAMEPAD_PRESETS[presetId].bindings as GamepadBindings,
    })),
    {
      id: "custom" as const,
      title: "Custom",
      description: "Choose what each control does",
      bindings: customBindings ?? bindings,
    },
  ];
  const chosen = choices.find((choice) => choice.id === gamepadMapping.preset) ?? choices[0];
  const isCustom = gamepadMapping.preset === "custom";

  // Clicking a control in the diagram scrolls to its field and lights it up for a moment. Each click counts, so
  // clicking the same control again lights it up again.
  const rootRef = useRef<HTMLDivElement>(null);
  const [flashed, setFlashed] = useState<{ controlId: ControlId, count: number } | null>(null);
  // The control hovered over, in either diagram or its field, and where. Its control and label in the diagrams light
  // up either way, but its field only when it's hovered over in a diagram (the mouse is over it otherwise).
  const [hover, setHover] = useState<{ controlId: ControlId, from: "diagram" | "field" } | null>(null);
  const hovered = hover?.controlId ?? null;
  const hoverFrom = (from: "diagram" | "field") =>
    (controlId: ControlId | null) => setHover(controlId ? { controlId, from } : null);
  const showField = (controlId: ControlId) => {
    rootRef.current?.querySelector(`.custom-controls [data-control="${controlId}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashed((previous) => ({ controlId, count: (previous?.count ?? 0) + 1 }));
  };
  // Only the custom mapping has fields for the controls
  const mappingProps = {
    bindings,
    layout,
    pressedControls,
    hovered,
    onHoveredChange: hoverFrom("diagram"),
    onControlClick: isCustom ? showField : undefined,
  };

  return <div className="GamepadSettings" ref={rootRef}>
    <Form.Group>
      <Form.Label as="h4">Controls</Form.Label>
      <ButtonGroup className="presets" aria-label="Gamepad controls">
        {choices.map((choice) => {
          const active = choice.id === chosen.id;
          return <Button
            key={choice.id}
            className="preset"
            variant={active ? "primary" : "secondary"}
            active={active}
            aria-pressed={active}
            onClick={() => choosePreset(choice.id)}
          >
            <GamepadDiagram bindings={choice.bindings} layout={layout} size="small" />
            <span className="preset-title">{choice.title}</span>
          </Button>;
        })}
      </ButtonGroup>
      <Form.Text className="text-muted preset-description">{chosen.description}.</Form.Text>
    </Form.Group>
    <Form.Group>
      <GamepadDiagram {...mappingProps} className="mapping" />
      <GamepadDiagram {...mappingProps} className="mapping" view="top" />
    </Form.Group>
    {isCustom && <CustomControls
      bindings={bindings}
      layout={layout}
      pressedControls={pressedControls}
      flashed={flashed}
      hovered={hover?.from === "diagram" ? hovered : null}
      onHoveredChange={hoverFrom("field")}
      onChange={setCustom}
    />}
  </div>;
}

function CustomControls({
  bindings,
  layout,
  pressedControls,
  flashed,
  hovered,
  onHoveredChange,
  onChange,
}: {
  bindings: GamepadBindings,
  layout: ControllerLayout,
  pressedControls: ReadonlySet<ControlId>,
  /** The control last clicked in the diagram, whose field lights up for a moment */
  flashed: { controlId: ControlId, count: number } | null,
  /** The control hovered over in the diagram, whose field is lit up while it is */
  hovered: ControlId | null,
  /** Called as a field is hovered over, lighting up its control in the diagram */
  onHoveredChange: (controlId: ControlId | null) => void,
  onChange: (bindings: GamepadBindings) => void,
}) {
  return <div className="custom-controls">
    {CONTROL_GROUPS.map((group) => <Form.Group key={group}>
      <Form.Label as="h4" className="group-heading">{group}</Form.Label>
      <ul className="control-list">
        {CONTROL_IDS.filter((controlId) => getControl(controlId).group === group).map((controlId) => <ControlRow
          // A new row for each click, so its light starts again
          key={flashed?.controlId === controlId ? `${controlId}-${flashed.count}` : controlId}
          flashing={flashed?.controlId === controlId}
          hovered={hovered === controlId}
          onHoveredChange={onHoveredChange}
          controlId={controlId}
          bindings={bindings}
          layout={layout}
          pressed={pressedControls.has(controlId)}
          onChange={onChange}
        />)}
      </ul>
    </Form.Group>)}
    <Form.Group className="reset">
      <Dropdown>
        <Dropdown.Toggle variant="outline-warning">Reset to…</Dropdown.Toggle>
        <Dropdown.Menu>
          {GAMEPAD_PRESET_IDS.map((presetId) => <Dropdown.Item
            key={presetId}
            onClick={() => onChange(GAMEPAD_PRESETS[presetId].bindings as GamepadBindings)}
          >
            {GAMEPAD_PRESETS[presetId].title}
          </Dropdown.Item>)}
        </Dropdown.Menu>
      </Dropdown>
    </Form.Group>
  </div>;
}

/**
 * A control, named, with a dropdown of what it does beside it. It's named without what its group's heading already says
 * (the d-pad's buttons and the sticks' directions by just their arrows, a stick's press as "Press (L3)").
 */
function ControlRow({ controlId, bindings, layout, pressed, flashing, hovered, onHoveredChange, onChange }: {
  controlId: ControlId,
  /** Lights it up for a moment, fading out */
  flashing: boolean,
  /** Lights it up, for as long as its control in the diagram is hovered over */
  hovered: boolean,
  onHoveredChange: (controlId: ControlId | null) => void,
  bindings: GamepadBindings,
  layout: ControllerLayout,
  pressed: boolean,
  onChange: (bindings: GamepadBindings) => void,
}) {
  const label = controlLabel(controlId, layout);
  const arrow = directionArrow(controlId);
  const analog = bindings.analog[controlId];
  const { plain, heldWith } = controlActions(bindings, controlId);
  const inputId = `gamepad-control-${controlId}`;

  const choose = (value: ActionOption["value"]) => onChange(value === "analog-seek-forwards" || value === "analog-seek-backwards"
    ? withAnalogAction(bindings, controlId, value)
    : withControlAction(bindings, controlId, value));

  return <li
    className={cx("control", { pressed, flashing, hovered, direction: arrow })}
    data-control={controlId}
    onMouseEnter={() => onHoveredChange(controlId)}
    onMouseLeave={() => onHoveredChange(null)}
  >
    <label className="control-title" htmlFor={inputId}>{controlShortLabel(controlId, layout)}</label>
    <Select<ActionOption>
      inputId={inputId}
      aria-label={`Action for ${label}`}
      value={analog ? analogOption(controlId, analog) : findOption(plain ?? heldWith)}
      options={actionOptions(controlId)}
      onChange={(option: ActionOption | null) => option && choose(option.value)}
      formatOptionLabel={(option: ActionOption, { context }: { context: "menu" | "value" }) =>
        context === "value" ? option.chosenLabel ?? option.label : option.label}
    />
  </li>;
}
