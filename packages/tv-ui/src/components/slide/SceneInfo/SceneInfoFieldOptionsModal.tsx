import "./SceneInfoFieldOptionsModal.css";
import React, { ReactNode } from "react";
import * as yup from "yup";
import { Button, ButtonGroup, Form } from "react-bootstrap";
import { ConfigItemModal } from "../../settings/ConfigItemModal";
import Switch from "../../settings/Switch";
import { sceneInfoFieldLabelIcons } from "./fields";
import {
  sceneInfoFieldLabels,
  sceneInfoFieldOptionChoices,
  spacerSizeLabels,
  type SceneInfoFieldOptions,
  type SceneInfoFieldWithOptions,
} from "./scene-info-config";

/**
 * A choice's button: its text, or something else (e.g. an icon) with a name for screen readers (and as its tooltip)
 */
type ChoiceLabel = string | { content: ReactNode; name: string };

/**
 * One of a field's options in its dialog: a choice between values (`choices` labels them), or a switch. `shown` hides
 * it while the field's other options make it irrelevant.
 */
type OptionControl<F extends SceneInfoFieldWithOptions> = {
  [O in keyof SceneInfoFieldOptions[F]]: {
    option: O;
    label: string;
    description?: string;
    shown?: (options: SceneInfoFieldOptions[F]) => boolean;
  } & (SceneInfoFieldOptions[F][O] extends boolean
    ? { type: "switch" }
    : { type: "choice"; choices: Record<Extract<SceneInfoFieldOptions[F][O], string>, ChoiceLabel> })
}[keyof SceneInfoFieldOptions[F]];

/** Any field's option control, as the dialog renders them */
type AnyOptionControl = { option: string; label: string; description?: string; shown?: (options: never) => boolean }
  & ({ type: "switch" } | { type: "choice"; choices: Record<string, ChoiceLabel> });

/** The choice of not labelling a field's value. In italics, as it isn't the label, as the others are. */
const noLabelChoice = { none: { content: <em>None</em>, name: "None" } };

/** The choice of labelling a field's value with its icon or with its name */
function labelChoices(field: keyof typeof sceneInfoFieldLabelIcons) {
  const Icon = sceneInfoFieldLabelIcons[field].active;
  return { icon: { content: <Icon aria-hidden />, name: "Icon" }, text: sceneInfoFieldLabels[field] };
}

const optionControls: { [F in SceneInfoFieldWithOptions]: OptionControl<F>[] } = {
  rating: [{
    option: "display",
    label: "Show as",
    type: "choice",
    choices: { control: "Rating control", text: "Text" },
    description: "The rating control sets the scene's rating, and shows even when it has none.",
  }],
  "o-count": [{
    option: "display",
    label: "Show as",
    type: "choice",
    choices: { control: "O-counter button", text: "Text" },
    description: "The button marks an orgasm, like the O-counter action button, and shows even when the O-count is 0.",
  }, {
    option: "label",
    label: "Label",
    type: "choice",
    choices: labelChoices("o-count"),
    shown: options => options.display === "text",
  }],
  performers: [{ option: "label", label: "Label", type: "choice", choices: { ...noLabelChoice, ...labelChoices("performers") } }],
  "play-count": [{
    option: "label",
    label: "Label",
    type: "choice",
    choices: labelChoices("play-count"),
    description: "With the icon, it shows before the scene's been played too, the icon an outline until it has.",
  }],
  details: [{
    option: "showFullText",
    label: "Always show the full text",
    type: "switch",
    description: "Otherwise the details are cut short after 3 lines. Click them to show the rest.",
  }],
  tags: [{
    option: "showAll",
    label: "Always show every tag",
    type: "switch",
    description: "Otherwise only 2 rows of tags are shown, with a button below them showing the rest.",
  }],
  spacer: [{
    option: "size",
    label: "Size",
    type: "choice",
    choices: spacerSizeLabels,
    description: "Alone on its line, it's space between lines. Beside other fields, it's space between them.",
  }],
  resolution: [
    {
      option: "format",
      label: "Show as",
      type: "choice",
      choices: { name: "Name (e.g. 1080p)", dimensions: "Width × height (e.g. 1920×1080)" },
    },
    { option: "label", label: "Label", type: "choice", choices: { ...noLabelChoice, ...labelChoices("resolution") } },
  ],
};

/** Validates a field's options as they're edited, from the field's controls */
function optionsSchema(field: SceneInfoFieldWithOptions) {
  const controls = optionControls[field] as AnyOptionControl[];
  const choices = sceneInfoFieldOptionChoices as Record<string, Record<string, readonly string[]> | undefined>;
  return yup.object(Object.fromEntries(controls.map(control => [
    control.option,
    control.type === "switch"
      ? yup.boolean().required()
      : yup.string().oneOf([...(choices[field]?.[control.option] ?? [])]).required(),
  ])));
}

/** The dialog for choosing how a field of the scene info panel is shown, opened with its pill's options button */
export function SceneInfoFieldOptionsModal<F extends SceneInfoFieldWithOptions>({ field, options, onClose, onSave }: {
  field: F;
  options: SceneInfoFieldOptions[F];
  onClose: () => void;
  onSave: (options: SceneInfoFieldOptions[F]) => void;
}) {
  const controls = optionControls[field] as AnyOptionControl[];
  return <ConfigItemModal<Record<string, unknown>>
    className="SceneInfoFieldOptionsModal"
    operation="edit"
    header={<span>{sceneInfoFieldLabels[field]} options</span>}
    initialValues={options}
    schema={optionsSchema(field)}
    onClose={onClose}
    onSave={values => onSave(values as SceneInfoFieldOptions[F])}
  >
    {formik => controls.filter(control => !control.shown || control.shown(formik.values as never)).map(control => {
      const id = `scene-info-${field}-${control.option}`;
      const name = control.option;
      const value = formik.values[name];
      return <Form.Group key={name}>
        {control.type === "switch"
          ? <Switch
            id={id}
            checked={Boolean(value)}
            label={control.label}
            onChange={event => formik.setFieldValue(name, event.target.checked)}
          />
          : <>
            <label id={`${id}-label`}>{control.label}</label>
            {/* Styled like the editor's "Show…" buttons */}
            <div>
              <ButtonGroup aria-labelledby={`${id}-label`}>
                {Object.entries(control.choices).map(([choice, label]) => {
                  const active = choice === value;
                  return <Button
                    key={choice}
                    variant={active ? "primary" : "secondary"}
                    active={active}
                    aria-pressed={active}
                    aria-label={typeof label === "string" ? undefined : label.name}
                    title={typeof label === "string" ? undefined : label.name}
                    onClick={() => formik.setFieldValue(name, choice)}
                  >
                    {typeof label === "string" ? label : label.content}
                  </Button>
                })}
              </ButtonGroup>
            </div>
          </>
        }
        {control.description && <Form.Text className="text-muted">{control.description}</Form.Text>}
      </Form.Group>
    })}
  </ConfigItemModal>
}
