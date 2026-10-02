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
import { defaultRatingSystemOptions } from "stash-ui/dist/src/utils/rating";
import { RatingSystem } from "stash-ui/wrappers/components/shared/RatingSystem";
import { useSetRating } from "../../../hooks/rating/useSetRating";
import { formatRating } from "../../../helpers/rating";
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

  const sceneRatingFormatted = typeof scene.rating100 === "number"
    ? formatRating(scene.rating100, ratingSystemOptions.type)
    : undefined

  const setRating = useSetRating(scene);

  return <ActionButtonBase
    state={typeof scene.rating100 === "number" ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    data-testid="MediaSlide--rateButton"
    sidePanel={
      <div className={cx("action-button-rating-stars", {'left-handed': leftHandedUi}, ratingSystemOptions.type.toLowerCase())}>
        {/* Its rating on the side away from the action buttons, so the stars stay put as it changes */}
        <RatingSystem
          value={scene.rating100}
          onSetRating={setRating}
          clickToRate={false}
          valueSide={leftHandedUi ? "end" : "start"}
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
