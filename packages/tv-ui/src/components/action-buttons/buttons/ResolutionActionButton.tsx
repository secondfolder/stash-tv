import React, { useCallback, useEffect, useState } from "react"
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
  getSceneStreamOptions,
  getSelectedSceneStream,
  getShortStreamLabel,
  getStreamItemLabel,
  groupSceneStreamsByResolution,
  isDirectStream,
  selectSceneStream,
  type SceneStreamSource,
} from "../../ScenePlayer/video.js/source-selector-access";

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
  const [selection, setSelection] = useState<{
    options: SceneStreamSource[],
    selected: SceneStreamSource | null,
  }>({ options: [], selected: null });

  const refreshSelection = useCallback(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed()) return;
    setSelection({
      options: getSceneStreamOptions(player),
      selected: getSelectedSceneStream(player),
    });
  }, [playerRef]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    // "loadstart" fires whenever the player loads a source, covering switches made by
    // this button, by the source selector's error fallback, and new scenes
    refreshSelection();
    player.on("loadstart", refreshSelection);
    return () => player.off("loadstart", refreshSelection);
  }, [playerRef.current, refreshSelection]);

  function handleSelectStream(source: SceneStreamSource) {
    const player = playerRef.current;
    if (!player) return;
    selectSceneStream(player, source);
    // The direct stream is the default source so no preference is needed for it. Storing
    // one would also stop scenes without that stream label from falling back to the
    // default, so non-direct selections only are kept.
    setTvConfig("preferredStreamLabel", isDirectStream(source) ? undefined : source.label);
  }

  const selectedStream = selection.selected;
  const playingDirectStream = !selectedStream || isDirectStream(selectedStream);

  return (
    <ActionButtonBase
      state={playingDirectStream ? "inactive" : "active"}
      icon={buttonDefinition.icon}
      title={buttonDefinition.title}
      className={cx(buttonDefinition.id, "hide-on-ui-hide")}
      sideInfo={selectedStream && !playingDirectStream ? getShortStreamLabel(selectedStream) : undefined}
      sidePanelClassName="action-button-resolution"
      sidePanel={<>
        {groupSceneStreamsByResolution(selection.options).map(group => (
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
