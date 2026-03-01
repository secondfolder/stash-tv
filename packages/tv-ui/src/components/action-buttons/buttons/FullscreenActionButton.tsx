import React from "react"
import * as yup from "yup";
import { useAppStateStore } from "../../../store/appStateStore";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";
import { faExpand } from "@fortawesome/free-solid-svg-icons";
import ExpandOutlineIcon from '../../../assets/expand-outline.svg?react';
import type { ActionButtonDefinition } from "./index";
import cx from "classnames";

const id = "fullscreen";

export const buttonDefinition = {
  id,
  title: {
    active: "Close fullscreen",
    inactive: "Open fullscreen",
  },
  icon: {
    active: faExpand,
    inactive: ExpandOutlineIcon,
  },
  components: {
    button: FullscreenActionButton,
  },
  configSchema: sharedActionButtonSchema.shape({
    type: yup.string().oneOf([id]).required(),
  })
} as const satisfies ActionButtonDefinition;

export function FullscreenActionButton() {
  const { fullscreen, set: setAppSetting } = useAppStateStore();
  if (!('exitFullscreen' in document)) return null

  return <ActionButtonBase
    state={fullscreen ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    data-testid="MediaSlide--fullscreenButton"
    onClick={() => setAppSetting("fullscreen", (prev) => !prev)}
  />
}
