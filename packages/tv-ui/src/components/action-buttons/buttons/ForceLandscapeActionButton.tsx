import React from "react"
import * as yup from "yup";
import { useAppStateStore } from "../../../store/appStateStore";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";
import PortraitOutlineIcon from '../../../assets/portrait-rotation-outline.svg?react';

import LandscapeIcon from '../../../assets/landscape-rotation.svg?react';
import type { ActionButtonDefinition } from "./index";
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
    type: yup.string().oneOf([id]).required(),
  })
} as const satisfies ActionButtonDefinition;

export function ForceLandscapeActionButton() {
  const { forceLandscape, set: setAppSetting } = useAppStateStore();

  return <ActionButtonBase
    state={forceLandscape ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    data-testid="MediaSlide--forceLandscapeButton"
    onClick={() => setAppSetting("forceLandscape", (prev) => !prev)}
  />
}
