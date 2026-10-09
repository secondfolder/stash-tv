import React, { useEffect } from "react";
import { type VideoJsPlayer } from "video.js";
import { useLatest } from "react-use";
import { toDiscreteSeekSpeed } from "../helpers/seek-speed";
import { type Seeking } from "./useSeeking";
import { isTypingTarget } from "../helpers/keyboard-shortcuts/key-combos";
import { matchShortcut, matchShortcutKey } from "./useKeyboardShortcuts";

/** How long a seek key has to be held before it seeks rather than skips */
const keyHoldDelay = 300;

/**
 * The current slide's playback keys (← → ↑ ↓ and Space by default): tapping a seek key skips back or forwards,
 * holding one seeks at 2x either way, and the faster/slower keys change the speed while one's held (by a step, or by
 * one for each repeat while held). The play/pause key plays/pauses. In forced landscape the arrows are turned with the
 * screen (see `matchShortcut`). @see docs/keyboard-shortcuts.md
 */
export function useKeyboardSeeking(options: {
  isCurrentVideo: boolean,
  playerRef: React.RefObject<VideoJsPlayer | null>,
  seeking: Seeking,
  seekForwards: () => void,
  seekBackwards: () => void,
}) {
  const { isCurrentVideo } = options;
  // The listeners read the latest options rather than the ones from when they were added
  const latest = useLatest(options);

  useEffect(() => {
    if (!isCurrentVideo) return;
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    // The speed of a held key's seek, while there is one
    let speed: number | null = null;

    // Stops Video.js handling the key as well
    const handled = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event)) return;
      const { seeking, playerRef } = latest.current;
      const seekAction = matchShortcut(event, ["seek-backwards", "seek-forwards"]);
      const speedAction = speed !== null ? matchShortcut(event, ["seek-faster", "seek-slower"]) : null;
      if (seekAction) {
        if (!event.repeat) {
          clearTimeout(holdTimer);
          const direction = seekAction === "seek-forwards" ? 1 : -1;
          holdTimer = setTimeout(() => {
            holdTimer = undefined;
            speed = 2 * direction;
            seeking.seek(speed);
          }, keyHoldDelay);
        }
        handled(event);
      } else if (speedAction && speed !== null) {
        const faster = speedAction === "seek-faster";
        speed = event.repeat
          ? speed + (faster ? 1 : -1)
          : toDiscreteSeekSpeed(speed)[faster ? "faster" : "slower"];
        seeking.seek(speed);
        handled(event);
      } else if (matchShortcut(event, ["play-pause"])) {
        // Video.js doesn't seem to play with the space bar when playing for the first time
        if (playerRef.current?.paused()) playerRef.current.play();
        else playerRef.current?.pause();
        handled(event);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isTypingTarget(event)) return;
      const seekAction = matchShortcutKey(event, ["seek-backwards", "seek-forwards"]);
      if (!seekAction) return;
      const { seeking, seekBackwards, seekForwards } = latest.current;
      if (holdTimer) {
        // Released before it was held: a skip
        clearTimeout(holdTimer);
        holdTimer = undefined;
        if (seekAction === "seek-forwards") seekForwards();
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
  }, [isCurrentVideo]);
}
