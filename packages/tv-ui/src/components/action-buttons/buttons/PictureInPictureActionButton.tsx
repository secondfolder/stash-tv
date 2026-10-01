import React, { useRef } from "react"
import * as yup from "yup";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";
import { Pip, PipFill } from "react-bootstrap-icons";
import type { ActionButtonDefinitionInput } from "./index";
import cx from "classnames";
import { VideoJsPlayer } from "video.js";
import { isPictureInPictureSupported, togglePictureInPicture } from "../../../helpers/picture-in-picture";
import { usePictureInPictureActive } from "../../../hooks/usePictureInPicture";

const id = "picture-in-picture";

export const buttonDefinition = {
  id,
  title: {
    active: "Close picture-in-picture",
    inactive: "Open picture-in-picture",
  },
  icon: {
    active: PipFill,
    inactive: Pip,
  },
  components: {
    button: PictureInPictureActionButton,
  },
  configSchema: sharedActionButtonSchema.shape({
    buttonType: yup.string().oneOf([id]).required(),
  })
} as const satisfies ActionButtonDefinitionInput;

export function PictureInPictureActionButton({ playerRef }: { playerRef: React.RefObject<VideoJsPlayer | null> }) {
  const active = usePictureInPictureActive();
  const sidePanelOpenRef = useRef(false);
  if (!isPictureInPictureSupported()) return null

  return <ActionButtonBase
    state={active ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    onClick={async ({toggleSidePanel}) => {
      // Called synchronously so the click still counts as the user gesture PiP requires
      const succeeded = await togglePictureInPicture(playerRef.current)
      if (!succeeded && !sidePanelOpenRef.current) toggleSidePanel()
    }}
    onSidePanelToggle={(isOpen) => { sidePanelOpenRef.current = isOpen }}
    sidePanel={
      <div className="action-button-picture-in-picture">
        Couldn't open picture-in-picture. Play the video first, then try again.
      </div>
    }
  />
}
