import "./SceneInfoFieldOptionsModal.css";
import React from "react";
import * as yup from "yup";
import { Button, ButtonGroup, Form } from "react-bootstrap";
import { ConfigItemModal } from "../../settings/ConfigItemModal";
import Switch from "../../settings/Switch";
import {
  sceneInfoFieldLabels,
  sceneInfoFieldOptionSchemas,
  type SceneInfoFieldOptions,
  type SceneInfoFieldWithOptions,
} from "./scene-info-config";
import type { OptionsSchema } from "./field-options";

/** Validates a field's options as they're edited, from its options' schema */
function validationSchema(schema: OptionsSchema) {
  return yup.object(Object.fromEntries(Object.entries(schema).map(([name, option]) => [
    name,
    option.type === "toggle"
      ? yup.boolean().required()
      : yup.string().oneOf(Object.keys(option.choices)).required(),
  ])));
}

/**
 * The dialog for choosing how a field of the scene info panel is shown, opened with its pill's options button. Its
 * controls are the field's options' schema (see field-options.tsx): a switch for a toggle, a button group for a choice.
 */
export function SceneInfoFieldOptionsModal<F extends SceneInfoFieldWithOptions>({ field, options, onClose, onSave }: {
  field: F;
  options: SceneInfoFieldOptions[F];
  onClose: () => void;
  onSave: (options: SceneInfoFieldOptions[F]) => void;
}) {
  const schema: OptionsSchema = sceneInfoFieldOptionSchemas[field];
  return <ConfigItemModal<Record<string, unknown>>
    className="SceneInfoFieldOptionsModal"
    operation="edit"
    header={<span>{sceneInfoFieldLabels[field]} options</span>}
    initialValues={options}
    schema={validationSchema(schema)}
    onClose={onClose}
    onSave={values => onSave(values as SceneInfoFieldOptions[F])}
  >
    {formik => Object.entries(schema).filter(([, option]) => !option.shown || option.shown(formik.values)).map(([name, option]) => {
      const id = `scene-info-${field}-${name}`;
      const value = formik.values[name];
      return <Form.Group key={name}>
        {option.type === "toggle"
          ? <Switch
            id={id}
            checked={Boolean(value)}
            label={option.label}
            onChange={event => formik.setFieldValue(name, event.target.checked)}
          />
          : <>
            <label id={`${id}-label`}>{option.label}</label>
            {/* Styled like the editor's "Show…" buttons */}
            <div>
              <ButtonGroup aria-labelledby={`${id}-label`}>
                {Object.entries(option.choices).map(([choice, label]) => {
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
        {option.description && <Form.Text className="text-muted">{option.description}</Form.Text>}
      </Form.Group>
    })}
  </ConfigItemModal>
}
