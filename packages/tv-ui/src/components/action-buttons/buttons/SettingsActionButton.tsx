import React from "react"
import * as yup from "yup";
import { useTvConfig } from "../../../store/tvConfig";
import ActionButtonBase from "../ActionButtonBase";
import type { ActionButtonDefinitionInput } from "./index";
import cx from "classnames";
import { sharedActionButtonSchema } from "../action-button-config";
import { faGear } from "@fortawesome/free-solid-svg-icons";
import CogOutlineIcon from '../../../assets/cog-outline.svg?react';
import { useGlobalState } from "../../../store/globalState";

const id = "settings";

export const buttonDefinition = {
  id,
  title: {
    "active": "Hide Settings",
    "inactive": "Show Settings"
  },
  icon: {
    active: faGear,
    inactive: CogOutlineIcon,
  },
  components: {
    button: SettingsActionButton,
  },
  configSchema: sharedActionButtonSchema.shape({
    buttonType: yup.string().oneOf([id]).required(),
  })
} as const satisfies ActionButtonDefinitionInput;

export function SettingsActionButton() {
  const { showSettings, set: setGlobalState } = useGlobalState();
  return <ActionButtonBase
    state={showSettings ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    onClick={() => setGlobalState("showSettings", (prev) => !prev)}
  />
}
