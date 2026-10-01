import React from "react"
import * as yup from "yup";
import { useTvConfig } from "../../../store/tvConfig";
import { sharedActionButtonSchema } from "../action-button-config";
import LocationPlayIcon from '../../../assets/location-play-outline.svg?react';
import type { ActionButtonDefinitionInput } from "./index";
import { usePlaybackPositionOptions } from "../../../hooks/usePlaybackPositionOptions";
import { CycleOptionActionButton, cycleOptionTitle } from "./CycleOptionActionButton";

const id = "start-position";
const name = "Start point";

export const buttonDefinition = {
  id,
  title: cycleOptionTitle(name, () => usePlaybackPositionOptions().startPositionOptions, "Change start point"),
  icon: LocationPlayIcon,
  components: {
    button: StartPositionActionButton,
  },
  configSchema: sharedActionButtonSchema.shape({
    buttonType: yup.string().oneOf([id]).required(),
  }),
} as const satisfies ActionButtonDefinitionInput;

export function StartPositionActionButton() {
  const { startPosition, set: setTvConfig } = useTvConfig();
  const { startPositionOptions } = usePlaybackPositionOptions();

  return <CycleOptionActionButton
    id={id}
    name={name}
    options={startPositionOptions}
    value={startPosition}
    unlabelledValue="beginning"
    onChange={value => setTvConfig("startPosition", value)}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
  />
}
