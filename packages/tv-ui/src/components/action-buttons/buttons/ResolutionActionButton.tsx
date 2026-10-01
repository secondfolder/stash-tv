import React, { useEffect } from "react"
import * as yup from "yup";
import { useTvConfig } from "../../../store/tvConfig";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";

import ResolutionIcon from "../../../assets/resolution.svg?react";
import ResolutionOutlineIcon from "../../../assets/resolution-outline.svg?react";
import type { ActionButtonDefinitionInput } from "./index";
import cx from "classnames";
import { VideoJsPlayer } from "video.js";
import { Button } from "react-bootstrap";
import {
  groupVideoSourcesByResolution,
  isDirectStream,
  isPreferredStream,
  switchSceneStream,
  DEFAULT_STREAM_LABEL,
  getOriginalVideoDetails,
  VideoSource,
} from "../../ScenePlayer/video.js/source-selector-access";
import { useSceneStreamSelection } from "../../../hooks/useSceneStreamSelection";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faThumbtack,
} from "@fortawesome/free-solid-svg-icons";

const id = "resolution";

export const buttonDefinition = {
  id,
  title: {
    active: "Set stream resolution",
    inactive: "Set stream resolution",
  },
  icon: {
    active: ResolutionIcon,
    inactive: ResolutionOutlineIcon,
  },
  components: {
    button: ResolutionActionButton,
  },
  configSchema: sharedActionButtonSchema.shape({
    buttonType: yup.string().oneOf([id]).required(),
  }),
} as const satisfies ActionButtonDefinitionInput;

export function ResolutionActionButton({
  playerRef,
}: {
  playerRef: React.RefObject<VideoJsPlayer>,
}) {
  const { preferredStreamLabel, set: setTvConfig } = useTvConfig();

  const [currentlyChanging, setCurrentlyChanging] = React.useState(false);
  const currentlyChangingAllowenceTimer = React.useRef<NodeJS.Timeout | null>(null);

  const { selectedStream, availableStreams, preferredStream } = useSceneStreamSelection({
    playerRef,
  });

  useEffect(() => {
    setCurrentlyChanging(false)
  }, [selectedStream]);

  useEffect(() => {
    if (currentlyChangingAllowenceTimer.current) {
      clearTimeout(currentlyChangingAllowenceTimer.current);
    }
    currentlyChangingAllowenceTimer.current = setTimeout(() => {
      setCurrentlyChanging(false)
    }, 1000)
  }, [currentlyChanging])

  function handleStreamSelection(source: VideoSource) {
    setCurrentlyChanging(true);
    if (isPreferredStream(source, preferredStreamLabel)) {
      // The stream selected is already the preferred stream. However it's possible for the current video to
      // differ from the preferred stream. For example if the video was loaded previously slide when the preferred
      // stream was changed and then the user navigated back to that video. In that situation if the user wants to force
      // the current video to the preferred stream then modifying the preference won't help as it's value wouldn't
      // change so nothing would happen. Instead we directly modify the current video's stream.
      if (!playerRef.current) return
      switchSceneStream(playerRef.current, source);
    } else {
      // The direct stream is the default source so no preference is needed for it. Storing
      // one would also stop scenes without that stream label from falling back to the
      // default, so non-direct selections only are kept.
      setTvConfig("preferredStreamLabel", isDirectStream(source) ? undefined : source.fullStashLabel);
    }
  }

  const playingDirectStream = !selectedStream || isDirectStream(selectedStream);

  const mediaItem = playerRef.current?.mediaItem

  const renderComments = () => {
    if (currentlyChanging) return null

    if (!preferredStream) {
      return (
        <div className="comment muted">
          <FontAwesomeIcon icon={faThumbtack} />
          <strong>{preferredStreamLabel ?? DEFAULT_STREAM_LABEL}</strong>
        </div>
      )
    }
    return null
  };

  return (
    <ActionButtonBase
      state={playingDirectStream ? "inactive" : "active"}
      icon={buttonDefinition.icon}
      title={buttonDefinition.title}
      className={cx(buttonDefinition.id, "hide-on-ui-hide")}
      sidePanelClassName="action-button-resolution"
      sidePanel={<>
        {groupVideoSourcesByResolution(availableStreams).map(sources => {
          const firstSource = sources[0];
          if (!firstSource) return null

          const { resolutionName, resolutionNumericalName } = firstSource;
          // Some resolutions like `4K` have the same resolutionName and resolutionNumericalName so not point in showing both.
          const additionalResolutionName = resolutionNumericalName && (resolutionNumericalName !== resolutionName)
            ? resolutionNumericalName
            : undefined;

            return (
              <div key={firstSource.resolutionName} className="stream-group">
              <div className="stream-group-label">
                {firstSource.resolutionName}
                {" "}
                {additionalResolutionName && (
                  <span className="resolution-name-additional">{additionalResolutionName}</span>
                )}
              </div>
              <div className="stream-group-options">
                {sources.map(source => {
                  const formatTitle = isDirectStream(source) && mediaItem
                    ? `Direct ${getOriginalVideoDetails(mediaItem)?.fileExtension?.toLocaleUpperCase()}`
                    : source.format;

                  return (
                    <Button
                      key={source.src}
                      variant={source.fullStashLabel === selectedStream?.fullStashLabel ? "primary" : "link"}
                      onClick={() => handleStreamSelection(source)}
                    >
                      {isPreferredStream(source, preferredStreamLabel) && (
                        <FontAwesomeIcon icon={faThumbtack} />
                      )}
                      {formatTitle}
                    </Button>
                  )
                })}
              </div>
            </div>
          )
        })}
        {renderComments()}
      </>}
    />
  )
}
