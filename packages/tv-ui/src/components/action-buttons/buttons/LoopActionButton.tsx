import React from "react"
import * as yup from "yup";
import { useAppStateStore } from "../../../store/appStateStore";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";
import { faRepeat } from "@fortawesome/free-solid-svg-icons";

import LoopOutlineIcon from '../../../assets/loop-outline.svg?react';
import type { ActionButtonDefinition } from "./index";
import cx from "classnames";

const id = "loop";

export const buttonDefinition = {
  id,
  title: {
    active: "Stop looping scene",
    inactive: "Loop scene",
  },
  icon: {
    active: faRepeat,
    inactive: LoopOutlineIcon,
  },
  components: {
    button: LoopActionButton,
  },
  configSchema: sharedActionButtonSchema.shape({
    type: yup.string().oneOf([id]).required(),
  }),
} as const satisfies ActionButtonDefinition;

export function LoopActionButton() {
  const { looping, set: setAppSetting } = useAppStateStore();

  return <ActionButtonBase
    state={looping ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    data-testid="MediaSlide--loopButton"
    onClick={() => setAppSetting("looping", (prev) => !prev)}
  />
}
