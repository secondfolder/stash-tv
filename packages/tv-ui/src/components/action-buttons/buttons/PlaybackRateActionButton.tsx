import React, { useEffect, useMemo, useState } from "react"
import * as yup from "yup";
import { useTvConfig } from "../../../store/tvConfig";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";

import { FastForward, FastForwardFill } from "react-bootstrap-icons";
import type { ActionButtonDefinitionInput } from "./index";
import cx from "classnames";
import { VideoJsPlayer } from "video.js";
import { Button } from "react-bootstrap";

const id = "playback-rate";

export const buttonDefinition = {
  id,
  title: {
    active: "Set playback rate",
    inactive: "Set playback rate",
  },
  icon: {
    active: FastForwardFill,
    inactive: FastForward,
  },
  components: {
    button: PlaybackRateActionButton,
  },
  configSchema: sharedActionButtonSchema.shape({
    buttonType: yup.string().oneOf([id]).required(),
  }),
} as const satisfies ActionButtonDefinitionInput;

export function PlaybackRateActionButton({
  playerRef,
}: {
  playerRef: React.RefObject<VideoJsPlayer>,
}) {
  const {playbackRate: desiredPlaybackRate} = useTvConfig();
  const [playbackRate, setPlaybackRate] = useState(desiredPlaybackRate);
  const active = useMemo(() => playbackRate !== 1, [playbackRate])
  useEffect(() => {
    if (!playerRef.current) return
    playerRef.current.on("ratechange", () => {
      const currentRate = playerRef.current?.playbackRate();
      if (currentRate !== undefined) setPlaybackRate(currentRate);
    });
  }, [playerRef.current, setPlaybackRate])
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2, 4, 8];
  return (
    <ActionButtonBase
      state={active ? "active" : "inactive"}
      icon={buttonDefinition.icon}
      title={buttonDefinition.title}
      className={cx(buttonDefinition.id, "hide-on-ui-hide")}
      sidePanel={<>
        {speeds.map(speed => (
          <Button
            key={speed}
            variant="link"
            className={cx("current", {active: playbackRate === speed})}
            onClick={() => playerRef.current?.playbackRate(speed)}
          >
            {speed}x
          </Button>
        ))}
      </>}
    />
  )
}
