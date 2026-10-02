import React, { useMemo } from "react";
import { getLogger } from "@logtape/logtape";
import { ActionButtonConfig, allButtonDefinition, getActionButtonDefinition } from "../../action-buttons/buttons";
import { ActionButtonIcon, ActionButtonTitle } from "../../action-buttons/ActionButtonBase";
import { ConfigItemModal } from "../ConfigItemModal";

const logger = getLogger(["stash-tv", "ActionButtonSettingsModal"]);

type Props = {
  initialActionButtonConfig: ActionButtonConfig;
  /** Whether the button is being added to the stack or is already in it */
  operation: "add" | "edit";
  onClose: () => void;
  onSave: (config: ActionButtonConfig) => void;
}

export const ActionButtonSettingsModal = ({ initialActionButtonConfig, operation, onClose, onSave }: Props) => {
  const initialConfig = initialActionButtonConfig

  // We memorise this so that the header shows the state of the saved config, not the config as it's being edited
  const initialButtonDefinition = useMemo(
    () => allButtonDefinition.find(def => def.id === initialConfig.buttonType),
    [initialConfig.id]
  )

  if (!initialButtonDefinition) {
    logger.error("Unknown action button type in settings modal", { type: initialConfig.buttonType })
    return null
  }
  const actionButtonDefinition = getActionButtonDefinition(initialConfig.buttonType)
  if (!('settings' in actionButtonDefinition.components)) {
    logger.warn("Action button definition has no settings component", { actionButtonDefinition })
    return null
  }
  const SettingsForm = actionButtonDefinition.components.settings

  return (
    <ConfigItemModal<ActionButtonConfig>
      className="ActionButtonSettingsModal"
      operation={operation}
      initialValues={initialConfig}
      schema={actionButtonDefinition.configSchema}
      onClose={onClose}
      onSave={onSave}
      header={<>
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
      </>}
    >
      {/* @ts-expect-error - formik and the button's settings should necessarily be for the same config schema but not sure how to type that */}
      {formik => <SettingsForm formik={formik} />}
    </ConfigItemModal>
  )
}
