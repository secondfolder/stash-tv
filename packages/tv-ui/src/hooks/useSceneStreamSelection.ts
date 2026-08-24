import React, { useEffect, useState } from "react";
import { VideoJsPlayer } from "video.js";
import {
  getSceneStreamOptions,
  getSelectedSceneStream,
  type SceneStreamSource,
} from "../components/ScenePlayer/video.js/source-selector-access";

export type SceneStreamSelection = {
  /** The streams available for the player's current scene. */
  options: SceneStreamSource[];
  /** The stream currently loaded in the player, or null before sources have been set. */
  selected: SceneStreamSource | null;
};

/**
 * Tracks the source selector plugin's stream selection for the given player.
 *
 * "loadstart" fires whenever the player loads a source, which is the only signal
 * covering every way the selection can change: manual selection via the plugin,
 * its error fallback, and new scenes.
 */
export function useSceneStreamSelection(
  playerRef: React.RefObject<VideoJsPlayer | null>
): SceneStreamSelection {
  const [selection, setSelection] = useState<SceneStreamSelection>({
    options: [],
    selected: null,
  });

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const refreshSelection = () => {
      if (player.isDisposed()) return;
      setSelection({
        options: getSceneStreamOptions(player),
        selected: getSelectedSceneStream(player),
      });
    };

    refreshSelection();
    player.on("loadstart", refreshSelection);
    return () => player.off("loadstart", refreshSelection);
  }, [playerRef.current]);

  return selection;
}
