import React, { useEffect, useMemo, useRef } from "react";
import { type VideoJsPlayer } from "video.js";
import { type Logger } from "@logtape/logtape";
import { useGesture } from "@use-gesture/react";
import { useLatest } from "react-use";
import { UAParser } from "ua-parser-js";
import { gestureArea, holdDelay, holdSpeed, type GestureArea } from "../helpers/seek-speed";
import { type Seeking } from "./useSeeking";

type Press = {
  area: GestureArea,
  pointerType: string,
  /** The width of the element pressed, to tell how far across it a drag has gone */
  width: number,
  /** How far it's been dragged since it was pressed */
  offsetX: number,
  /** Whether it's been held long enough to seek */
  held: boolean,
  holdTimer?: ReturnType<typeof setTimeout>,
};

/**
 * Tapping, holding and dragging on a slide's video: a tap on its left, middle or right third skips back, plays/pauses
 * or skips forwards, and a hold seeks until released, faster or slower as it's dragged sideways.
 * @see docs/video-player.md § "Gestures"
 *
 * Returns the element gestures are made on, for iOS, to render over the video. iOS ignores `user-select: none` on a
 * Video.js video, so a long press on it selects text: the element stands in for it.
 */
export function useGestureControls(options: {
  isCurrentVideo: boolean,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  playerRef: React.RefObject<VideoJsPlayer | null>,
  seeking: Seeking,
  seekForwards: () => void,
  seekBackwards: () => void,
  logger: Logger,
}) {
  const { isCurrentVideo, videoRef } = options;
  // Handlers read the latest options rather than the ones from when the press started
  const latest = useLatest(options);
  const pressRef = useRef<Press | null>(null);

  const isIos = useMemo(() => !!UAParser().os.name?.includes("iOS"), []);
  const iosTargetRef = useRef<HTMLDivElement>(null);

  function seekHeld(press: Press) {
    const duration = latest.current.playerRef.current?.duration() || 0;
    latest.current.seeking.seek(holdSpeed(press.area, press.offsetX, press.width, duration));
  }

  /** Forget the press, ending its seek if it was held (unless `endSeek` is false) */
  function endPress({ endSeek = true } = {}) {
    const press = pressRef.current;
    if (!press) return;
    pressRef.current = null;
    clearTimeout(press.holdTimer);
    if (press.held && endSeek) latest.current.seeking.seek(null);
  }

  function tap(area: GestureArea) {
    const { playerRef, seekBackwards, seekForwards } = latest.current;
    if (area === "left") {
      seekBackwards();
    } else if (area === "right") {
      seekForwards();
    } else if (playerRef.current?.paused()) {
      playerRef.current.play();
    } else {
      playerRef.current?.pause();
    }
  }

  useGesture({
    onPointerDown: ({ event }) => {
      if (!(event.target instanceof HTMLElement)) return;
      // Only the primary button (always it for touch and pens): a right-click would otherwise be a tap, and its context
      // menu takes the release, leaving it held
      if (event.button !== 0) return;
      endPress();
      const width = event.target.clientWidth;
      const press: Press = {
        area: gestureArea(event.offsetX, width),
        pointerType: event.pointerType,
        width,
        offsetX: 0,
        held: false,
      };
      // Until it's been held a moment it might be a tap. A drag made in the meantime counts once it's held.
      press.holdTimer = setTimeout(() => {
        latest.current.logger.getChild("useGestureControls").debug(`Holding ${press.area}`);
        press.held = true;
        seekHeld(press);
      }, holdDelay);
      pressRef.current = press;
    },
    // Video.js stops click events on touch devices, so a tap is a pointerup before the press is held
    onPointerUp: () => {
      const press = pressRef.current;
      if (!press) return;
      endPress();
      if (!press.held) tap(press.area);
    },
    onDrag: ({ offset: [offsetX], last, canceled }) => {
      const press = pressRef.current;
      if (!press) return;
      press.offsetX = offsetX;
      // `last` isn't set if the first call is also the last
      if (!(last ?? true)) {
        if (press.held) seekHeld(press);
      } else if (press.held || canceled) {
        // A tap's pointerup comes after this, so leave the press for it unless the browser took the pointer over
        endPress();
      }
    },
  }, {
    target: isIos ? iosTargetRef : videoRef,
    drag: {
      from: [0, 0], // Reset offset to 0 on each gesture start
      filterTaps: true,
      preventScroll: true,
      // A drag can be made with the keyboard but a gesture is about where on the video it is
      pointer: { keys: false },
    },
  });

  // A workaround for https://github.com/pmndrs/use-gesture/issues/593
  // Removed on unmount so listeners don't pile up as slides are virtualised in and out
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      Object.defineProperty(event, 'detail', { value: 0, writable: true });
    };
    window.addEventListener("click", handleClick, { capture: true });
    return () => window.removeEventListener("click", handleClick, { capture: true });
  }, []);

  // Scrolling the feed (e.g. a touch swipe) during a press means it wasn't a tap
  useEffect(() => {
    const handleScroll = () => {
      if (pressRef.current && !pressRef.current.held) endPress();
    };
    window.addEventListener("scroll", handleScroll, { capture: true });
    return () => window.removeEventListener("scroll", handleScroll, { capture: true });
  }, []);

  // A context menu opened during a mouse press (e.g. Ctrl+click on macOS) takes its release, so the press ends there.
  // Not for touch, where a long press can open one and shouldn't cut a hold short.
  useEffect(() => {
    const handleContextMenu = () => {
      if (pressRef.current?.pointerType === "mouse") endPress();
    };
    window.addEventListener("contextmenu", handleContextMenu, { capture: true });
    return () => window.removeEventListener("contextmenu", handleContextMenu, { capture: true });
  }, []);

  // The window losing focus mid-press (an OS menu, switching apps) means its release may never come
  useEffect(() => {
    const handleBlur = () => endPress();
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, []);

  // A press belongs to the slide it started on. Its seek ends with the slide too, leaving the video paused (see
  // useSeeking), so it's left to do that.
  useEffect(() => {
    if (!isCurrentVideo) endPress({ endSeek: false });
  }, [isCurrentVideo]);
  useEffect(() => () => clearTimeout(pressRef.current?.holdTimer), []);

  return {
    gestureTargetElement: isIos ? <div ref={iosTargetRef} className="text-selection-on-gesture-workaround" /> : null,
  };
}
