import React from "react"
import * as yup from "yup";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";
import { faStar } from "@fortawesome/free-solid-svg-icons";
import StarOutlineIcon from '../../../assets/star-outline.svg?react';
import type { ActionButtonDefinitionInput } from "./index";
import cx from "classnames";
import { useTvConfig } from "../../../store/tvConfig";
import { ConfigurationContext } from "stash-ui/dist/src/hooks/Config";
import { defaultRatingSystemOptions, RatingSystemType } from "stash-ui/dist/src/utils/rating";
import { RatingSystem } from "stash-ui/wrappers/components/shared/RatingSystem";
import { useSceneUpdate } from "../../../hooks/useSceneUpdate";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";

const id = "rate-scene";

export const buttonDefinition = {
  id,
  title: {
    active: "Rate scene",
    inactive: "Rate scene",
  },
  icon: {
    active: faStar,
    inactive: StarOutlineIcon,
  },
  components: {
    button: RateSceneActionButton,
  },
  configSchema: sharedActionButtonSchema.shape({
    buttonType: yup.string().oneOf([id]).required(),
  })
} as const satisfies ActionButtonDefinitionInput;

export function RateSceneActionButton({
  scene,
}: {
  scene: GQL.SceneDataFragment,
}) {
  const { configuration: stashConfig } = React.useContext(ConfigurationContext);
  const { leftHandedUi } = useTvConfig();
  const ratingSystemOptions =
    stashConfig?.ui.ratingSystemOptions ?? defaultRatingSystemOptions;

  let sceneRatingFormatted
  if (typeof scene.rating100 === "number") {
    if (ratingSystemOptions.type === RatingSystemType.Stars) {
      sceneRatingFormatted = (scene.rating100 / 20).toFixed(1).replace(/\.0$/, ""); // Convert 0-100 to 0-5
    } else {
      sceneRatingFormatted = (scene.rating100 / 10).toString();
    }
  }

  const [updateScene] = useSceneUpdate(scene);
  function setRating(newRating: number | null) {
    updateScene({
      variables: {
        input: {
          id: scene.id,
          rating100: newRating,
        },
      },
    });
  }

  return <ActionButtonBase
    state={typeof scene.rating100 === "number" ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    data-testid="MediaSlide--rateButton"
    sidePanel={
      <div className={cx("action-button-rating-stars", {'not-set': typeof scene.rating100 !== "number", 'left-handed': leftHandedUi}, ratingSystemOptions.type.toLowerCase())}>
        <span className="clear star-rating-number">Clear</span>
        <RatingSystem
          value={scene.rating100}
          onSetRating={setRating}
          clickToRate={false}
        />
      </div>
    }
    onSidePanelToggle={(isOpen) => {
      if (!isOpen) return
      // Popover doesn't seem to be in the DOM at this point so we wait a tick
      setTimeout(() => {
        const inputElm = document.querySelector(".action-button-rating-stars input")
        if (inputElm instanceof HTMLInputElement) {
          inputElm.focus()
        }
      }, 10)
    }}
    sideInfo={sceneRatingFormatted}
  />
}
