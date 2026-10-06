import { useEffect } from "react";
import { UI_CONTROLS_SELECTOR } from "../constants";
import { useGlobalState } from "../store/globalState";
import { useTvConfig } from "../store/tvConfig";

/**
 * Fades out the current slide's UI (sets `globalState.uiIdleMediaItemId`) once a mouse user has been idle on it for
 * `tvConfig.uiAutoHideDelay` seconds, and brings it back on any interaction. A slide that becomes current starts with
 * its UI shown. Touch use never hides it. Call it once, from the feed.
 *
 * @see docs/state-and-config.md § "UI visibility & auto-hide"
 */
export function useUiAutoHide() {
  const tvConfigLoaded = useGlobalState(state => state.tvConfigLoaded);
  const uiVisible = useTvConfig(state => state.uiVisible);
  const delay = useTvConfig(state => state.uiAutoHideDelay);

  useEffect(() => {
    if (!tvConfigLoaded || !uiVisible || !(delay > 0)) return;

    const { get: getGlobalState, set: setGlobalState } = useGlobalState.getState();
    let usingMouse = false;
    let overControls = false;
    let lastPointerPosition: { x: number, y: number } | null = null;
    // Set by a press that woke the UI, so the click it makes doesn't also activate the control under it
    let pressWokeUi = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const currentSlideIdle = () => {
      const idleMediaItemId = getGlobalState("uiIdleMediaItemId");
      return idleMediaItemId !== null && idleMediaItemId === getGlobalState("currentMediaItemId");
    };

    const stopTimer = () => {
      clearTimeout(timeout);
      timeout = undefined;
    };

    /** Show the UI, returning whether the current slide's was hidden */
    const wake = () => {
      stopTimer();
      const wasIdle = currentSlideIdle();
      if (getGlobalState("uiIdleMediaItemId") !== null) setGlobalState("uiIdleMediaItemId", null);
      return wasIdle;
    };

    const isBlocked = () => (
      overControls
      || document.querySelector<HTMLVideoElement>(".MediaSlide.current-video video")?.paused !== false
      || getGlobalState("showSettings")
      || getGlobalState("keyboardShortcutsOpen")
      || getGlobalState("sceneInfoDraft") !== null
      || !!useTvConfig.getState().showGuideOverlay
      || document.body.classList.contains("modal-open")
    );

    // Anything that makes the UI wanted again (closing a panel, playing) comes with an interaction or a `play`, which
    // restarts the timer, so a blocked timer can just give up rather than poll
    const startTimer = () => {
      stopTimer();
      if (!usingMouse || overControls) return;
      timeout = setTimeout(() => {
        timeout = undefined;
        if (!isBlocked()) setGlobalState("uiIdleMediaItemId", getGlobalState("currentMediaItemId"));
      }, delay * 1000);
    };

    const restartTimer = () => {
      wake();
      startTimer();
    };

    const handlePointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        usingMouse = false;
        overControls = false;
        const woke = wake();
        if (event.type === "pointerdown") pressWokeUi = woke;
        return;
      }
      // Browsers send pointermove without the mouse moving, e.g. when what's under it changes (like the UI fading)
      if (
        event.type === "pointermove"
        && lastPointerPosition?.x === event.clientX
        && lastPointerPosition?.y === event.clientY
      ) return;
      lastPointerPosition = { x: event.clientX, y: event.clientY };
      usingMouse = true;
      overControls = event.target instanceof Element && !!event.target.closest(UI_CONTROLS_SELECTOR);
      if (event.type === "pointerdown") pressWokeUi = currentSlideIdle();
      restartTimer();
    };

    const handleClick = (event: MouseEvent) => {
      if (!pressWokeUi) return;
      pressWokeUi = false;
      if (!(event.target instanceof Element) || !event.target.closest(UI_CONTROLS_SELECTOR)) return;
      event.stopPropagation();
      event.preventDefault();
    };

    const handlePlay = (event: Event) => {
      if (!(event.target instanceof Element) || !event.target.closest(".MediaSlide.current-video")) return;
      startTimer();
    };

    // The new current slide's UI is shown (it isn't the idle one) without waking the UI, which would fade the previous
    // slide's back in as it leaves. It hides once the mouse has been idle for the delay on it.
    const unsubscribeFromSlideChanges = useGlobalState.subscribe((state, previous) => {
      if (state.currentMediaItemId !== previous.currentMediaItemId) startTimer();
    });

    const options = { capture: true };
    window.addEventListener("pointermove", handlePointer, options);
    window.addEventListener("pointerdown", handlePointer, options);
    window.addEventListener("click", handleClick, options);
    window.addEventListener("keydown", restartTimer, options);
    window.addEventListener("wheel", restartTimer, options);
    // Media events don't bubble, but they can be caught on the way down
    document.addEventListener("play", handlePlay, options);
    return () => {
      window.removeEventListener("pointermove", handlePointer, options);
      window.removeEventListener("pointerdown", handlePointer, options);
      window.removeEventListener("click", handleClick, options);
      window.removeEventListener("keydown", restartTimer, options);
      window.removeEventListener("wheel", restartTimer, options);
      document.removeEventListener("play", handlePlay, options);
      unsubscribeFromSlideChanges();
      wake();
    };
  }, [tvConfigLoaded, uiVisible, delay]);
}
