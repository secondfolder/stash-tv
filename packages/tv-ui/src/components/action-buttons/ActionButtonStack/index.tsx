import React, { useRef } from "react";
import { useAppStateStore } from "../../../store/appStateStore";
import cx from "classnames";
import "./ActionButtonStack.css";
import useOverflowIndicators from "../../../hooks/useOverflowIndicators";
import { getLogger } from "@logtape/logtape";
import { MediaItem } from "../../../hooks/useMediaItems";
import { VideoJsPlayer } from "video.js";
import type { ActionButtonConfig } from "../buttons/index";
import { allButtonDefinition } from "../buttons";

const logger = getLogger(["stash-tv", "ActionButtonStack"]);

export type Props = {
  mediaItem: MediaItem;
  sceneInfoOpen: boolean;
  setSceneInfoOpen: (open: boolean) => void;
  playerRef: React.RefObject<VideoJsPlayer>;
}

export function ActionButtonStack({mediaItem, sceneInfoOpen, setSceneInfoOpen, playerRef}: Props) {
  const {
    uiVisible,
    leftHandedUi,
    actionButtonsConfig,
  } = useAppStateStore();

  const scene = mediaItem.entityType === "scene" ? mediaItem.entity : mediaItem.entity.scene;

  const stackElmRef = useRef<HTMLDivElement>(null);
  const stackScrollClasses = useOverflowIndicators(stackElmRef);

  function renderActionButton(buttonConfig: ActionButtonConfig) {
    const { type: buttonType } = buttonConfig;
    const buttonDef = allButtonDefinition.find(def => def.id === buttonType);
    if (!buttonDef) {
      logger.error(`Unknown action button type: ${buttonType}`)
      return <strong>?</strong>
    }
    return (
      <buttonDef.components.button
        config={buttonConfig}
        scene={scene}
        mediaItem={mediaItem}
        playerRef={playerRef}
        sceneInfoOpen={sceneInfoOpen}
        setSceneInfoOpen={setSceneInfoOpen}
      />
    )
  }

  return (
    <div
      className={cx("ActionButtonStack", {'active': uiVisible, 'left-handed': leftHandedUi})}
      data-testid="MediaSlide--toggleableUi"
    >
      <div className={cx("stack", ...stackScrollClasses)} ref={stackElmRef}>
        {actionButtonsConfig
          .filter(config => !config.pinned)
          .map(config => <React.Fragment key={config.id}>
            {renderActionButton(config)}
          </React.Fragment>)
        }
      </div>
      <div className="pinned">
        {actionButtonsConfig
          .filter(config => config.pinned)
          .map(config => <React.Fragment key={config.id}>
            {renderActionButton(config)}
          </React.Fragment>)
        }
      </div>
    </div>
  )
}
