import React from "react"
import * as yup from "yup";
import { useTvConfig } from "../../../store/tvConfig";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";
import PortraitOutlineIcon from '../../../assets/portrait-rotation-outline.svg?react';

import LandscapeIcon from '../../../assets/landscape-rotation.svg?react';
import type { ActionButtonDefinitionInput } from "./index";
import cx from "classnames";

const id = "force-landscape";

export const buttonDefinition = {
  id,
  title: {
    active: "Landscape",
    inactive: "Portrait",
  },
  icon: {
    active: LandscapeIcon,
    inactive: PortraitOutlineIcon,
  },
  components: {
    button: ForceLandscapeActionButton,
  },
  configSchema: sharedActionButtonSchema.shape({
    buttonType: yup.string().oneOf([id]).required(),
  })
} as const satisfies ActionButtonDefinitionInput;

export function ForceLandscapeActionButton() {
  const { forceLandscape, set: setTvConfig } = useTvConfig();

  return <ActionButtonBase
    state={forceLandscape ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    data-testid="MediaSlide--forceLandscapeButton"
    onClick={() => setTvConfig("forceLandscape", (prev) => !prev)}
  />
}
