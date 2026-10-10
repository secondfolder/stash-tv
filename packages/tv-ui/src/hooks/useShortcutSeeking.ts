import React, { useEffect } from "react";
import { type VideoJsPlayer } from "video.js";
import { useLatest } from "react-use";
import { holdDelay, analogSeekSpeed, toDiscreteSeekSpeed } from "../helpers/seek-speed";
import { type Seeking } from "./useSeeking";
import { onAnalogSeek, onShortcut } from "../helpers/shortcut-actions/input";

/** How long a seek key has to be held before it seeks rather than skips */
const keyHoldDelay = 300;

/**
 * The current slide's playback shortcuts (← → ↑ ↓ and Space by default, or a gamepad's controls for them): tapping a
 * seek key skips back or forwards, holding one seeks at 2x either way, and the faster/slower keys change the speed
 * while one's held (by a step, or by one for each repeat while held). The play/pause key plays/pauses. In forced
 * landscape the arrows are turned with the screen (see `matchShortcut`).
 *
 * A gamepad stick or trigger bound to seeking seeks at a speed set by how far it's pushed or pressed, or skips if it's
 * only flicked.
 *
 * @see docs/keyboard-shortcuts.md § "Where shortcuts live"
 * @see docs/gamepad.md § "Analog seeking"
 */
export function useShortcutSeeking(options: {
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

    const stopPress = onShortcut("press", (trigger) => {
      const { seeking, playerRef } = latest.current;
      const seekAction = trigger.match(["seek-backwards", "seek-forwards"]);
      const speedAction = speed !== null ? trigger.match(["seek-faster", "seek-slower"]) : null;
      if (seekAction) {
        if (!trigger.repeat) {
          clearTimeout(holdTimer);
          const direction = seekAction === "seek-forwards" ? 1 : -1;
          holdTimer = setTimeout(() => {
            holdTimer = undefined;
            speed = 2 * direction;
            seeking.seek(speed);
          }, keyHoldDelay);
        }
        trigger.handled();
      } else if (speedAction && speed !== null) {
        const faster = speedAction === "seek-faster";
        speed = trigger.repeat
          ? speed + (faster ? 1 : -1)
          : toDiscreteSeekSpeed(speed)[faster ? "faster" : "slower"];
        seeking.seek(speed);
        trigger.handled();
      } else if (trigger.match(["play-pause"])) {
        // Video.js doesn't seem to play with the space bar when playing for the first time
        if (playerRef.current?.paused()) playerRef.current.play();
        else playerRef.current?.pause();
        trigger.handled();
      }
    }, { capture: true });

    const stopRelease = onShortcut("release", (trigger) => {
      const seekAction = trigger.match(["seek-backwards", "seek-forwards"]);
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
      trigger.handled();
    }, { capture: true });

    // A stick or trigger: flicked (let go of before the hold delay) it skips, like a tap; held, its speed follows it
    let analogTimer: ReturnType<typeof setTimeout> | undefined;
    let analogValue = 0;
    let analogSeeking = false;
    const seekAtAnalog = () => {
      const { seeking, playerRef } = latest.current;
      seeking.seek(analogSeekSpeed(analogValue, playerRef.current?.duration() || Infinity));
    };
    const stopAnalog = onAnalogSeek((value) => {
      const { seeking, seekBackwards, seekForwards } = latest.current;
      if (value === 0) {
        if (analogTimer) {
          clearTimeout(analogTimer);
          analogTimer = undefined;
          if (analogValue > 0) seekForwards();
          else seekBackwards();
        } else if (analogSeeking) {
          seeking.seek(null);
        }
        analogSeeking = false;
        analogValue = 0;
        return;
      }
      analogValue = value;
      if (analogSeeking) {
        seekAtAnalog();
      } else if (!analogTimer) {
        analogTimer = setTimeout(() => {
          analogTimer = undefined;
          analogSeeking = true;
          seekAtAnalog();
        }, holdDelay);
      }
    });

    return () => {
      stopPress();
      stopRelease();
      stopAnalog();
      clearTimeout(holdTimer);
      clearTimeout(analogTimer);
    };
  }, [isCurrentVideo]);
}
