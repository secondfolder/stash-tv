import React from "react"
import * as yup from "yup";
import ActionButtonBase from "../ActionButtonBase";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import InfoOutlineIcon from '../../../assets/info-outline.svg?react';
import type { ActionButtonDefinitionInput } from "./index";
import cx from "classnames";
import { sharedActionButtonSchema } from "../action-button-config";

const id = "show-scene-info";

export const buttonDefinition = {
  id,
  title: {
    active: "Close scene info",
    inactive: "Show scene info",
  },
  icon: {
    active: faCircleInfo,
    inactive: InfoOutlineIcon,
  },
  components: {
    button: ShowSceneInfoActionButton,
  },
  configSchema: sharedActionButtonSchema.shape({
    buttonType: yup.string().oneOf([id]).required(),
  })
} as const satisfies ActionButtonDefinitionInput;

export function ShowSceneInfoActionButton({
  sceneInfoOpen,
  setSceneInfoOpen,
}: {
  sceneInfoOpen: boolean,
  setSceneInfoOpen: (open: boolean) => void,
}) {
  return <ActionButtonBase
    state={sceneInfoOpen ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    data-testid="MediaSlide--infoButton"
    onClick={() => setSceneInfoOpen(!sceneInfoOpen)}
  />
}
