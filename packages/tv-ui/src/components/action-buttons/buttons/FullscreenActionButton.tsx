import React from "react"
import * as yup from "yup";
import { useTvConfig } from "../../../store/tvConfig";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";
import { faExpand } from "@fortawesome/free-solid-svg-icons";
import ExpandOutlineIcon from '../../../assets/expand-outline.svg?react';
import type { ActionButtonDefinitionInput } from "./index";
import cx from "classnames";
import { useGlobalState } from "../../../store/globalState";

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
    buttonType: yup.string().oneOf([id]).required(),
  })
} as const satisfies ActionButtonDefinitionInput;

export function FullscreenActionButton() {
  const { fullscreen, set: setGlobalState } = useGlobalState();
  if (!('exitFullscreen' in document)) return null

  return <ActionButtonBase
    state={fullscreen ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    data-testid="MediaSlide--fullscreenButton"
    onClick={() => setGlobalState("fullscreen", (prev) => !prev)}
  />
}
