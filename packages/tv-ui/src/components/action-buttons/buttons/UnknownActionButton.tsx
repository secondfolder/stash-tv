import React from "react"
import * as yup from "yup";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import cx from "classnames";
import type { ActionButtonDefinitionInput } from "./index";

const id = "unknown-action-button";

/**
 * Fallback shown when persisted config references a button type this build doesn't
 * know — e.g. stack config saved by a newer Stash TV instance connected to the same
 * Stash server. Deliberately not registered in `allButtonDefinition` (so it can't be
 * added to the stack); `getActionButtonDefinition` returns it for unknown types
 * instead of throwing, keeping the app rendering.
 */
export const unknownActionButtonDefinition = {
  id,
  title: ({config}) => <>Unknown button: "{config?.buttonType || "<unknown type>"}"</>,
  icon: { active: faTriangleExclamation, inactive: faTriangleExclamation },
  components: { button: UnknownActionButton },
  configSchema: sharedActionButtonSchema.shape({
    buttonType: yup.string().required(),
  }),
} as const satisfies ActionButtonDefinitionInput;

function UnknownActionButton({ config }: { config: Record<string, any> }) {
  return (
    <ActionButtonBase
      state="inactive"
      icon={unknownActionButtonDefinition.icon}
      title={unknownActionButtonDefinition.title}
      className={cx(id, "hide-on-ui-hide")}
      displayOnly
      sideInfo={`Unknown button type "${String(config.buttonType)}"`}
    />
  )
}
