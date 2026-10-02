import React from "react"
import * as yup from "yup";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";
import type { ActionButtonDefinitionInput } from "./index";
import cx from "classnames";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { useOCounter } from "../../../hooks/useOCounter";
import { OCounterControls, oCounterIcons } from "../../OCounterControls";

const id = "o-counter";

export const buttonDefinition = {
  id,
  title: {
    active: "Undo Orgasm Mark",
    inactive: "Mark Orgasm",
  },
  icon: oCounterIcons,
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
  const oCounter = useOCounter(scene)
  return <ActionButtonBase
    state={oCounter.incremented ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    data-testid="MediaSlide--oCounterButton"
    onClick={({toggleSidePanel}) => {
      if (oCounter.incremented) {
        toggleSidePanel()
      } else {
        oCounter.increment()
      }
    }}
    sidePanel={<OCounterControls oCounter={oCounter} />}
    sideInfo={oCounter.count > 0 && oCounter.count}
  />
}
