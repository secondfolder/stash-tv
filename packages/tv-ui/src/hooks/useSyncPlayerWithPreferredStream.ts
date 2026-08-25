import React, { useEffect, useRef } from "react";
import { VideoJsPlayer } from "video.js";
import {
  switchSceneStream,
  DEFAULT_STREAM_LABEL,
  getBestMatchingVideoSource,
} from "../components/ScenePlayer/video.js/source-selector-access";
import { useTvConfig } from "../store/tvConfig";

export function useSyncPlayerWithPreferredStream({
  playerRef,
  enabled = true,
}: {
  playerRef: React.RefObject<VideoJsPlayer | null>;
  enabled?: boolean | (() => boolean);
}) {
  const preferredStreamLabel = useTvConfig(state => state.preferredStreamLabel);

  // We need to reference this when the source selection changes but we don't want
  // the current slide changing (and thus possibly applyPreferredOnChange changing) to
  // trigger a change to the player's source.
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (typeof enabledRef.current === "function" ? !enabledRef.current() : !enabledRef.current) return;

    // If the player is unloaded we don't need to do anything
    const player = playerRef.current;
    if (!player) return;

    // If we can't find the preferred stream in the current scene's streams leave it as is
    const targetStream = getBestMatchingVideoSource(preferredStreamLabel ?? DEFAULT_STREAM_LABEL, player);
    if (!targetStream) return;

    switchSceneStream(player, targetStream);
  }, [preferredStreamLabel]);
}
