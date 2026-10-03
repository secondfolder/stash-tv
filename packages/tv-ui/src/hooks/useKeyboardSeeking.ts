import React, { useEffect } from "react";
import { type VideoJsPlayer } from "video.js";
import { useLatest } from "react-use";
import { toDiscreteSeekSpeed } from "../helpers/seek-speed";
import { type Seeking } from "./useSeeking";

/** How long ← or → has to be held before it seeks rather than skips */
const keyHoldDelay = 300;

/**
 * The current slide's playback keys: tapping ← or → skips back or forwards, holding them seeks at 2x either way, and ↑
 * and ↓ change the speed while one's held (by a step, or by one for each repeat while held). Space plays/pauses. In
 * forced landscape the arrows are turned with the screen. @see docs/keyboard-shortcuts.md
 */
export function useKeyboardSeeking(options: {
  isCurrentVideo: boolean,
  forceLandscape: boolean,
  playerRef: React.RefObject<VideoJsPlayer | null>,
  seeking: Seeking,
  seekForwards: () => void,
  seekBackwards: () => void,
}) {
  const { isCurrentVideo, forceLandscape } = options;
  // The listeners read the latest options rather than the ones from when they were added
  const latest = useLatest(options);

  useEffect(() => {
    if (!isCurrentVideo) return;
    const keys = forceLandscape
      ? { backwards: "ArrowDown", forwards: "ArrowUp", faster: "ArrowLeft", slower: "ArrowRight" }
      : { backwards: "ArrowLeft", forwards: "ArrowRight", faster: "ArrowUp", slower: "ArrowDown" };
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    // The speed of a held key's seek, while there is one
    let speed: number | null = null;

    const isTyping = (event: KeyboardEvent) =>
      event.target instanceof HTMLInputElement
      || event.target instanceof HTMLTextAreaElement
      || (event.target instanceof HTMLElement && event.target.getAttribute("role") === "slider");
    // Stops Video.js handling the key as well
    const handled = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event)) return;
      const { seeking, playerRef } = latest.current;
      if (event.key === keys.backwards || event.key === keys.forwards) {
        if (!event.repeat) {
          clearTimeout(holdTimer);
          const direction = event.key === keys.forwards ? 1 : -1;
          holdTimer = setTimeout(() => {
            holdTimer = undefined;
            speed = 2 * direction;
            seeking.seek(speed);
          }, keyHoldDelay);
        }
        handled(event);
      } else if ((event.key === keys.faster || event.key === keys.slower) && speed !== null) {
        const faster = event.key === keys.faster;
        speed = event.repeat
          ? speed + (faster ? 1 : -1)
          : toDiscreteSeekSpeed(speed)[faster ? "faster" : "slower"];
        seeking.seek(speed);
        handled(event);
      } else if (event.key === " " || event.key === "Spacebar") {
        // Video.js doesn't seem to play with the space bar when playing for the first time
        if (playerRef.current?.paused()) playerRef.current.play();
        else playerRef.current?.pause();
        handled(event);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isTyping(event) || (event.key !== keys.backwards && event.key !== keys.forwards)) return;
      const { seeking, seekBackwards, seekForwards } = latest.current;
      if (holdTimer) {
        // Released before it was held: a skip
        clearTimeout(holdTimer);
        holdTimer = undefined;
        if (event.key === keys.forwards) seekForwards();
        else seekBackwards();
      } else {
        speed = null;
        seeking.seek(null);
      }
      handled(event);
    };

    // Capturing so the keys never reach the video player, which treats arrow keys as seek commands
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
      clearTimeout(holdTimer);
    };
  }, [isCurrentVideo, forceLandscape]);
}
