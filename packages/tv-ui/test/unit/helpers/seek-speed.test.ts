import { describe, expect, it } from "vitest";
import {
  gestureArea,
  holdSpeed,
  isPlayedSpeed,
  seekFeedback,
  showsThumbnail,
  toDiscreteSeekSpeed,
} from "../../../src/helpers/seek-speed";

/**
 * Seek speeds for gestures and the arrow keys: the steps they're rounded to, a hold's speed as it's dragged, and what
 * the feedback overlay shows for each.
 *
 * @see docs/video-player.md § "Gestures"
 */

describe("toDiscreteSeekSpeed", () => {
  it.each([
    // speed, rounded to, faster, slower
    [0.04, 0, 0.1, -0.1],
    [1.46, 1.5, 1.6, 1.4],
    [2, 2, 3, 1.9],
    [-1, -1, -0.9, -2],
    [2.4, 2, 3, 1],
    [-1.6, -2, -1, -3],
    [5, 5, 10, 4],
    [-5, -5, -4, -10],
    [8, 10, 15, 5],
    [15, 15, 30, 10],
    [-15, -15, -10, -30],
    [50, 45, 60, 30],
    [60, 60, 120, 45],
    [-60, -60, -45, -120],
    [100, 90, 120, 60],
    [120, 120, 240, 90],
    [-120, -120, -90, -240],
    [200, 180, 240, 120],
    [-300, -300, -240, -360],
  ])("rounds %d to %d, with %d faster and %d slower", (speed, discrete, faster, slower) => {
    const steps = toDiscreteSeekSpeed(speed);
    expect(steps.discrete).toBeCloseTo(discrete);
    expect(steps.faster).toBeCloseTo(faster);
    expect(steps.slower).toBeCloseTo(slower);
  });
});

describe("gestureArea", () => {
  it.each([
    [0, "left"],
    [99, "left"],
    [150, "middle"],
    [201, "right"],
    [299, "right"],
  ])("puts %d across a 300 wide video in its %s third", (x, area) => {
    expect(gestureArea(x, 300)).toBe(area);
  });
});

describe("holdSpeed", () => {
  it("starts rewinding from the left, paused from the middle and at 1.5x from the right", () => {
    expect(holdSpeed("left", 0, 1000, 60)).toBe(-1.5);
    expect(holdSpeed("middle", 0, 1000, 60)).toBe(0);
    expect(holdSpeed("right", 0, 1000, 60)).toBe(1.5);
  });

  it("changes by 1 for a drag a tenth of the way across, either way", () => {
    expect(holdSpeed("right", 100, 1000, 60)).toBeCloseTo(2.5);
    expect(holdSpeed("right", -100, 1000, 60)).toBeCloseTo(0.5);
  });

  it("changes by the 6th power of the distance dragged", () => {
    expect(holdSpeed("middle", 200, 1000, 600)).toBeCloseTo(64);
  });

  it("changes by at most a third of the video's duration", () => {
    expect(holdSpeed("right", 500, 1000, 12)).toBe(5.5);
    expect(holdSpeed("left", -500, 1000, 12)).toBe(-5.5);
  });
});

describe("isPlayedSpeed and showsThumbnail", () => {
  it("plays speeds from 0.1x up to (not including) 5x, and skips the rest", () => {
    expect([0, 0.1, 4, 5, -0.5].map(isPlayedSpeed)).toEqual([false, true, true, false, false]);
  });

  it("shows the thumbnail preview above 5 forwards or 2 backwards", () => {
    expect([5, 10, -2, -3].map(showsThumbnail)).toEqual([false, true, false, true]);
  });
});

describe("seekFeedback", () => {
  it.each([
    [1.5, "1.5x", "play"],
    [0.1, "0.1x", "play"],
    [0, "", "pause"],
    [-0.5, "0.5s", "backward"],
    [5, "5s", "forward"],
    [60, "1m", "forward"],
    [90, "1m 30s", "forward"],
    [-240, "4m", "backward"],
  ])("shows %d as %j with a %s icon", (speed, text, icon) => {
    expect(seekFeedback(speed)).toEqual({ text, icon });
  });
});
