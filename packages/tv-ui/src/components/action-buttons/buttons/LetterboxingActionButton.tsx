import React from "react"
import * as yup from "yup";
import { useTvConfig } from "../../../store/tvConfig";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";
import ContainIcon from '../../../assets/contain.svg?react';

import CoverOutlineIcon from '../../../assets/cover-outline.svg?react';
import type { ActionButtonDefinitionInput } from "./index";
import cx from "classnames";

const id = "letterboxing";

export const buttonDefinition = {
  id,
  title: {
    active: "Fit to screen",
    inactive: "Fill screen",
  },
  icon: {
    active: ContainIcon,
    inactive: CoverOutlineIcon,
  },
  components: {
    button: LetterboxingActionButton,
  },
  configSchema: sharedActionButtonSchema.shape({
    buttonType: yup.string().oneOf([id]).required(),
  }),
} as const satisfies ActionButtonDefinitionInput;

export function LetterboxingActionButton() {
  const { letterboxing, set: setTvConfig } = useTvConfig();

  return <ActionButtonBase
    state={letterboxing ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    data-testid="MediaSlide--letterboxButton"
    onClick={() => setTvConfig("letterboxing", (prev) => !prev)}
  />
}
