import React, { useState } from "react"
import * as yup from "yup";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";
import { actionButtonIcons } from "../icons";
import type { ActionButtonDefinition } from "./index";
import { DeleteScenesDialog } from "stash-ui/dist/src/components/Scenes/DeleteScenesDialog";
import { DeleteSceneMarkersDialog } from "stash-ui/dist/src/components/Scenes/DeleteSceneMarkersDialog";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { getLogger } from "@logtape/logtape";
import { MediaItem } from "../../../hooks/useMediaItems";

const logger = getLogger(["stash-tv", "DeleteMediaItemActionButton"])

const id = "delete-media-item";

export const buttonDefinition = {
  id,
  title: {
    active: "Delete scene/marker",
    inactive: "Delete scene/marker",
  },
  icon: actionButtonIcons["trash"].states,
  components: {
    button: DeleteMediaItemActionButton,
  },
  configSchema: sharedActionButtonSchema.shape({
    type: yup.string().oneOf([id]).required(),
  }),
} as const satisfies ActionButtonDefinition;

export function DeleteMediaItemActionButton({
    mediaItem
}: {
    mediaItem: MediaItem
}) {
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  const handleClick = () => {
    setShowDeleteConfirmation(true);
  }
  let renderDialog
  if (mediaItem.entityType === "scene") {
    renderDialog = () => (
      <DeleteScenesDialog
        selected={[mediaItem.entity as unknown as GQL.SlimSceneDataFragment]}
        onClose={() => setShowDeleteConfirmation(false)}
      />
    )
  } else if (mediaItem.entityType === "marker") {
    renderDialog = () => (
      <DeleteSceneMarkersDialog
        selected={[mediaItem.entity as unknown as GQL.SceneMarkerDataFragment]}
        onClose={() => setShowDeleteConfirmation(false)}
      />
    )
  } else {
    logger.error("DeleteMediaItemActionButton rendered for unsupported media item type", {mediaItem})
    return null
  }
  return <>
    {showDeleteConfirmation && renderDialog()}
    <ActionButtonBase
      state="inactive"
      icon={buttonDefinition.icon}
      title={buttonDefinition.title}
      onClick={handleClick}
    />
  </>
}
