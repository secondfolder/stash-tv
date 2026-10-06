import React, { ReactNode, useEffect, useRef, useState } from "react";
import { useTvConfig } from "../../../store/tvConfig";
import cx from "classnames";
import "./ActionButtonStack.css";
import useOverflowIndicators from "../../../hooks/useOverflowIndicators";
import { getLogger } from "@logtape/logtape";
import { MediaItem } from "../../../hooks/useMediaItems";
import { VideoJsPlayer } from "video.js";
import type { ActionButtonConfig } from "../buttons/index";
import { getActionButtonDefinition } from "../buttons";
import { ActionButtonFolderContext } from "../ActionButtonBase";
import { Overlay, Popover } from "react-bootstrap";
import { usePreventOverflowModifier } from "../../../hooks/usePreventOverflowModifier";
import { useOffscreenModifier } from "../../../hooks/useOffscreenModifier";
import { setMaxSizeModifier } from "../../../helpers/popper-modifiers/setMaxSize";
import { useMediaItemState } from "../../../store/mediaItemState";
import { ChevronRight } from "react-bootstrap-icons";
import { animateFolderIcons } from "./folderIconAnimation";
import { useUiVisible } from "../../../hooks/useUiVisible";

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
  onMediaItemDeleted?: () => void;
}

export function ActionButtonStack({mediaItem, sceneInfoOpen, setSceneInfoOpen, playerRef, onMediaItemDeleted}: Props) {
  const {
    leftHandedUi,
    actionButtonStackConfig,
  } = useTvConfig();
  const { shown: uiShown } = useUiVisible(mediaItem.id);

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
        onMediaItemDeleted={onMediaItemDeleted}
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
          uiShown={uiShown}
        />
      )
    }
    return renderActionButton(config)
  }

  return (
    <div
      className={cx("ActionButtonStack", {'active': uiShown, 'left-handed': leftHandedUi})}
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
  playerRef,
  uiShown,
}: {
  folderConfig: ActionButtonStackFolderConfig,
  renderActionButton: (buttonConfig: ActionButtonConfig) => ReactNode,
  playerRef: React.RefObject<VideoJsPlayer>,
  /** Whether the slide's UI is shown (`useUiVisible().shown`) */
  uiShown: boolean,
}): JSX.Element => {
  const { leftHandedUi } = useTvConfig();
  const preventOverflowModifier = usePreventOverflowModifier({
    boundary: playerRef.current?.el(),
  })
  const { openFolderId, set: setMediaItemState } = useMediaItemState()
  const id = `action-button-stack-folder-${folderConfig.id}`
  const isOpen = id === openFolderId
  const offscreenModifier = useOffscreenModifier({
    onOffscreen: () => setMediaItemState("openFolderId", "")
  })

  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const folderRef = useRef<HTMLElement | null>(null);
  const [_, setFolderRefSet] = useState(false) // We need to force a re-render when folderRef is set so useOverflowIndicators will pick it up
  const stackScrollClasses = useOverflowIndicators(folderRef);

  // Opening and closing the folder animates each button's icon between the preview and the open folder (see
  // animateFolderIcons). The open folder stays while its icons move back into the preview.
  const [closing, setClosing] = useState(false)
  const showOpenFolder = isOpen || closing
  // The open folder scrolls its contents, which would clip its icons while they move in from outside it
  const [iconsAnimating, setIconsAnimating] = useState(false)
  // Counts animations so that one that's been superseded (or outlived the folder) is ignored
  const latestAnimation = useRef(0)

  /** Resolves to whether the icons got there without being animated again on the way */
  async function animateIcons(movement: Parameters<typeof animateFolderIcons>[2]) {
    const openFolder = folderRef.current
    const preview = previewRef.current
    if (!openFolder || !preview) return true
    const animation = ++latestAnimation.current
    setIconsAnimating(true)
    await animateFolderIcons(openFolder, preview, movement)
    if (animation !== latestAnimation.current) return false
    setIconsAnimating(false)
    return true
  }

  useEffect(() => {
    if (showOpenFolder) return
    latestAnimation.current++
    setIconsAnimating(false)
  }, [showOpenFolder])
  useEffect(() => () => { latestAnimation.current++ }, [])

  async function close() {
    setMediaItemState("openFolderId", "")
    setClosing(true)
    if (await animateIcons({from: "current", to: "preview"})) setClosing(false)
  }

  function open() {
    setMediaItemState("openFolderId", id)
    if (closing) {
      // Still on screen, so it won't be positioned again: send the icons back from wherever they've got to
      setClosing(false)
      animateIcons({from: "current", to: "open"})
    }
  }

  function renderFolderButtons(iconOnly: boolean) {
    return folderConfig.contents.map(config => (
      <ActionButtonFolderContext.Provider key={config.id} value={{iconOnly, buttonId: config.id}}>
        {renderActionButton(config)}
      </ActionButtonFolderContext.Provider>
    ))
  }

  return <>
    <button
      className={cx("folder", "hide-on-ui-hide", {open: isOpen, "showing-open-folder": showOpenFolder})}
      aria-label={isOpen ? "Close folder" : "Open folder"}
      ref={buttonRef}
      onClick={isOpen ? close : open}
    >
      {/* Kept while the folder is open, unseen, for the icons to animate to and from */}
      <div className="folder-contents" ref={previewRef}>
        {renderFolderButtons(true)}
      </div>
      <ChevronRight className="hide-icon" aria-hidden />
    </button>
    <Overlay
      target={buttonRef}
      placement={leftHandedUi ? "right" : "left"}
      show={showOpenFolder}
      // The icons animate instead
      transition={false}
      popperConfig={{
        // The "ref" prop doesn't work, so get the element from Popper. Once Popper has positioned it, the icons can
        // move into it from the preview.
        onFirstUpdate: (state) => {
          folderRef.current = state.elements?.popper ?? null
          setFolderRefSet(true)
          animateIcons({from: "preview", to: "open"})
        },
        modifiers: [
          preventOverflowModifier,
          setMaxSizeModifier,
          offscreenModifier,
        ],
      }}
    >
      <Popover
        className={cx("folder-contents-popover", { 'left-handed': leftHandedUi, hide: !uiShown, 'icons-animating': iconsAnimating }, stackScrollClasses)}
        id={id}
      >
        {renderFolderButtons(false)}
      </Popover>
    </Overlay>
  </>
}
