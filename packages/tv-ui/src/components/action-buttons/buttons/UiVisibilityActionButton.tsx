import React from "react"
import * as yup from "yup";
import { useTvConfig } from "../../../store/tvConfig";
import ActionButtonBase from "../ActionButtonBase";
import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import VerticalEllipsisOutlineIcon from '../../../assets/vertical-ellipsis-outline.svg?react';
import type { ActionButtonDefinitionInput } from "./index";
import cx from "classnames";
import { sharedActionButtonSchema } from "../action-button-config";

const id = "ui-visibility";

export const buttonDefinition = {
  id,
  title: {
    active: "Hide UI",
    inactive: "Show UI",
  },
  icon: {
    active: faEllipsisVertical,
    inactive: VerticalEllipsisOutlineIcon,
  },
  components: {
    button: UiVisibilityActionButton,
  },
  configSchema: sharedActionButtonSchema.shape({
    buttonType: yup.string().oneOf([id]).required(),
  })
} as const satisfies ActionButtonDefinitionInput;

export function UiVisibilityActionButton() {
  const { uiVisible, set: setTvConfig } = useTvConfig();

  return <ActionButtonBase
    state={uiVisible ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "dim-on-ui-hide", {'active': uiVisible})}
    onClick={() => setTvConfig("uiVisible", (prev) => !prev)}
  />
}
