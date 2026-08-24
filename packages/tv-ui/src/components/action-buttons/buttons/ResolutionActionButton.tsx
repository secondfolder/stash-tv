import React from "react"
import * as yup from "yup";
import { useTvConfig } from "../../../store/tvConfig";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";

import ResolutionIcon from "../../../assets/resolution-outline.svg?react";
import type { ActionButtonDefinitionInput } from "./index";
import cx from "classnames";
import { VideoJsPlayer } from "video.js";
import { Button } from "react-bootstrap";
import {
  getStreamItemLabel,
  groupSceneStreamsByResolution,
  isDirectStream,
  selectSceneStream,
  type SceneStreamSource,
} from "../../ScenePlayer/video.js/source-selector-access";
import { useSceneStreamSelection } from "../../../hooks/useSceneStreamSelection";

const id = "resolution";

export const buttonDefinition = {
  id,
  title: {
    active: "Set stream resolution",
    inactive: "Set stream resolution",
  },
  icon: ResolutionIcon,
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
  const { set: setTvConfig } = useTvConfig();
  const { options, selected: selectedStream } = useSceneStreamSelection(playerRef);

  function handleSelectStream(source: SceneStreamSource) {
    const player = playerRef.current;
    if (!player) return;
    selectSceneStream(player, source);
    // The direct stream is the default source so no preference is needed for it. Storing
    // one would also stop scenes without that stream label from falling back to the
    // default, so non-direct selections only are kept.
    setTvConfig("preferredStreamLabel", isDirectStream(source) ? undefined : source.label);
  }

  const playingDirectStream = !selectedStream || isDirectStream(selectedStream);

  return (
    <ActionButtonBase
      state={playingDirectStream ? "inactive" : "active"}
      icon={buttonDefinition.icon}
      title={buttonDefinition.title}
      className={cx(buttonDefinition.id, "hide-on-ui-hide")}
      sidePanelClassName="action-button-resolution"
      sidePanel={<>
        {groupSceneStreamsByResolution(options).map(group => (
          <div key={group.id} className="stream-group">
            <div className="stream-group-label">{group.label}</div>
            <div className="stream-group-options">
              {group.sources.map(source => (
                <Button
                  key={source.src}
                  variant="link"
                  className={cx("current", {active: source === selectedStream})}
                  onClick={() => handleSelectStream(source)}
                >
                  {getStreamItemLabel(source)}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </>}
    />
  )
}
