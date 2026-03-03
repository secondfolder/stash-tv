import React, { useRef } from "react";
import { useTvConfig } from "../../../store/tvConfig";
import cx from "classnames";
import "./ActionButtonStack.css";
import useOverflowIndicators from "../../../hooks/useOverflowIndicators";
import { getLogger } from "@logtape/logtape";
import { MediaItem } from "../../../hooks/useMediaItems";
import { VideoJsPlayer } from "video.js";
import type { ActionButtonConfig } from "../buttons/index";
import { getActionButtonDefinition } from "../buttons";

const logger = getLogger(["stash-tv", "ActionButtonStack"]);

export type ActionButtonStackFolderConfig = {
  id: string;
  pinned: boolean;
  type: "folder",
  contents: ActionButtonConfig[];
}

export type ActionButtonStackConfig = ActionButtonConfig | ActionButtonStackFolderConfig

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
    actionButtonStackConfig,
  } = useTvConfig();

  const scene = mediaItem.entityType === "scene" ? mediaItem.entity : mediaItem.entity.scene;

  const stackElmRef = useRef<HTMLDivElement>(null);
  const stackScrollClasses = useOverflowIndicators(stackElmRef);

  function renderActionButton(buttonConfig: ActionButtonConfig) {
    const { buttonType } = buttonConfig;
    let buttonDef
    try {
      buttonDef = getActionButtonDefinition(buttonType);
    } catch (e) {
      logger.error(`Error getting button definition for action button config type ${buttonType}`, {buttonConfig, error: e})
      return <strong>?</strong>
    }
    return (
      <buttonDef.components.button
        key={buttonConfig.id}
        config={buttonConfig}
        scene={scene}
        mediaItem={mediaItem}
        playerRef={playerRef}
        sceneInfoOpen={sceneInfoOpen}
        setSceneInfoOpen={setSceneInfoOpen}
      />
    )
  }

  function renderActionButtonStackConfigItem(config: ActionButtonStackConfig) {
    if (config.type === "folder") {
      return (
        <div className="folder">
          {config.contents.map(c => renderActionButton(c))}
        </div>
      )
    }
    return renderActionButton(config)
  }

  return (
    <div
      className={cx("ActionButtonStack", {'active': uiVisible, 'left-handed': leftHandedUi})}
      data-testid="MediaSlide--toggleableUi"
    >
      <div className={cx("stack", ...stackScrollClasses)} ref={stackElmRef}>
        {actionButtonStackConfig
          .filter(config => !config.pinned)
          .map(config => <React.Fragment key={config.id}>
            {renderActionButtonStackConfigItem(config)}
          </React.Fragment>)
        }
      </div>
      <div className="pinned">
        {actionButtonStackConfig
          .filter(config => config.pinned)
          .map(config => <React.Fragment key={config.id}>
            {renderActionButtonStackConfigItem(config)}
          </React.Fragment>)
        }
      </div>
    </div>
  )
}
