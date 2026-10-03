import { clamp, roundTo, roundToNearest } from ".";

/**
 * Seeking through a video at a speed, for gestures and the arrow keys. A speed is how many seconds of the video pass
 * per second: 1 is normal, negative is backwards. @see docs/video-player.md § "Gestures"
 */

/** Which third of the video a gesture started in */
export type GestureArea = "left" | "middle" | "right";

/** The icons the feedback overlay shows for a seek */
export type SeekIcon = "play" | "forward" | "backward" | "pause";

/** The fastest speed a video is played at: faster, its time is skipped instead */
const maxPlayedSpeed = 5;

/** How long a hold has to last before it seeks */
export const holdDelay = 250;

/**
 * Rounds a speed to the steps it can take (tenths around normal speed, then whole numbers, then 5s, 15s, 30s and 60s
 * steps), and the steps either side of it.
 */
export function toDiscreteSeekSpeed(seekSpeed: number): { discrete: number, faster: number, slower: number } {
  const absSpeed = Math.abs(seekSpeed);

  // Above 120 or below -120
  if (absSpeed > 120) {
    const discrete = roundToNearest(seekSpeed, 60);
    return { discrete, faster: discrete + 60, slower: discrete - 60 };
  }
  // Between 120 to 60 or between -60 to -120
  if (absSpeed > 60) {
    const discrete = roundToNearest(seekSpeed, 30);
    return { discrete, faster: discrete < 120 ? discrete + 30 : 240, slower: discrete > -120 ? discrete - 30 : -240 };
  }
  // Between 60 to 15 or between -15 to -60
  if (absSpeed > 15) {
    const discrete = roundToNearest(seekSpeed, 15);
    return { discrete, faster: discrete < 60 ? discrete + 15 : 120, slower: discrete > -60 ? discrete - 15 : -120 };
  }
  // Between 15 to 5 or between -5 to -15
  if (absSpeed > 5) {
    const discrete = roundToNearest(seekSpeed, 5);
    return { discrete, faster: discrete < 15 ? discrete + 5 : 30, slower: discrete > -15 ? discrete - 5 : -30 };
  }
  // Between 5 to 2 or between -1 to -5
  if (seekSpeed > 2 || seekSpeed < -1) {
    const discrete = roundTo(seekSpeed, 0);
    return { discrete, faster: discrete < 5 ? discrete + 1 : 10, slower: discrete > -5 ? discrete - 1 : -10 };
  }
  // Between -1 to 2
  const discrete = roundTo(seekSpeed, 1);
  return { discrete, faster: discrete < 2 ? discrete + 0.1 : 3, slower: discrete > -1 ? discrete - 0.1 : -2 };
}

/** The third of an element of the given width that a point `x` across it is in */
export function gestureArea(x: number, width: number): GestureArea {
  if (x / width < 1 / 3) return "left";
  if (x / width > 2 / 3) return "right";
  return "middle";
}

/**
 * The speed of a hold that started in `area` and has been dragged `offsetX` across a video `width` wide: rewinding
 * from the left, paused from the middle, 1.5x from the right, changed by the 6th power of the distance dragged (a
 * tenth of the width changes it by 1), by at most a third of the video's duration either way.
 */
export function holdSpeed(area: GestureArea, offsetX: number, width: number, duration: number) {
  const baseSpeed = { left: -1.5, middle: 0, right: 1.5 }[area];
  const dragChange = Math.sign(offsetX) * ((offsetX / width) * 10) ** 6;
  return baseSpeed + clamp(-duration / 3, dragChange, duration / 3);
}

/** Whether a video seeking at a (discrete) speed plays at it, rather than being paused and its time skipped */
export function isPlayedSpeed(discreteSpeed: number) {
  return discreteSpeed >= 0.1 && discreteSpeed < maxPlayedSpeed;
}

/** Whether to show the progress bar's thumbnail preview while seeking at a (discrete) speed */
export function showsThumbnail(discreteSpeed: number) {
  return discreteSpeed > maxPlayedSpeed || discreteSpeed < -2;
}

/** What the feedback overlay shows while seeking at a (discrete) speed: "1.5x", "5s", "1m 30s", or nothing at 0 */
export function seekFeedback(discreteSpeed: number): { text: string, icon: SeekIcon } {
  if (isPlayedSpeed(discreteSpeed)) return { text: `${discreteSpeed}x`, icon: "play" };
  if (!discreteSpeed) return { text: "", icon: "pause" };
  const minutes = Math.floor(Math.abs(discreteSpeed) / 60);
  const seconds = Math.abs(discreteSpeed) % 60;
  return {
    text: [minutes && `${minutes}m`, seconds && `${seconds}s`].filter(Boolean).join(" "),
    icon: discreteSpeed > 0 ? "forward" : "backward",
  };
}
