import React from "react"
import * as yup from "yup";
import { useTvConfig } from "../../../store/tvConfig";
import { sharedActionButtonSchema } from "../action-button-config";
import LocationStopIcon from '../../../assets/location-stop-outline.svg?react';
import type { ActionButtonDefinitionInput } from "./index";
import { usePlaybackPositionOptions } from "../../../hooks/usePlaybackPositionOptions";
import { CycleOptionActionButton, cycleOptionTitle } from "./CycleOptionActionButton";

const id = "end-position";
const name = "End point";

export const buttonDefinition = {
  id,
  title: cycleOptionTitle(name, () => usePlaybackPositionOptions().endPositionOptions, "Change end point"),
  icon: LocationStopIcon,
  components: {
    button: EndPositionActionButton,
  },
  configSchema: sharedActionButtonSchema.shape({
    buttonType: yup.string().oneOf([id]).required(),
  }),
} as const satisfies ActionButtonDefinitionInput;

export function EndPositionActionButton() {
  const { endPosition, set: setTvConfig } = useTvConfig();
  const { endPositionOptions } = usePlaybackPositionOptions();

  return <CycleOptionActionButton
    id={id}
    name={name}
    options={endPositionOptions}
    value={endPosition}
    unlabelledValue="video-end"
    onChange={value => setTvConfig("endPosition", value)}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
  />
}
