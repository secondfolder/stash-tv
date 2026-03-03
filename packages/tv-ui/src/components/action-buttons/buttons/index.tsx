import { ReactNode } from "react";
import { ActionButtonIcon } from "../icons";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { MediaItem } from "../../../hooks/useMediaItems";
import { VideoJsPlayer } from "video.js";
import * as yup from "yup";
import { useFormik } from "formik";
import { buttonDefinition as createMarkerButtonDefinition } from "./CreateMarkerActionButton";
import { buttonDefinition as deleteMediaItemButtonDefinition } from "./DeleteMediaItemActionButton";
import { buttonDefinition as editTagsButtonDefinition } from "./EditTagsActionButton";
import { buttonDefinition as forceLandscapeButtonDefinition } from "./ForceLandscapeActionButton";
import { buttonDefinition as fullscreenButtonDefinition } from "./FullscreenActionButton";
import { buttonDefinition as letterboxingButtonDefinition } from "./LetterboxingActionButton";
import { buttonDefinition as loopButtonDefinition } from "./LoopActionButton";
import { buttonDefinition as oCounterButtonDefinition } from "./OCounterActionButton";
import { buttonDefinition as playbackRateButtonDefinition } from "./PlaybackRateActionButton";
import { buttonDefinition as quickTagButtonDefinition } from "./QuickTagActionButton";
import { buttonDefinition as rateSceneButtonDefinition } from "./RateSceneActionButton";
import { buttonDefinition as setOrganizedButtonDefinition } from "./SetOrganizedActionButton";
import { buttonDefinition as settingsButtonDefinition } from "./SettingsActionButton";
import { buttonDefinition as showSceneInfoButtonDefinition } from "./ShowSceneInfoActionButton";
import { buttonDefinition as subtitlesButtonDefinition } from "./SubtitlesActionButton";
import { buttonDefinition as uiVisibilityButtonDefinition } from "./UiVisibilityActionButton";
import { buttonDefinition as volumeButtonDefinition } from "./VolumeActionButton";

type ActionButtonProps = {
  config: Record<string, any>,
  scene: GQL.SceneDataFragment,
  mediaItem: MediaItem,
  playerRef: React.RefObject<VideoJsPlayer>,
  sceneInfoOpen: boolean,
  setSceneInfoOpen: (open: boolean) => void,
}

export type ActionButtonDefinitionInput<Config extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  title: Record<string, string> | React.FC<{state: string, config?: Config}>;
  icon: ActionButtonIcon;
  components: {
    button: (props: ActionButtonProps) => ReactNode;
    settings?: (props: { formik: ReturnType<typeof useFormik<Config>> }) => ReactNode;
  },
  configSchema: yup.AnyObjectSchema;
  isRepeatable?: boolean; // Whether the action can be added to the action stack multiple times
}

export const allButtonDefinition = [
  createMarkerButtonDefinition,
  deleteMediaItemButtonDefinition,
  editTagsButtonDefinition,
  forceLandscapeButtonDefinition,
  fullscreenButtonDefinition,
  letterboxingButtonDefinition,
  loopButtonDefinition,
  oCounterButtonDefinition,
  quickTagButtonDefinition,
  rateSceneButtonDefinition,
  settingsButtonDefinition,
  showSceneInfoButtonDefinition,
  subtitlesButtonDefinition,
  uiVisibilityButtonDefinition,
  setOrganizedButtonDefinition,
  playbackRateButtonDefinition,
  volumeButtonDefinition,
] as const

export type ActionButtonDefinition = typeof allButtonDefinition[number]

export type ActionButtonConfig = yup.InferType<ActionButtonDefinition["configSchema"]>

export function getActionButtonDefinition<
  ButtonType extends ActionButtonDefinition["id"]
>(
  type: ButtonType
): Extract<ActionButtonDefinition, { id: ButtonType }> {
  const definition = allButtonDefinition.find(def => def.id === type)
  if (!definition) {
    throw new Error(`No action button definition found for type ${type}`)
  }
  return definition as Extract<ActionButtonDefinition, { id: ButtonType }>
}
