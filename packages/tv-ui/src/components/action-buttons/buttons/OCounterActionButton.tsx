import React from "react"
import * as yup from "yup";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";
import { faPlus, faMinus } from "@fortawesome/free-solid-svg-icons";
import SplashIcon from '../../../assets/splash.svg?react';
import SplashOutlineIcon from '../../../assets/splash-outline.svg?react';
import type { ActionButtonDefinitionInput } from "./index";
import cx from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useSceneDecrementO, useSceneIncrementO } from "stash-ui/dist/src/core/StashService";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { useMediaItemState } from "../../../store/mediaItemState";

const id = "o-counter";

export const buttonDefinition = {
  id,
  title: {
    active: "Undo Orgasm Mark",
    inactive: "Mark Orgasm",
  },
  icon: {
    active: SplashIcon,
    inactive: SplashOutlineIcon,
  },
  components: {
    button: OCounterActionButton,
  },
  configSchema: sharedActionButtonSchema.shape({
    buttonType: yup.string().oneOf([id]).required(),
  })
} as const satisfies ActionButtonDefinitionInput;

export function OCounterActionButton({
  scene,
}: {
  scene: GQL.SceneDataFragment,
}) {
  const { preIncrementOCounterValue, set: setMediaItemState } = useMediaItemState()
  const oCounterIncremented = (scene.o_counter ?? 0) > preIncrementOCounterValue
  const [incrementOCount] = useSceneIncrementO(scene.id);
  const [removeOCountTime] = useSceneDecrementO(scene.id);
  const decrementOCount = () => {
    // o_history appears to already be sorted newest to oldest but we sort anyway to be sure that's always the case
    const latestOHistoryTime = scene.o_history?.toSorted().reverse()[0]
    if (latestOHistoryTime) {
      removeOCountTime({
        variables: {
          id: scene.id,
          times: [latestOHistoryTime],
        },
      })
    }
  }
  // If we've decremented the oCount below that of preIncrementOCounterValue then update preIncrementOCounterValue
  // so that the button only needs to be clicked twice before the side panel is shown again.
  if (typeof scene.o_counter === "number" && scene.o_counter < preIncrementOCounterValue) {
    setMediaItemState("preIncrementOCounterValue", scene.o_counter)
  }
  return <ActionButtonBase
    state={oCounterIncremented ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    data-testid="MediaSlide--oCounterButton"
    onClick={({toggleSidePanel}) => {
      if (oCounterIncremented) {
        toggleSidePanel()
      } else {
        incrementOCount()
      }
    }}
    sidePanel={
      <div className="action-button-o-counter">
        <button onClick={() => decrementOCount()} disabled={(scene.o_counter ?? 0) <= 0}>
          <FontAwesomeIcon icon={faMinus} />
        </button>
        {scene.o_counter ?? 0}
        <button onClick={() => incrementOCount()}>
          <FontAwesomeIcon icon={faPlus} />
        </button>
      </div>
    }
    sideInfo={(scene.o_counter ?? 0) > 0 && scene.o_counter}
  />
}
