
import cx from "classnames";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./MediaSlide.scss";
import ScenePlayer from "../../ScenePlayer";
import { type VideoJsPlayer } from "video.js";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { useTvConfig } from "../../../store/tvConfig";
import CrtEffect from "../../CrtEffect";
import { defaultMarkerLength, MediaItem, MediaItemRef } from "../../../hooks/useMediaItems";
import { useLiveMediaItem } from "../../../hooks/useLiveMediaItem";
import { useUiVisible } from "../../../hooks/useUiVisible";
import { useRatingShortcuts } from "../../../hooks/rating/useRatingShortcuts";
import { getSceneStreamsKey } from '../../../helpers/getSceneStreamsKey';
import { createPortal } from "react-dom";
import { useGetterRef } from "../../../hooks/useGetterRef";
import videojs from "video.js";
import {styledBigPlayButton} from "./video-js-plugins/styled-big-play-button";
import "./video-js-plugins/styled-big-play-button.css";
import { type ScrollToIndexOptions } from "../../VideoScroller";
import { ActionButtonStack } from "../../action-buttons/ActionButtonStack";
import SceneInfo from "../SceneInfo";
import { getLogger } from "@logtape/logtape";
import {Options as AbLoopPluginOptions} from "videojs-abloop";
import ClipTimestamp from "../ClipTimestamp";
import { roundTo } from "../../../helpers";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGamepad } from "@fortawesome/free-solid-svg-icons";
import { useGamepadStatus } from "../../../hooks/useGamepadStatus";
import { useSeeking } from "../../../hooks/useSeeking";
import { useGestureControls } from "../../../hooks/useGestureControls";
import { useShortcutSeeking } from "../../../hooks/useShortcutSeeking";
import { onShortcut } from "../../../helpers/shortcut-actions/input";
import type { ShortcutActionId } from "../../../helpers/shortcut-actions/actions";
import { objectKeys } from "ts-extras";
import { useConfigurationContext } from "stash-ui/dist/src/hooks/Config";
import { useFirstMountState } from "react-use";
import { MediaItemStateContextProvider } from "../../../store/mediaItemState";
import { useDeleteMediaItemDialog } from "../../../hooks/useDeleteMediaItemDialog";
import { useGlobalState } from "../../../store/globalState";
import { useCurrentOpenPopover } from "../../PopoverPanel";
import { useMediaItemTags } from "../../../hooks/useMediaItemTags";
import { EditTagsContents } from "../../EditTagsContents";
import { Modal } from "../../containers/Modal";
import { useSceneStreamSelection } from "../../../hooks/useSceneStreamSelection";
import { useSyncPlayerWithPreferredStream } from "../../../hooks/useSyncPlayerWithPreferredStream";
import { useFollowPictureInPicture } from "../../../hooks/usePictureInPicture";
import { isPictureInPictureSupported, togglePictureInPicture } from "../../../helpers/picture-in-picture";
import {
  isDirectStream,
  ORIGINAL_RESOLUTION_LABEL,
} from "../../ScenePlayer/video.js/source-selector-access";

videojs.registerPlugin('styledBigPlayButton', styledBigPlayButton);

// Max length of video for which we disable scroll animation when seeking to next/previous video
const noAnimateDurationThreshold = 30;

export interface MediaSlideContentProps {
  mediaItem: MediaItem;
  changeItemHandler: ((newIndex: number | ((currentIndex: number) => number), scrollOptions?: ScrollToIndexOptions) => void);
  removeMediaItem: (id: string) => void;
  isCurrentVideo: boolean;
  currentIndex: number;
  index: number;
  style?: React.CSSProperties | undefined;
  className?: string;
  currentlyScrolling?: boolean;
}

const mountCount = new Map<string, number>();

/** A slide for the given item's data. Use the default export (MediaSlide) to show a feed entry with live data. */
export const MediaSlideContent: React.FC<MediaSlideContentProps> = (props) => {
  const { isCurrentVideo } = props;
  const {
    letterboxing,
    forceLandscape,
    volume,
    playbackRate,
    looping,
    showSubtitles,
    crtEffect,
    crtEffectStrength,
    scenePreviewOnly,
    markerPreviewOnly,
    showDevOptions,
    showDebuggingInfo,
    autoPlay: globalAutoPlay,
    startPosition,
    endPosition,
    playLength,
    minPlayLength,
    maxPlayLength,
    showGuideOverlay,
    leftHandedUi,
    set: setTvConfig,
  } = useTvConfig();
  const { shown: uiShown, uiIdle } = useUiVisible(props.mediaItem.id);

  const mediaSlideElementRef = useRef<HTMLDivElement>(null)

  const { configuration: stashConfig } = useConfigurationContext()
  const { connectedAt: gamepadConnectedAt } = useGamepadStatus();
  const gamepadConnectedAWhileAgo = (Date.now() - (gamepadConnectedAt ?? 0)) > 6000

  const logger = getLogger(["stash-tv", "MediaSlide", props.mediaItem.id]);

  useMemo(() => {
    if (!showDebuggingInfo.includes("render-debugging")) return
    const timesMounted = mountCount.get(props.mediaItem.id) || 0;
    console.log(`🔜 MediaSlide (media id ${props.mediaItem.id}) mounting${timesMounted ? ` (count: ${timesMounted})` : ""}`)
    mountCount.set(props.mediaItem.id, timesMounted + 1);
  }, [])
  useEffect(() => () => { showDebuggingInfo.includes("render-debugging") && console.log(`🔚 MediaSlide (media id ${props.mediaItem.id}) unmounting`) }, [])

  useEffect(() => {
    if (isCurrentVideo) logger.info(`Current video set to ${props.mediaItem.id} {*}`, { mediaItem: props.mediaItem });
  }, [isCurrentVideo, props.mediaItem.id])

  const scene = props.mediaItem.entityType === "scene" ? props.mediaItem.entity : props.mediaItem.entity.scene;

  // Keys ScenePlayer (below) so it remounts only when the streams really change. A plain hash of sceneStreams isn't
  // enough: Stash's save-activity mutation (sent every 10s of playback and on pause) evicts all cached findScenes
  // results, so the feed query refetches, and Stash versions that sign stream URLs (stashapp/stash#6529) return
  // a new expires/signature for every stream each time. That remounted the player and restarted playback.
  const sceneStreamsKey = useMemo(() => getSceneStreamsKey(scene.sceneStreams), [scene.sceneStreams]);

  const getMediaItemDuration = () => props.mediaItem.entityType === "marker" ? props.mediaItem.entity.duration : props.mediaItem.entity.files[0]?.duration;

  // Stash itself has a "maximum loop duration" setting: videos shorter than it auto-loop regardless of our own
  // loop toggle. Respect that alongside our own setting whenever it's set to something other than 0 (disabled).
  const maximumLoopDuration = stashConfig?.interface.maximumLoopDuration ?? 0;
  const mediaItemDuration = getMediaItemDuration();
  const stashAutoLoop = maximumLoopDuration > 0 && !!mediaItemDuration && mediaItemDuration < maximumLoopDuration;
  const effectiveLooping = looping || stashAutoLoop;

  // Don't return player if it's disposed
  const videojsPlayerRef = useGetterRef<VideoJsPlayer | null>(
    (player) => player?.isDisposed() ? null : player,
    null,
    []
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Even if we don't use metadataLoaded state setting it means we can make sure a render occurs right after the player has
  // a duration which is important for certain elements that use the duration when rendering like the end timestamp
  // indicator
  const [metadataLoaded, setMetadataLoaded] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);

  const [loadingDeferred, setLoadingDeferred] = useState(props.currentlyScrolling);
  useEffect(() => {
    if (loadingDeferred) {
      setLoadingDeferred(props.currentlyScrolling);
    }
  }, [loadingDeferred, props.currentlyScrolling]);

  // Currently hardcoded but could be made configurable later
  const autoplay = globalAutoPlay && isCurrentVideo && !showGuideOverlay;

  function handleVideojsPlayerCreated(player: VideoJsPlayer) {
    videojsPlayerRef.current = player;

    const getPlayerVolume = () => videojsPlayerRef.current?.muted() ? 0 : videojsPlayerRef.current?.volume() || 0;
    player.on("volumechange", () => {
      logger.info(`Video.js player volumechange event - player volume is ${getPlayerVolume() * 100}%`);
      setTvConfig("volume", getPlayerVolume());
    });
    // Should ideally not be used since we set the video volume to `volume` on player creation but if for some reason
    // the player doesn't get set correctly it's better to update our volume setting so the UI shows the actual player
    // volume not what we want it to be but isn't.
    if (volume !== getPlayerVolume()) {
      logger.info(`Video.js player loaded - player volume is ${getPlayerVolume() * 100}%`);
      setTvConfig("volume", getPlayerVolume());
    }

    player.on("ratechange", () => {
      // The speed of a gesture's or arrow key's seek is only temporary, not the user's chosen playback rate
      if (seeking.isSeeking()) return;
      logger.info(`Video.js player ratechange event - player playback rate is ${player.playbackRate()}`);
      setTvConfig("playbackRate", player.playbackRate());
    });

    // We resort to `any` here because the types for videojs are incomplete
    ;(player.getChild('ControlBar') as any)?.progressControl?.el().addEventListener('pointermove', (event: MouseEvent) => {
      // Stop event propagation so pointermove event doesn't make it to window and trigger a sidebar drag when we're
      // trying to seek
      event.stopPropagation();
    });

    updatePlayableClass()
    player.one('loadedmetadata', () => {
      setMetadataLoaded(true);
    });
    setPlayerReady(true);
  }

  // To avoid accidentally calling next several times we track if there's already a pending change
  const currentMediaItemPendingChangeRef = useRef<"next" | "previous">();
  useEffect(() => {
    currentMediaItemPendingChangeRef.current = undefined;
  }, [isCurrentVideo]);

  const goToItem = useCallback((direction: 'next' | 'previous') => {
    if (!isCurrentVideo || currentMediaItemPendingChangeRef.current === direction) return;
    currentMediaItemPendingChangeRef.current = direction;
    const played = videojsPlayerRef.current?.played()
    let totalPlayedLength = 0;
    if (played) {
      for (let i = 0; i < (played.length || 0); i++) {
        totalPlayedLength += played.end(i) - played.start(i);
      }
    }

    logger.debug(`Going to ${direction} item from index ${props.index} {*}`, {totalPlayedLength, noAnimateDurationThreshold, isCurrentVideo});

    const shouldSkipAnimation = totalPlayedLength < noAnimateDurationThreshold
    props.changeItemHandler(
      (currentIndex) => Math.max(currentIndex + (direction === 'next' ? 1 : -1), 0),
      { ...(shouldSkipAnimation ? { behavior: 'instant' } : {}) }
    );
  }, [noAnimateDurationThreshold, props.changeItemHandler, props.index, isCurrentVideo]);

  useFollowPictureInPicture({ playerRef: videojsPlayerRef, isCurrentVideo, playerReady, goToItem });

  useEffect(() => {
    if (!isCurrentVideo || !videojsPlayerRef.current) return;
    window.videojs = videojs as unknown as typeof window.videojs
    window.tvCurrentPlayer = showDevOptions ? videojsPlayerRef.current : undefined;
    window.tvAllPlayers = showDevOptions ? videojs.getAllPlayers() : undefined;
    window.tvCurrentMediaItem = showDevOptions ? props.mediaItem : undefined;
  }, [isCurrentVideo, showDevOptions, playerReady, props.mediaItem])

  // If duration changes (such as when scenePreviewOnly is toggled) we manually update the player since the
  // progress bar doesn't seem to update otherwise
  const firstDurationChangeRef = useRef(true);
  useEffect(() => {
    if (!videojsPlayerRef.current) return;
    if (firstDurationChangeRef.current) {
      firstDurationChangeRef.current = false;
      return
    }
    videojsPlayerRef.current?.duration(getMediaItemDuration()); // Force update of duration
  }, [getMediaItemDuration()])

  useEffect(() => {
    if (!effectiveLooping || props.mediaItem.entityType !== "marker" || !videojsPlayerRef.current) return;
    // videojs-offset doesn't seem to respect loop so we have to manually restart video after it's ended
    // when loop is true
    const handleEnded = () => {
      videojsPlayerRef.current?.one('loadstart', () => {
        videojsPlayerRef.current?.play();
      });
      seeking.seek(null)
    }
    videojsPlayerRef.current?.on('ended', handleEnded);
    return () => { videojsPlayerRef.current?.off('ended', handleEnded) };
  }, [effectiveLooping])

  /* ------------------------------- Play/pause ------------------------------- */

  const isFirstMount = useFirstMountState()
  useEffect(() => {
    // Play/pause the video based only on viewport
    if (!videojsPlayerRef.current) return;
    if (isCurrentVideo) {
      if (!autoplay) return;
      videojsPlayerRef.current?.play();
    } else if (!isFirstMount) {
      const player = videojsPlayerRef.current;
      player.pause();
      if (!player.isInPictureInPicture()) {
        player.cancelLoading?.();
        return;
      }
      // Unloading clears the video's source which would close picture-in-picture before it's moved to the new current
      // video, so wait till it has been
      const cancelLoading = () => player.cancelLoading?.();
      player.one("leavepictureinpicture", cancelLoading);
      return () => {
        if (!player.isDisposed()) player.off("leavepictureinpicture", cancelLoading);
      };
    }
  }, [isCurrentVideo, autoplay]);

  const initialTimestamp = useMemo(() => {
    if (props.mediaItem.entityType === "marker" || startPosition === 'beginning') {
      return 0
    } else if (startPosition === 'random') {
      return getRandomPointInScene(scene)
    }
    return props.mediaItem.entity.resume_time ?? undefined;
  }, [props.mediaItem.entityType === "marker" || startPosition, getMediaItemDuration()]);

  const endTimestamp = useMemo(() => {
    if (props.mediaItem.entityType === "marker" || (props.mediaItem.entityType === "scene" && scenePreviewOnly)) return undefined;
    const duration = props.mediaItem.entity.files[0]?.duration;
    const lengthRemaining = duration - (initialTimestamp ?? 0);
    if (endPosition === 'fixed-length') {
      return Math.min(
        (initialTimestamp || 0) + (playLength ?? Infinity),
        duration
      )
    } else if (endPosition === 'random-length') {
      const effectiveMinPlayLength = Math.min(
        minPlayLength ?? 1,
        lengthRemaining
      );
      const effectiveMaxPlayLength = Math.max(
        effectiveMinPlayLength,
        Math.min(
          maxPlayLength ?? Infinity,
          lengthRemaining
        )
      );

      return (initialTimestamp || 0) + Math.floor(Math.random() * (effectiveMaxPlayLength - effectiveMinPlayLength + 1)) + effectiveMinPlayLength
    } else if (endPosition === 'video-end') {
      return effectiveLooping ? duration : undefined;
    } else {
      endPosition satisfies never
      return undefined;
    }
  }, [endPosition, initialTimestamp, minPlayLength, maxPlayLength, playLength, getMediaItemDuration(), scenePreviewOnly, effectiveLooping]);

  useEffect(() => {
    logger.info(`Initial timestamp: ${initialTimestamp}, End timestamp: ${endTimestamp}`, {initialTimestamp, endTimestamp})
  }, [initialTimestamp, endTimestamp])

  useEffect(() => {
    if (!showGuideOverlay) return;
    videojsPlayerRef.current?.pause();
  }, [showGuideOverlay]);

  const getSkipTime = useCallback((direction: 'forwards' | 'backwards') => {
    const duration = videojsPlayerRef.current?.duration();
    const currentTime = videojsPlayerRef.current?.currentTime();
    if (!duration || currentTime === undefined) {
      return null
    }

    const segmentDuration = stashConfig?.general.previewSegmentDuration ?? 0.75
    const segmentCount = stashConfig?.general.previewSegments ?? 12

    if (props.mediaItem.entityType === "scene" && scenePreviewOnly && duration >= (segmentDuration * segmentCount)) {
      // Videos with a duration less than segmentDuration * segmentCount will have one segment
      // https://github.com/stashapp/stash/blob/717f968a2c544a3f0c0f0be0b30e45cd0da58f10/pkg/scene/generate/preview.go#L95
      const previewSegmentLength = duration / segmentCount
      const newTime = (Math.floor(currentTime / previewSegmentLength) * previewSegmentLength)
        + (previewSegmentLength * (direction === "forwards" ? 1 : -1))
      const skipTime = Math.abs(newTime - currentTime)
      return skipTime
    }

    let skipPercent
    if (duration > 1 * 60 * 60) {
        skipPercent = 0.05
    } else if (duration > 10 * 60) {
        skipPercent = 0.10
    } else if (duration > 1 * 60) {
        skipPercent = 0.20
    } else {
        skipPercent = 0.33
    }

    let skipTimeAmount = duration * skipPercent
    const newCurrentTime = currentTime + (direction === 'forwards' ? skipTimeAmount : -skipTimeAmount)
    // We make the range to look for the next marker a bit larger than the skip amount to avoid
    // skipping to a point just a moment before the marker because the marker was very slightly outside the
    // search range.
    //
    // We also add a small buffer when searching backwards to avoid the case where we've played a tiny bit so we don't
    // just jump back to the the same marker again.
    const markerSearchStartTime = direction === 'forwards' ? currentTime : newCurrentTime - (skipTimeAmount * 0.5)
    const markerSearchEndTime = direction === 'forwards' ? newCurrentTime + (skipTimeAmount * 0.5) : currentTime - 2
    // Check for markers in the skip range
    const markersToSearch = direction === 'forwards' ? scene.scene_markers : scene.scene_markers.slice().reverse()
    const marker = markersToSearch.find(marker =>
      marker.seconds >= markerSearchStartTime &&
      marker.seconds <= markerSearchEndTime
    );
    if (marker) {
      logger.debug(`Skipping to marker ${marker.title ?? marker.primary_tag.name} at ${marker.seconds}s{*}`, {marker, markersToSearch});
      skipTimeAmount = Math.abs(marker.seconds - currentTime)
    }
    return skipTimeAmount
  }, [scene.scene_markers]);

  const seekForwards = useCallback(() => {
    if (!videojsPlayerRef.current) return null;
    const duration = videojsPlayerRef.current?.duration();
    if (duration === undefined) return;
    const skipAmount = getSkipTime('forwards');
    if (skipAmount === null || typeof duration !== 'number') {
      return null
    }
    const currentTime = videojsPlayerRef.current?.currentTime();
    let nextSkipAheadTime = currentTime + skipAmount
    logger.info("Seeking forwards{*}", {skipAmount, duration, nextSkipAheadTime})
    if (
      // Go to next item if the next jump goes to or past the end of the entire video
      (nextSkipAheadTime >= duration)
      ||
      // Go to next item if we'd be jumping over the end timestamp
      (endTimestamp !== undefined && currentTime <= endTimestamp && nextSkipAheadTime >= endTimestamp)
    ){
      if (effectiveLooping) {
        // If looping then just go back to the initial timestamp or start since going to the end would do that anyway
        nextSkipAheadTime = initialTimestamp || 0
      } else {
        videojsPlayerRef.current?.trigger('ended');
        return
      }
    }
    videojsPlayerRef.current?.currentTime(nextSkipAheadTime)
    setCurrentlyPlayingMarkers(findCurrentlyPlayingMarkers(nextSkipAheadTime))
    videojsPlayerRef.current?.play()
  }, [getSkipTime, initialTimestamp, endTimestamp, effectiveLooping]);

  const seekBackwards = useCallback(() => {
    if (!videojsPlayerRef.current) return null;
    const duration = videojsPlayerRef.current?.duration();
    const skipAmount = getSkipTime('backwards')
    if (skipAmount === null || typeof duration !== 'number') {
      return null
    }
    const currentTime = videojsPlayerRef.current?.currentTime();
    let nextSkipBackTime = currentTime - skipAmount
    logger.info("Seeking backwards{*}", {skipAmount, duration, nextSkipBackTime})
    // If looping and we'd be going before the initial timestamp go to the initial timestamp
    if (effectiveLooping && initialTimestamp !== undefined && currentTime >= initialTimestamp && nextSkipBackTime < initialTimestamp) {
      nextSkipBackTime = initialTimestamp || 0
    // Go to previous item if the next jump goes to or past the start of the video
    } else if (nextSkipBackTime < 0) {
      // If looping or not already at the start (with 2 second grace period to avoid play immediately moving beyond the
      // start and thus preventing us from ever going back further) then go to the start
      if (effectiveLooping || currentTime > 2) {
        nextSkipBackTime = 0
      } else if (props.index === 0) {
        // If there's no previous video to go back to just go to the start of this one
        nextSkipBackTime = 0
      } else {
        goToItem('previous')
        return
      }
    }
    videojsPlayerRef.current?.currentTime(nextSkipBackTime)
    setCurrentlyPlayingMarkers(findCurrentlyPlayingMarkers(nextSkipBackTime))
    videojsPlayerRef.current?.play()
  }, [getSkipTime, props.index, goToItem, effectiveLooping]);

  const seeking = useSeeking({
    isCurrentVideo,
    videoRef,
    playerRef: videojsPlayerRef,
    looping: effectiveLooping,
    initialTimestamp,
    endTimestamp,
    logger,
  })
  const { gestureTargetElement } = useGestureControls({
    isCurrentVideo,
    videoRef,
    playerRef: videojsPlayerRef,
    seeking,
    seekForwards,
    seekBackwards,
    logger,
  })
  useShortcutSeeking({
    isCurrentVideo,
    playerRef: videojsPlayerRef,
    seeking,
    seekForwards,
    seekBackwards,
  })

  // These classes allow us to better control when the big play button shows to avoid showing it if we're likely to
  // immediately hide it again such as when auto-playing
  const updatePlayableClass = useCallback(() => {
    const className = "playable"
    let timeoutId: NodeJS.Timeout;
    if (globalAutoPlay) {
      // We slightly delay this to give the player a moment to start playing so we don't flash the play button
      // unnecessarily
      timeoutId = setTimeout(() => {
        if (isCurrentVideo) {
          videojsPlayerRef.current?.addClass(className);
        } else {
          videojsPlayerRef.current?.removeClass(className);
        }
      }, 100);
    } else {
      videojsPlayerRef.current?.addClass(className)
    }
    // Cleanup function for useEffect usage
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }, [isCurrentVideo, globalAutoPlay]);
  useEffect(updatePlayableClass, [updatePlayableClass]);

  /* ------------------------------ On end event ------------------------------ */


  /** Handle the event fired at the end of video playback. */
  const handleOnEnded = () => {
    // If not looping on end, scroll to the next item.
    if (effectiveLooping) return
    videojsPlayerRef.current?.pause()
    if (isCurrentVideo) {
      videojsPlayerRef.current?.currentTime(initialTimestamp || 0);
      goToItem('next');
    }
  };

  /* ------------------------------- Scene info ------------------------------- */

  const sceneInfoPanelRef = useRef(null);

  /* ---------------------------- Keyboard shortcuts --------------------------- */

  // Deleting the current item shifts every later item down by one index, so re-pinning to the same index
  // (rather than leaving currentIndex untouched, or advancing it) is what lands on the next item. If the
  // deleted item was the last one loaded, this also naturally clamps back to the new last item since there's
  // nothing further to advance to yet.
  const handleMediaItemDeleted = useCallback(() => {
    props.removeMediaItem(props.mediaItem.id);
    props.changeItemHandler(props.index, { behavior: "instant" });
  }, [props.removeMediaItem, props.mediaItem.id, props.changeItemHandler, props.index]);
  const { open: openDeleteConfirmation, dialog: deleteConfirmationDialog } = useDeleteMediaItemDialog(props.mediaItem, handleMediaItemDeleted);
  const { set: setGlobalState, sceneInfoOpen } = useGlobalState();
  const setSceneInfoOpen = useCallback((open: boolean) => {
    // Opening the panel closes any side panel (each slide's open folder closes itself, see ActionButtonStack)
    if (open) useCurrentOpenPopover.setState(null);
    setGlobalState("sceneInfoOpen", open);
  }, [setGlobalState]);
  const { tags: mediaItemTags, primaryTag: mediaItemPrimaryTag, setTags: setMediaItemTags } = useMediaItemTags(props.mediaItem);
  const [showTagEditor, setShowTagEditor] = useState(false);

  const { selectedStream } = useSceneStreamSelection({
    playerRef: videojsPlayerRef,
  });
  useSyncPlayerWithPreferredStream({
    playerRef: videojsPlayerRef,
    // Only apply stream preference to current and upcoming loaded slides or hasn't loaded yet so we keep buffered data
    // on previous slides.
    enabled: () => props.index >= props.currentIndex || videojsPlayerRef.current?.readyState() === 0,
  })

  useEffect(() => {
    if (!isCurrentVideo) return;
    const handlers = {
      "delete": () => openDeleteConfirmation(),
      "toggle-scene-info": () => setSceneInfoOpen(!sceneInfoOpen),
      "edit-tags": () => setShowTagEditor(true),
      "toggle-mute": () => setTvConfig("volume", (prev) => prev ? 0 : 1),
      "toggle-landscape": () => setTvConfig("forceLandscape", (prev) => !prev),
      "toggle-looping": () => setTvConfig("looping", (prev) => !prev),
      "toggle-subtitles": () => setTvConfig("showSubtitles", (prev) => !prev),
      "toggle-fullscreen": () => setGlobalState("fullscreen", (prev) => !prev),
      "toggle-pip": () => {
        if (!isPictureInPictureSupported()) return;
        // Failures are logged; unlike the action button there's nowhere to show a note
        void togglePictureInPicture(videojsPlayerRef.current);
      },
    } satisfies Partial<Record<ShortcutActionId, () => void>>;
    return onShortcut("press", (trigger) => {
      const action = trigger.match(objectKeys(handlers));
      if (action) handlers[action]();
    });
  }, [isCurrentVideo, openDeleteConfirmation, sceneInfoOpen, setSceneInfoOpen, setTvConfig, setGlobalState]);

  // Every rendered slide calls this but only the current one binds the keys. Markers rate their parent scene.
  useRatingShortcuts(scene, { enabled: isCurrentVideo });

  /* -------------------------------- Subtitles ------------------------------- */
  // Update the subtitles track via the ref object
  useEffect(() => {
    if (videoRef.current && videoRef.current.textTracks.length)
      videoRef.current.textTracks[0].mode = showSubtitles
        ? "showing"
        : "disabled";
  }, [showSubtitles]);

  function getRandomPointInScene(scene: GQL.SceneDataFragment) {
    if (scene.scene_markers.length) {
      // Pick a random marker
      const randomMarker = scene.scene_markers[Math.floor(Math.random() * scene.scene_markers.length)];
      return randomMarker.seconds;
    }
    const duration = scene.files?.[0]?.duration || 0
    // Avoid start and end 5% of scene
    const min = duration * 0.05
    const max = duration * 0.95
    const randomPoint = Math.random() * (max - min) + min
    return Math.floor(randomPoint)
  }


  useEffect(() => {
    if (!playerReady) return;
    let options: AbLoopPluginOptions = {
      loopIfBeforeStart: true,
      loopIfAfterEnd: true,
      pauseAfterLooping: false,
      pauseBeforeLooping: false,
      ...(videojsPlayerRef.current?.abLoopPlugin?.getOptions() ?? {}),
      enabled: effectiveLooping,
      start: initialTimestamp ?? false,
      end: endTimestamp ?? false,
    }
    logger.debug(`Setting AB loop plugin options{*}`, {options});
    videojsPlayerRef.current?.abLoopPlugin.setOptions(options);
  }, [effectiveLooping, playerReady, initialTimestamp, endTimestamp])

  // Track what marker (if any) is currently playing
  const findCurrentlyPlayingMarkers = (currentTime: number) => {
    if (props.mediaItem.entityType === "marker") {
      return [props.mediaItem.entity];
    } else if (props.mediaItem.entityType === "scene") {
      const scene = props.mediaItem.entity;
      const markers = scene.scene_markers.filter(marker => {
        const markerStartSearchTime = marker.seconds;
        const nextMarker = scene.scene_markers.find(m => m.seconds > markerStartSearchTime);
        const makerEndTime = marker.end_seconds ?? marker.seconds + defaultMarkerLength;
        const makerEndSearchTime = Math.min(makerEndTime, nextMarker?.seconds ?? Infinity);
        return markerStartSearchTime <= currentTime && makerEndSearchTime > currentTime
      });
      return markers
    } else {
      props.mediaItem satisfies never
      throw new Error(`Unknown media item type: ${props.mediaItem}`);
    }
  }
  const [currentlyPlayingMarkers, setCurrentlyPlayingMarkers] = useState<GQL.SceneDataFragment["scene_markers"][number][]>(findCurrentlyPlayingMarkers(0));
  const currentlyPlayingMarkersDisplayName = useMemo(
    () => {
      if (!currentlyPlayingMarkers) return null;

      const markerNames: { name: string, type: "tag" | "title" }[] = []
      for (const marker of currentlyPlayingMarkers) {
        const tags = [marker.primary_tag, ...marker.tags]
        if (marker.title) {
          markerNames.push(
            { name: marker.title, type: "title" }
          );
          continue;
        }
        markerNames.push(
          ...tags.map(tag => ({ name: tag.name, type: "tag" } as const))
        )
      }
      return markerNames.map(({name, type}, index) => {
        let joiner
        if (index === markerNames.length - 2) {
          joiner = " & "
        } else if (index < markerNames.length - 2) {
          joiner = ", "
        }
        return <React.Fragment key={name + index}>
          <span className={type}>{name}</span>
          {joiner && <span className="joiner">{joiner}</span>}
        </React.Fragment>
      })
    },
    [currentlyPlayingMarkers]
  );
  const updateCurrentlyPlayingMarkers = useCallback((currentTime: number) => {
    const markers = findCurrentlyPlayingMarkers(currentTime);
    if (markers.length === currentlyPlayingMarkers.length && markers.every(marker => currentlyPlayingMarkers.includes(marker))) return
    logger.debug(`Marker playback update{*}`, {currentTime, markers});
    setCurrentlyPlayingMarkers(markers)
  }, [currentlyPlayingMarkers, props.mediaItem]);
  // Also update when the scene's markers change (e.g. one was just added), not only as the video plays, so it's right
  // while paused too
  useEffect(() => {
    const currentTime = videojsPlayerRef.current?.currentTime();
    if (currentTime !== undefined) updateCurrentlyPlayingMarkers(currentTime);
  }, [props.mediaItem]);
  const handleOnTimeUpdate = useCallback(() => {
    const currentTime = videojsPlayerRef.current?.currentTime();
    if (currentTime === undefined) return;
    if (endTimestamp !== undefined && currentTime >= endTimestamp && currentTime <= (endTimestamp + 3) && !videojsPlayerRef.current?.scrubbing()) {
      logger.debug(`End timestamp reached at ${currentTime}s (end: ${endTimestamp}s)`);
      videojsPlayerRef.current?.trigger('ended');
    }
    updateCurrentlyPlayingMarkers(currentTime);
  }, [endTimestamp, updateCurrentlyPlayingMarkers]);

  /* -------------------------------- Component ------------------------------- */

  const videoJsControlBarElm = videojsPlayerRef.current?.getChild('ControlBar')?.el();
  const videoJsProgressControlElm = videojsPlayerRef.current?.getChild('ControlBar')?.getChild('ProgressControl')?.el();

  return (
    <MediaItemStateContextProvider
      initialValues={{
        mediaSlideElementRef,
        preIncrementOCounterValue: scene.o_counter ?? undefined
      }}
    >
      <div
        className={cx("MediaSlide", {'current-video': isCurrentVideo, 'cover': !letterboxing, 'hide-controls': !uiShown, 'ui-idle': uiIdle, 'left-handed': leftHandedUi}, props.className)}
        data-testid="MediaSlide--container"
        data-index={props.index}
        data-scene-id={scene.id}
        data-current-video={isCurrentVideo}
        ref={mediaSlideElementRef}
        style={props.style}
      >
        <CrtEffect
          enabled={crtEffect}
          strength={crtEffectStrength}
          infoText={`STV-${props.index + 1}`}
        >
          {showDebuggingInfo.includes("onscreen-info") && <>
            <div className="debugStats">
              {props.index} - {scene.id} {loadingDeferred ? "(Loading deferred)" : ""}
              {" "}{props.mediaItem.entityType === "marker" ? `(Marker: ${props.mediaItem.entity.primary_tag.name})` : ""}
              {" "}(duration: {roundTo(videojsPlayerRef.current?.duration() || 0, 2)}s, current time: {roundTo(videojsPlayerRef.current?.currentTime() || 0, 2)}s)
            </div>
            <div className="loadingDeferredDebugBackground" />
          </>}
          {loadingDeferred && scene.paths.screenshot && <img className="loadingDeferredPreview" src={scene.paths.screenshot} />}
          {!loadingDeferred && <ScenePlayer
            id={`scene-player-${props.mediaItem.id}`}
            // Force remount when scene streams change to ensure videojs reloads the source
            key={JSON.stringify([scene.id, sceneStreamsKey])}
            onTimeUpdate={handleOnTimeUpdate}
            mediaItem={props.mediaItem}
            scene={scene}
            // We avoid showing the poster if we are auto-playing to prevent a flash of the poster before playback starts
            showPoster={!globalAutoPlay}
            hideScrubberOverride={true}
            muted={!volume}
            volume={volume}
            playbackRate={playbackRate}
            autoplay={autoplay}
            loop={effectiveLooping}
            initialTimestamp={initialTimestamp}
            sendSetTimestamp={() => {}}
            onNext={() => {}}
            onPrevious={() => {}}
            refVideo={videoRef}
            onEnded={handleOnEnded}
            onVideojsPlayerCreated={handleVideojsPlayerCreated}
            trackActivity={!scenePreviewOnly && props.mediaItem.entityType !== "marker"}
            scrubberThumbnail={!scenePreviewOnly && props.mediaItem.entityType !== "marker"}
            markers={!scenePreviewOnly}
            optionsToMerge={{
              plugins: {
                styledBigPlayButton: {},
                ...(props.mediaItem.entityType === "marker" && !markerPreviewOnly ? {
                  offset: {
                    start: props.mediaItem.entity.seconds,
                    end: props.mediaItem.entity.seconds + props.mediaItem.entity.duration,
                    // This moves the play head to the start of the marker clip but does not resume play even if loop is
                    // true so we handle that ourselves in an onEnded handler
                    restart_beginning: true
                  }
                } : {}),
                abLoopPlugin: {
                  createButtons: false,
                },
              }
            }}
          />}
          {videoJsControlBarElm && createPortal(
            <>
              <div className="center-controls">
              {currentlyPlayingMarkers.length > 0 && (
                <div className="vjs-control currently-playing-marker">
                  {currentlyPlayingMarkersDisplayName}
                </div>
              )}

              </div>
                <div className="vjs-custom-control-spacer vjs-spacer">&nbsp;</div>
                <div className="right-controls">
                {selectedStream && !isDirectStream(selectedStream) && (
                  <div className="vjs-control current-stream-indicator">
                    {selectedStream.resolutionName !== ORIGINAL_RESOLUTION_LABEL && `${selectedStream.resolutionName} `}
                    {selectedStream.format}
                  </div>
                )}
                {gamepadConnectedAt && !gamepadConnectedAWhileAgo && (
                  <FontAwesomeIcon icon={faGamepad} className="vjs-control gamepad-connected-indicator" />
                )}
              </div>
            </>,
            videoJsControlBarElm
          )}
          {videojsPlayerRef.current?.el() && createPortal(
            gestureTargetElement,
            videojsPlayerRef.current?.el()
          )}
          {effectiveLooping && initialTimestamp !== undefined && videoJsProgressControlElm && createPortal(
            <ClipTimestamp type="start" progressPercentage={(initialTimestamp / (videojsPlayerRef.current?.duration() || 1)) * 100} />,
            videoJsProgressControlElm
          )}
          {endTimestamp !== undefined && videoJsProgressControlElm && createPortal(
            <ClipTimestamp type="end" progressPercentage={(endTimestamp / (videojsPlayerRef.current?.duration() || 1)) * 100} />,
            videoJsProgressControlElm
          )}
          <SceneInfo
            ref={sceneInfoPanelRef}
            scene={scene}
            open={sceneInfoOpen}
            onExternalLinkClick={() => videojsPlayerRef.current?.pause()}
          />
          <ActionButtonStack
            mediaItem={props.mediaItem}
            sceneInfoOpen={sceneInfoOpen}
            setSceneInfoOpen={setSceneInfoOpen}
            playerRef={videojsPlayerRef}
            onMediaItemDeleted={handleMediaItemDeleted}
          />
          {deleteConfirmationDialog}
          {showTagEditor && (
            <Modal show onHide={() => setShowTagEditor(false)}>
              <Modal.Header closeButton>
                <Modal.Title>Edit tags</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <EditTagsContents
                  initialTags={mediaItemTags}
                  primaryTag={mediaItemPrimaryTag}
                  save={setMediaItemTags}
                  cancel={() => setShowTagEditor(false)}
                />
              </Modal.Body>
            </Modal>
          )}
        </CrtEffect>
      </div>
    </MediaItemStateContextProvider>
  );
};

export interface MediaSlideProps extends Omit<MediaSlideContentProps, "mediaItem"> {
  mediaItemRef: MediaItemRef;
}

// Reads the entry's data live from the Apollo cache, so a background update (a rating, tags, the play position being
// saved) re-renders the slide with new data rather than remounting it -- unsaved input like an open tag editor's
// selection survives. @see docs/media-loading.md § "Live item data"
const MediaSlide: React.FC<MediaSlideProps> = ({ mediaItemRef, ...otherProps }) => {
  const mediaItem = useLiveMediaItem(mediaItemRef);
  if (!mediaItem) return null;
  return <MediaSlideContent {...otherProps} mediaItem={mediaItem} />;
};

export default React.memo(MediaSlide);

declare global {
  interface Window {
    tvCurrentPlayer?: VideoJsPlayer,
    tvAllPlayers?: VideoJsPlayer[] | undefined,
    tvCurrentMediaItem?: MediaItem,
  }
}
