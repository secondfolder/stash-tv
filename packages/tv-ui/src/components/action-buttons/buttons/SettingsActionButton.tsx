import React from "react"
import * as yup from "yup";
import { useAppStateStore } from "../../../store/appStateStore";
import ActionButtonBase from "../ActionButtonBase";
import type { ActionButtonDefinition } from "./index";
import cx from "classnames";
import { sharedActionButtonSchema } from "../action-button-config";
import { faGear } from "@fortawesome/free-solid-svg-icons";
import CogOutlineIcon from '../../../assets/cog-outline.svg?react';

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
    type: yup.string().oneOf([id]).required(),
  })
} as const satisfies ActionButtonDefinition;

export function SettingsActionButton() {
  const { showSettings, set: setAppSetting } = useAppStateStore();
  return <ActionButtonBase
    state={showSettings ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    onClick={() => setAppSetting("showSettings", (prev) => !prev)}
  />
}
