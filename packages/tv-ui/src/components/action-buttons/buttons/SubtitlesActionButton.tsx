import React from "react"
import * as yup from "yup";
import { useTvConfig } from "../../../store/tvConfig";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";
import { faClosedCaptioning } from "@fortawesome/free-solid-svg-icons";
import ClosedCaptioningOutline from '../../../assets/closed-captioning-outline.svg?react';
import type { ActionButtonDefinitionInput } from "./index";
import cx from "classnames";
import useStashTvConfig from "../../../hooks/useStashTvConfig";
import ISO6391 from "iso-639-1";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";

const id = "subtitles";

export const buttonDefinition = {
  id,
  title: {
    active: "Hide subtitles",
    inactive: "Show subtitles",
  },
  icon: {
    active: faClosedCaptioning,
    inactive: ClosedCaptioningOutline,
  },
  components: {
    button: SubtitlesActionButton,
  },
  configSchema: sharedActionButtonSchema.shape({
    buttonType: yup.string().oneOf([id]).required(),
  }),
} as const satisfies ActionButtonDefinitionInput;

export function SubtitlesActionButton({
  scene
}: {
  scene: GQL.SceneDataFragment
}) {
  const { showSubtitles, set: setTvConfig } = useTvConfig();
  const { data: { subtitleLanguage } } = useStashTvConfig()
  /** Only render captions track if available, and it matches the user's chosen
  * language. Fails accessibility if missing, but there's no point rendering
  * an empty track. */
  const captionSources =
    scene.captions && subtitleLanguage
      ? scene.captions
          .map((cap, i) => {
            if (cap.language_code === subtitleLanguage) {
              const src = scene.paths.caption + `?lang=${cap.language_code}&type=${cap.caption_type}`;
              return (
                <track
                  default={subtitleLanguage === cap.language_code}
                  key={i}
                  kind="captions"
                  label={ISO6391.getName(cap.language_code) || "Unknown"}
                  src={src}
                  srcLang={cap.language_code}
                />
              );
            }
          })
          .find((c) => !!c)
      : null;
  if (!captionSources) return null
  return <ActionButtonBase
    state={!!captionSources && showSubtitles ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    data-testid="MediaSlide--subtitlesButton"
    onClick={() => setTvConfig("showSubtitles", (prev) => !prev)}
  />
}
