import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { MediaItem } from "../../../hooks/useMediaItems";
import { useEffect, useMemo, useRef } from "react";
import videojs, { VideoJsPlayerOptions, type VideoJsPlayer } from "video.js";

const mediaItemPlayerCounter: Record<string, number> = {}
const beforeSetupHooks: Record<string, videojs.Hook.BeforeSetup[]> = {}
const setupHooks: Record<string, videojs.Hook.Setup[]> = {}

declare module "video.js" {
  interface VideoJsPlayer {
    mediaItem: MediaItem
    scene: GQL.SceneDataFragment;
  }
}

export function usePlayerManager({mediaItem}: {mediaItem: MediaItem}) {
  const mediaItemPlayerCount = useMemo(() => {
    const count = mediaItemPlayerCounter[mediaItem.id] ?? 0
    mediaItemPlayerCounter[mediaItem.id] = count + 1
    return count
  }, [])

  const playerId = `player-${mediaItem.id.replace(":", "-")}-${mediaItemPlayerCount}`

  beforeSetupHooks[playerId] = []
  setupHooks[playerId] = []

  const scene = mediaItem.entityType === "scene"
    ? mediaItem.entity
    : mediaItem.entity.scene

  function playerBeforeSetupHook(callback: videojs.Hook.BeforeSetup) {
    beforeSetupHooks[playerId].push(callback)
  }

  function playerSetupHook(callback: videojs.Hook.Setup) {
    setupHooks[playerId].push(callback)
  }

  function modifyPlayerSetupOptions(options: VideoJsPlayerOptions) {
    playerBeforeSetupHook(() => options)
  }

  modifyPlayerSetupOptions({
    id: playerId,
  })

  const playerRef = useRef<VideoJsPlayer | null>(null);
  playerSetupHook(player => {
    playerRef.current = player
    player.on('dispose', () => {
      playerRef.current = null
    });
  })

  const updateMediaItemInfo = (player: VideoJsPlayer) => {
    player.mediaItem = mediaItem
    player.scene = scene
  }
  playerSetupHook(updateMediaItemInfo)
  useEffect(() => {
    if (!playerRef.current) return
    updateMediaItemInfo(playerRef.current)
  }, [mediaItem, scene])

  const playerParentProps = {
    // Video.js's beforesetup and setup hooks run we need some way to map a newly created player by Stash's ScenePlayer back to a particular instance of our
    // ScenePlayer. The only way I can see to do that is by traversing up the DOM from the player's video element till we hit something to
    // that tells us what instance of tv's ScenePlayer it's a child of.
    'data-player-id': playerId
  }

  return {
    playerRef,
    playerBeforeSetupHook,
    playerSetupHook,
    modifyPlayerSetupOptions,
    playerId,
    playerParentProps
  }
}

// Merge in any option overrides set by this component
videojs.hook('beforesetup', function(videoEl, options) {
  let playerId
  try {
    playerId = getPlayerIdForVideoJsPlayer(videoEl);
  } catch (error) {
    // make this a logger
    console.error(error)
    return {};
  }
  for (const hook of beforeSetupHooks[playerId] || []) {
    const opts = hook(videoEl, videojs.mergeOptions(options));

    if (!isObject(opts) || Array.isArray(opts)) {
      console.error('please return an object in beforesetup hooks');
      return;
    }

    options = videojs.mergeOptions(options, opts);
  }
  return options
})

function isObject(value: unknown): value is object  {
  return !!value && typeof value === 'object';
}

videojs.hook('setup', function(player) {
  let playerId
  try {
    playerId = getPlayerIdForVideoJsPlayer(player.el());
  } catch (error) {
    // make this a logger
    console.error(error)
    return;
  }
  for (const hook of setupHooks[playerId] || []) {
    hook(player)
  }
})

export function getPlayerIdForVideoJsPlayer(videoElm: Element): string {
  let node: Element | null = videoElm;
  while (node !== null) {
    if (node instanceof HTMLElement && 'playerId' in node.dataset && node.dataset.playerId) {
      return node.dataset.playerId;
    }
    node = node.parentElement;
  }
  throw new Error("Could not find playerId for Video.js player");
}
