import React from "react"
import * as yup from "yup";
import { useTvConfig } from "../../../store/tvConfig";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";
import { faRepeat } from "@fortawesome/free-solid-svg-icons";

import LoopOutlineIcon from '../../../assets/loop-outline.svg?react';
import type { ActionButtonDefinitionInput } from "./index";
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
    buttonType: yup.string().oneOf([id]).required(),
  }),
} as const satisfies ActionButtonDefinitionInput;

export function LoopActionButton() {
  const { looping, set: setTvConfig } = useTvConfig();

  return <ActionButtonBase
    state={looping ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    data-testid="MediaSlide--loopButton"
    onClick={() => setTvConfig("looping", (prev) => !prev)}
  />
}
