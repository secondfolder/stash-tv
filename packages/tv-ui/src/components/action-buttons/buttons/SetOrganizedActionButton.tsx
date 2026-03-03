import React from "react"
import * as yup from "yup";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";

import { actionButtonIcons } from "../icons";
import type { ActionButtonDefinitionInput } from "./index";
import { useSceneUpdate } from "../../../hooks/useSceneUpdate";
import { MediaItem } from "../../../hooks/useMediaItems";

const id = "set-organized";

export const buttonDefinition = {
  id,
  title: {
    active: "Mark as unorganized",
    inactive: "Mark as organized",
  },
  icon: actionButtonIcons["archive"].states,
  components: {
    button: SetOrganizedActionButton,
  },
  configSchema: sharedActionButtonSchema.shape({
    buttonType: yup.string().oneOf([id]).required(),
  }),
} as const satisfies ActionButtonDefinitionInput;

export function SetOrganizedActionButton({
  mediaItem,
}: {
  mediaItem: MediaItem
}) {
  if (mediaItem.entityType !== "scene") return null
  const scene = mediaItem.entity
  const [updateScene] = useSceneUpdate(scene);
  function setOrganized(newOrganized: boolean) {
    updateScene({
      variables: {
        input: {
          id: scene.id,
          organized: newOrganized,
        },
      },
    });
  }
  return (
    <ActionButtonBase
      state={scene.organized ? "active" : "inactive"}
      icon={buttonDefinition.icon}
      title={buttonDefinition.title}
      onClick={() => setOrganized(!scene.organized)}
    />
  )
}
