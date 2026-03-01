import React, { useMemo } from "react";
import { Modal } from "../../containers/Modal";
import { Button } from "react-bootstrap";
import "./ActionButtonSettingsModal.css";
import { yupFormikValidate } from "stash-ui/dist/src/utils/yup";
import { getLogger } from "@logtape/logtape";
import { useFormik } from "formik";
import { ActionButtonConfig, allButtonDefinition, getActionButtonDefinition } from "../../action-buttons/buttons";
import { ActionButtonIcon, ActionButtonTitle } from "../../action-buttons/ActionButtonBase";

const logger = getLogger(["stash-tv", "ActionButtonSettingsModal"]);

type Props = {
  initialActionButtonConfig: ActionButtonConfig;
  onClose: () => void;
  onSave: (config: ActionButtonConfig) => void;
}

export const ActionButtonSettingsModal = ({ initialActionButtonConfig, onClose, onSave }: Props) => {
  const initialConfig = initialActionButtonConfig
  const operation = initialConfig.id ? "edit" : "add";

  // We memorise this so that the header shows the state of the saved config, not the config as it's being edited
  const initialButtonDefinition = useMemo(
    () => allButtonDefinition.find(def => def.id === initialConfig.type),
    [initialConfig.id]
  )

  if (!initialButtonDefinition) {
    logger.error("Unknown action button type in settings modal", { type: initialConfig.type })
    return null
  }
  const actionButtonDefinition = getActionButtonDefinition(initialConfig.type)
  if (!('settings' in actionButtonDefinition.components)) {
    logger.warn("Action button definition has no settings component", { actionButtonDefinition })
    return null
  }

  const formik = useFormik({
    initialValues: initialConfig,
    enableReinitialize: true,
    validate: yupFormikValidate(actionButtonDefinition.configSchema),
    onSubmit: (values) => onSave(actionButtonDefinition.configSchema.cast(values)),
  });
  // @ts-expect-error - formik and the button's settings should necessarily be for the same config schema but not sure how to type that
  const form = <actionButtonDefinition.components.settings formik={formik} />

  return (
    <Modal show onHide={() => onClose()} title="" className="ActionButtonSettingsModal">
      <Modal.Header>
        <ActionButtonIcon
          iconDefinition={initialButtonDefinition.icon}
          state="inactive"
          size="small"
          config={initialConfig}
        />
        <span>
          {operation === "add" ? "Add" : "Edit"}{" "}
          <em>
            <ActionButtonTitle
              title={initialButtonDefinition.title}
              state="inactive"
              config={initialConfig}
            />
          </em>{" "}
          Action Button
        </span>
      </Modal.Header>
      <Modal.Body>
        <div className="dialog-content">
          {form}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={() => onClose()}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => formik.submitForm()}>
          {operation === "add" ? "Add" : "Save"}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
