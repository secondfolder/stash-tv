/**
 * The hideStaleFrames plugin hides a player's video while it loads, until it shows a frame from where it's meant to be,
 * as Firefox shows the video's first frame before seeking to where it starts.
 *
 * @see docs/video-player.md § "Hiding the frames shown while loading"
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import videojs, { type VideoJsPlayer } from "video.js";
import "../../../src/components/ScenePlayer/video.js/hide-stale-frames-plugin";

let frameCallbacks: VideoFrameRequestCallback[];
let player: VideoJsPlayer;
let videoElm: HTMLVideoElement;

beforeEach(() => {
  frameCallbacks = [];
  // jsdom has no video frame callbacks
  Object.assign(HTMLVideoElement.prototype, {
    requestVideoFrameCallback: (callback: VideoFrameRequestCallback) => frameCallbacks.push(callback),
    cancelVideoFrameCallback: () => {},
  });

  const element = document.createElement("video");
  document.body.append(element);
  player = videojs(element, { plugins: { hideStaleFrames: {} } });
  videoElm = player.tech(true).el() as HTMLVideoElement;
});

afterEach(() => {
  player?.dispose();
  const prototype: Partial<HTMLVideoElement> = HTMLVideoElement.prototype;
  delete prototype.requestVideoFrameCallback;
  delete prototype.cancelVideoFrameCallback;
});

/** Show a frame from `mediaTime` while the video is at `currentTime` */
function showFrame(mediaTime: number, currentTime: number) {
  Object.defineProperty(videoElm, "currentTime", { value: currentTime, configurable: true });
  const callbacks = frameCallbacks.splice(0);
  for (const callback of callbacks) callback(performance.now(), { mediaTime } as VideoFrameCallbackMetadata);
}

const isHidden = () => player.hasClass("hide-stale-frame");

describe("hideStaleFrames plugin", () => {
  it("hides the video once it starts loading", () => {
    expect(isHidden()).toBe(false);
    videoElm.dispatchEvent(new Event("loadstart"));
    expect(isHidden()).toBe(true);
    expect(player.videoHidden?.()).toBe(true);
  });

  it("keeps it hidden while it shows a frame from elsewhere, like its first before seeking to its start", () => {
    videoElm.dispatchEvent(new Event("loadstart"));
    showFrame(0, 200);
    expect(isHidden()).toBe(true);
  });

  it("shows it once it shows a frame from where it's meant to be, firing videoshown", () => {
    const shown = vi.fn();
    player.on("videoshown", shown);
    videoElm.dispatchEvent(new Event("loadstart"));
    showFrame(0, 200);
    // The frame shown for a time starts a little before it
    showFrame(199.991, 200);
    expect(isHidden()).toBe(false);
    expect(player.videoHidden?.()).toBe(false);
    expect(shown).toHaveBeenCalledOnce();
  });

  it("hides it again when it loads again", () => {
    videoElm.dispatchEvent(new Event("loadstart"));
    showFrame(200, 200);
    videoElm.dispatchEvent(new Event("loadstart"));
    expect(isHidden()).toBe(true);
    showFrame(0, 203.7);
    expect(isHidden()).toBe(true);
    showFrame(203.7, 203.7);
    expect(isHidden()).toBe(false);
  });
});
