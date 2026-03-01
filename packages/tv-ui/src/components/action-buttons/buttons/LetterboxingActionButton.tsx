import React from "react"
import * as yup from "yup";
import { useAppStateStore } from "../../../store/appStateStore";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";
import ContainIcon from '../../../assets/contain.svg?react';

import CoverOutlineIcon from '../../../assets/cover-outline.svg?react';
import type { ActionButtonDefinition } from "./index";
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
    type: yup.string().oneOf([id]).required(),
  }),
} as const satisfies ActionButtonDefinition;

export function LetterboxingActionButton() {
  const { letterboxing, set: setAppSetting } = useAppStateStore();

  return <ActionButtonBase
    state={letterboxing ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    data-testid="MediaSlide--letterboxButton"
    onClick={() => setAppSetting("letterboxing", (prev) => !prev)}
  />
}
