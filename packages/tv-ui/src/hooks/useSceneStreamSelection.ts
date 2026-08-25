import React, { useEffect, useMemo, useState } from "react";
import { VideoJsPlayer } from "video.js";
import {
  getDisplayableVideoSources,
  getSelectedVideoSource,
  isPreferredStream,
  type VideoSource,
} from "../components/ScenePlayer/video.js/source-selector-access";
import { useTvConfig } from "../store/tvConfig";

/**
 * Tracks the source selector plugin's stream selection for the given player.
 *
 * "loadstart" fires whenever the player loads a source, which is the only signal
 * covering every way the selection can change: manual selection via the plugin,
 * its error fallback, and new scenes.
 */
export function useSceneStreamSelection({
  playerRef,
}: {
  playerRef: React.RefObject<VideoJsPlayer | null>;
}) {
  const preferredStreamLabel = useTvConfig(state => state.preferredStreamLabel);

  const [availableStreams, setAvailableStreams] = useState<VideoSource[]>(playerRef.current ? getDisplayableVideoSources(playerRef.current) : []);
  const [selectedStream, setSelectedStream] = useState<VideoSource | null>(playerRef.current ? getSelectedVideoSource(playerRef.current) : null);

  // Update availableStreams & selectedStream if the player changes them
  useEffect(() => {
    const refreshSelection = () => {
      const player = playerRef.current;
      if (!player) return;
      setAvailableStreams(getDisplayableVideoSources(player));
      setSelectedStream(getSelectedVideoSource(player));
    };

    const player = playerRef.current;
    if (!player) return;

    refreshSelection();
    player.on("loadstart", refreshSelection);
    return () => player.off("loadstart", refreshSelection);
  }, [playerRef.current]);

  const selectedIsPreferred = useMemo<boolean>(
    () => selectedStream ? isPreferredStream(selectedStream, preferredStreamLabel) : false,
    [selectedStream, preferredStreamLabel]
  );

  const preferredStream = useMemo<VideoSource | null>(() => {
    return availableStreams.find(stream => isPreferredStream(stream, preferredStreamLabel)) ?? null;
  }, [availableStreams, preferredStreamLabel]);

  return {
    availableStreams,
    selectedStream,
    preferredStream,
    selectedIsPreferred,
  };
}
