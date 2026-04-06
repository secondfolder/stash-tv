import React, { ReactNode, useRef, useState } from "react";
import { useTvConfig } from "../../../store/tvConfig";
import cx from "classnames";
import "./ActionButtonStack.css";
import useOverflowIndicators from "../../../hooks/useOverflowIndicators";
import { getLogger } from "@logtape/logtape";
import { MediaItem } from "../../../hooks/useMediaItems";
import { VideoJsPlayer } from "video.js";
import type { ActionButtonConfig } from "../buttons/index";
import { getActionButtonDefinition } from "../buttons";
import { ActionButtonIcon } from "../ActionButtonBase";
import { Overlay, Popover } from "react-bootstrap";
import { usePreventOverflowModifier } from "../../../hooks/usePreventOverflowModifier";
import { useOffscreenModifier } from "../../../hooks/useOffscreenModifier";
import { setMaxSizeModifier } from "../../../helpers/popper-modifiers/setMaxSize";
import { useMediaItemState } from "../../../store/mediaItemState";
import { ChevronRight } from "react-bootstrap-icons";

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
        <Folder
          folderConfig={config}
          renderActionButton={renderActionButton}
          playerRef={playerRef}
        />
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

const Folder = ({
  folderConfig,
  renderActionButton,
  playerRef
}: {
  folderConfig: ActionButtonStackFolderConfig,
  renderActionButton: (buttonConfig: ActionButtonConfig) => ReactNode,
  playerRef: React.RefObject<VideoJsPlayer>,
}): JSX.Element => {
  const { leftHandedUi, uiVisible } = useTvConfig();
  const preventOverflowModifier = usePreventOverflowModifier({
    boundary: playerRef.current?.el(),
  })
  const { openFolderId, set: setMediaItemState } = useMediaItemState()
  const id = `action-button-stack-folder-${folderConfig.id}`
  const isOpen = id === openFolderId
  const offscreenModifier = useOffscreenModifier({
    onOffscreen: () => setMediaItemState("openFolderId", "")
  })
  const first4buttons = folderConfig.contents.slice(0,4)

  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const folderRef = useRef<HTMLElement | null>(null);
  const [_, setFolderRefSet] = useState(false) // We need to force a re-render when folderRef is set so useOverflowIndicators will pick it up
  const stackScrollClasses = useOverflowIndicators(folderRef);

  return <>
    <button
      className="folder hide-on-ui-hide"
      ref={buttonRef}
      onClick={() => {
        if (!isOpen) {
          setMediaItemState("openFolderId", id)
        } else {
          setMediaItemState("openFolderId", "")
        }
      }}
    >
      {!isOpen && (
        <div className="folder-contents">
          {first4buttons.map(config => {
            const def = getActionButtonDefinition(config.buttonType)
            return (
              <ActionButtonIcon
                iconDefinition={def.icon}
                state="inactive"
                config={def}
                key={config.id}
              />
            )
          })}
        </div>
      )}
      {isOpen && <ChevronRight className="hide-icon" />}
    </button>
    <Overlay
      target={buttonRef}
      placement={leftHandedUi ? "right" : "left"}
      show={isOpen}
      // The "ref" prop doesn't work so we use "onEntering" to capture the dom elm
      onEntering={(elm) => {
        setFolderRefSet(true);
        folderRef.current = elm
      }}
      popperConfig={{
        modifiers: [
          preventOverflowModifier,
          setMaxSizeModifier,
          offscreenModifier,
        ],
      }}
    >
      <Popover
        className={cx("folder-contents-popover", { 'left-handed': leftHandedUi, hide: !uiVisible }, stackScrollClasses)}
        id={id}
      >
        {folderConfig.contents.map(config => renderActionButton(config))}
      </Popover>
    </Overlay>
  </>
}
