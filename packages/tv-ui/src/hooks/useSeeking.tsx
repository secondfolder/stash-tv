import React, { useEffect, useMemo, useRef } from "react";
import { type VideoJsPlayer } from "video.js";
import { type Logger } from "@logtape/logtape";
import { useLatest } from "react-use";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBackward, faForward, faPause, faPlay, type IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { useFeedback } from "../components/FeedbackOverlay";
import { isPlayedSpeed, seekFeedback, showsThumbnail, toDiscreteSeekSpeed, type SeekIcon } from "../helpers/seek-speed";

const icons: Record<SeekIcon, IconDefinition> = { play: faPlay, forward: faForward, backward: faBackward, pause: faPause };

/** How often a video that's paused while seeking has its time moved on */
const skipInterval = 100; // ms

const thumbnailEvents = ["timeupdate", "seeking", "progress", "durationchange"];

type Session = {
  /** The (discrete) speed being seeked at */
  speed: number,
  /** How the video was before seeking, to put it back after */
  initialPaused: boolean,
  initialRate: number,
  /** Whether the video should be paused at the session's speed */
  paused: boolean,
  /** Moves the video's time on while it's paused and skipping */
  skipTimer?: ReturnType<typeof setInterval>,
  showingThumbnail: boolean,
};

export type Seeking = ReturnType<typeof useSeeking>;

/**
 * Seeking through a slide's video at a speed until told to stop, for gestures and the arrow keys: played faster or
 * slower, or paused with its time skipped, with the speed shown in the feedback overlay. Ends when its slide stops
 * being the current one. @see docs/video-player.md § "Gestures"
 */
export function useSeeking(options: {
  isCurrentVideo: boolean,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  playerRef: React.RefObject<VideoJsPlayer | null>,
  looping: boolean,
  initialTimestamp: number | undefined,
  endTimestamp: number | undefined,
  logger: Logger,
}) {
  const { isCurrentVideo, videoRef, playerRef } = options;
  // The timer and callbacks read the latest options, not the ones from when seeking started
  const latest = useLatest(options);
  const { setFeedback } = useFeedback();
  const sessionRef = useRef<Session | null>(null);

  const seeking = useMemo(() => {
    const logger = () => latest.current.logger.getChild("useSeeking");
    const loopStart = () => latest.current.initialTimestamp ?? 0;
    // Items without an end timestamp (markers, previews) loop at the end of the video
    const loopEnd = () => latest.current.endTimestamp ?? (playerRef.current?.duration() || Infinity);

    function showFeedback(text: string, icon?: SeekIcon) {
      // Empty contents would clear the overlay, so the icon alone (paused) needs something in their place
      setFeedback(text || <></>, { hold: true, icon: icon && <FontAwesomeIcon icon={icons[icon]} /> });
    }

    // While seeking, the video is played and paused directly rather than through Video.js, and its pause events are
    // kept from Video.js: otherwise Video.js would show its big play button whenever a hold pauses the video
    function setPaused(paused: boolean) {
      const video = videoRef.current;
      if (!video || video.paused === paused) return;
      if (paused) video.pause();
      else video.play().catch((error) => logger().debug(`Video didn't play: ${error}`));
    }

    function hidePauseEvents(event: Event) {
      event.stopPropagation();
      // Something else paused it (e.g. it played to its end): keep it playing at the seek's speed
      if (sessionRef.current && !sessionRef.current.paused) setPaused(false);
    }

    function showThumbnail() {
      const player = playerRef.current;
      if (!player) return;
      const thumbnails = player.vttThumbnails();
      player.userActive(true);
      // @ts-expect-error -- A private method but there's no other way to show the thumbnail
      thumbnails.showThumbnailHolder();
      const duration = player.duration();
      const progressBarWidth = player.getChild("ControlBar")?.getChild("ProgressControl")?.el().clientWidth;
      if (!duration || !progressBarWidth) return;
      // @ts-expect-error -- A private method but there's no other way to move the thumbnail
      thumbnails.updateThumbnailStyle(player.currentTime() / duration, progressBarWidth);
    }

    // The progress bar's thumbnail preview, kept up to date as the video's time changes
    function showThumbnails(session: Session, show: boolean) {
      const player = playerRef.current;
      if (show === session.showingThumbnail || !player) return;
      session.showingThumbnail = show;
      for (const event of thumbnailEvents) {
        if (show) player.on(event, showThumbnail);
        else player.off(event, showThumbnail);
      }
      // @ts-expect-error -- A private method but there's no other way to hide the thumbnail
      if (!show) player.vttThumbnails().hideThumbnailHolder();
    }

    function stopSkipping(session: Session) {
      clearInterval(session.skipTimer);
      session.skipTimer = undefined;
    }

    function skip() {
      const session = sessionRef.current;
      const player = playerRef.current;
      if (!session || !player) return;
      const { looping } = latest.current;
      const currentTime = player.currentTime();
      const duration = player.duration() || Infinity;
      const next = currentTime + session.speed * (skipInterval / 1000);
      if (looping && session.speed < 0 && next <= loopStart()) {
        showFeedback("Start of loop reached");
        player.currentTime(loopStart());
      } else if (looping && session.speed > 0 && next >= loopEnd()) {
        showFeedback("End of loop reached");
        // Stop just short of the very end of the video, where a looping video goes back to its start
        player.currentTime(Math.min(loopEnd(), duration - 0.1));
      } else if (!looping && session.speed > 0 && next >= duration) {
        // Skipping to the end moves on to the next item like playing to it does. The video is paused while skipping
        // so it never fires its own ended event.
        logger().debug("End of video reached while skipping forwards");
        stopSkipping(session);
        player.trigger("ended");
      } else if (session.speed) {
        player.currentTime(next);
      }
    }

    /** Whether a looping video is already at the end of its loop it's seeking towards */
    function atLoopEdge(speed: number) {
      const currentTime = playerRef.current?.currentTime() ?? 0;
      return (speed < 0 && currentTime <= loopStart()) || (speed > 0 && currentTime >= loopEnd());
    }

    /** Stop seeking, leaving the video paused if `paused` is given or as it was before seeking if not */
    function end({ paused }: { paused?: boolean } = {}) {
      const session = sessionRef.current;
      if (!session) return;
      sessionRef.current = null;
      logger().debug("Seeking ended");
      stopSkipping(session);
      showThumbnails(session, false);
      setFeedback(null, { fade: false });
      videoRef.current?.removeEventListener("pause", hidePauseEvents, { capture: true });
      const player = playerRef.current;
      if (!player) return;
      player.playbackRate(session.initialRate);
      player.scrubbing(false);
      const endPaused = paused ?? session.initialPaused;
      setPaused(endPaused);
      // Tell Video.js how it's been left, as it missed the pauses
      if (endPaused) {
        // @ts-expect-error -- A private method but there's no other way to tell it
        player.handleTechPause_();
      } else {
        // @ts-expect-error -- A private method but there's no other way to tell it
        player.handleTechPlay_();
      }
    }

    /** Seek at a speed (rounded to a step, see toDiscreteSeekSpeed), or stop seeking if it's null */
    function seek(speed: number | null) {
      if (speed === null) return end();
      const player = playerRef.current;
      if (!player) return;
      const discreteSpeed = toDiscreteSeekSpeed(speed).discrete;
      let session = sessionRef.current;
      if (session?.speed === discreteSpeed) return;
      if (!session) {
        session = {
          speed: discreteSpeed,
          initialPaused: player.paused(),
          initialRate: player.playbackRate(),
          paused: player.paused(),
          showingThumbnail: false,
        };
        sessionRef.current = session;
        // Stops a clip's end timestamp ending the item while seeking
        player.scrubbing(true);
        videoRef.current?.addEventListener("pause", hidePauseEvents, { capture: true });
      }
      session.speed = discreteSpeed;
      session.paused = !isPlayedSpeed(discreteSpeed);
      logger().debug(`Seeking at ${discreteSpeed}`);

      if (isPlayedSpeed(discreteSpeed)) {
        stopSkipping(session);
        player.playbackRate(discreteSpeed);
      } else {
        player.playbackRate(1);
        session.skipTimer ??= setInterval(skip, skipInterval);
      }
      setPaused(session.paused);

      // At the end of its loop a looping video says so instead (see skip)
      if (isPlayedSpeed(discreteSpeed) || !latest.current.looping || !atLoopEdge(discreteSpeed)) {
        const { text, icon } = seekFeedback(discreteSpeed);
        showFeedback(text, icon);
      }
      showThumbnails(session, showsThumbnail(discreteSpeed));
    }

    return {
      seek,
      end,
      /** Whether it's seeking: the video's playback rate is then the seek's, not the user's */
      isSeeking: () => sessionRef.current !== null,
    };
  }, []);

  // Seeking belongs to the slide it started on. Its video is left paused, as videos that aren't current don't play.
  useEffect(() => {
    if (!isCurrentVideo) seeking.end({ paused: true });
  }, [isCurrentVideo]);
  useEffect(() => () => seeking.end({ paused: true }), []);

  return seeking;
}
