/**
 * The current slide's UI fades out once a mouse user has been idle, and comes back on any interaction. A slide that
 * becomes current starts with its UI shown.
 *
 * @see docs/state-and-config.md § "UI visibility & auto-hide"
 */

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useUiAutoHide } from "../../../src/hooks/useUiAutoHide";
import { useUiVisible } from "../../../src/hooks/useUiVisible";
import { useGlobalState } from "../../../src/store/globalState";
import { useTvConfig } from "../../../src/store/tvConfig";
import { resetStores } from "../helpers/stores";

const DELAY_MS = 3000;

function Feed({ paused = false }: { paused?: boolean }) {
  useUiAutoHide();
  const { shown } = useUiVisible();
  return (
    <div data-testid="feed" data-ui-shown={shown}>
      <div className="MediaSlide current-video">
        <video
          data-testid="video"
          ref={video => { video && Object.defineProperty(video, "paused", { value: paused, configurable: true }) }}
        />
        <button className="hide-on-ui-hide">A control</button>
        <button className="dim-on-ui-hide">Hide UI</button>
      </div>
    </div>
  );
}

/** Whether the current slide's UI is hidden */
const uiIdle = () => {
  const { uiIdleMediaItemId, currentMediaItemId } = useGlobalState.getState();
  return uiIdleMediaItemId !== null && uiIdleMediaItemId === currentMediaItemId;
};

function changeSlide(mediaItemId: string) {
  act(() => useGlobalState.getState().set("currentMediaItemId", mediaItemId));
}

/** jsdom has no PointerEvent, so this is a MouseEvent with the pointerType the hook reads */
function pointerEvent(type: string, { pointerType = "mouse", clientX = 0, clientY = 0 } = {}) {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  return event;
}

let pointerX = 0;
/** A pointer event at a new position each time, as the hook ignores pointermoves where the pointer didn't move */
function pointer(type: "pointermove" | "pointerdown", target: Element, pointerType = "mouse") {
  pointerX += 1;
  fireEvent(target, pointerEvent(type, { pointerType, clientX: pointerX }));
}

function waitOutDelay() {
  act(() => { vi.advanceTimersByTime(DELAY_MS) });
}

beforeEach(() => {
  resetStores();
  useTvConfig.getState().set("showGuideOverlay", false);
  useGlobalState.getState().set("currentMediaItemId", "item-1");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.classList.remove("modal-open");
});

describe("useUiAutoHide", () => {
  it("hides the UI once the mouse has been idle for the delay", () => {
    render(<Feed />);

    pointer("pointermove", screen.getByTestId("video"));
    act(() => { vi.advanceTimersByTime(DELAY_MS - 1) });
    expect(uiIdle()).toBe(false);

    act(() => { vi.advanceTimersByTime(1) });
    expect(uiIdle()).toBe(true);
    expect(screen.getByTestId("feed").dataset.uiShown).toBe("false");
  });

  it("never hides the UI for touch", () => {
    render(<Feed />);

    pointer("pointerdown", screen.getByTestId("video"), "touch");
    waitOutDelay();

    expect(uiIdle()).toBe(false);
  });

  it("stops hiding the UI once the user switches from a mouse to touch", () => {
    render(<Feed />);

    pointer("pointermove", screen.getByTestId("video"));
    pointer("pointerdown", screen.getByTestId("video"), "touch");
    waitOutDelay();

    expect(uiIdle()).toBe(false);
  });

  it.each([
    ["moving the mouse", () => pointer("pointermove", screen.getByTestId("video"))],
    ["pressing a key", () => fireEvent.keyDown(window, { key: "a" })],
    ["scrolling", () => fireEvent.wheel(window)],
    ["a touch", () => pointer("pointerdown", screen.getByTestId("video"), "touch")],
  ])("shows the UI again on %s", (_, interact) => {
    render(<Feed />);
    pointer("pointermove", screen.getByTestId("video"));
    waitOutDelay();
    expect(uiIdle()).toBe(true);

    interact();

    expect(uiIdle()).toBe(false);
  });

  it("ignores pointermoves where the mouse didn't move", () => {
    render(<Feed />);
    const video = screen.getByTestId("video");
    fireEvent(video, pointerEvent("pointermove", { clientX: 5, clientY: 5 }));
    waitOutDelay();

    fireEvent(video, pointerEvent("pointermove", { clientX: 5, clientY: 5 }));

    expect(uiIdle()).toBe(true);
  });

  it("keeps the UI while the mouse rests over a control", () => {
    render(<Feed />);

    pointer("pointermove", screen.getByRole("button", { name: "A control" }));
    waitOutDelay();

    expect(uiIdle()).toBe(false);
  });

  it("keeps the UI while the video is paused, then hides it once it plays", () => {
    const { rerender } = render(<Feed paused />);

    pointer("pointermove", screen.getByTestId("video"));
    waitOutDelay();
    expect(uiIdle()).toBe(false);

    rerender(<Feed paused={false} />);
    fireEvent(screen.getByTestId("video"), new Event("play"));
    waitOutDelay();
    expect(uiIdle()).toBe(true);
  });

  it.each([
    ["the settings are open", () => useGlobalState.getState().set("showSettings", true)],
    ["the keyboard shortcuts are open", () => useGlobalState.getState().set("keyboardShortcutsOpen", true)],
    ["the scene info panel is being edited", () => useGlobalState.getState().set("sceneInfoDraft", { layout: [], fieldOptions: {} })],
    ["the guide is showing", () => useTvConfig.getState().set("showGuideOverlay", true)],
    ["a modal is open", () => document.body.classList.add("modal-open")],
  ])("keeps the UI while %s", (_, block) => {
    render(<Feed />);
    act(block);

    pointer("pointermove", screen.getByTestId("video"));
    waitOutDelay();

    expect(uiIdle()).toBe(false);
  });

  it("defaults to 3 seconds", () => {
    expect(useTvConfig.getState().getDefault("uiAutoHideDelay")).toBe(3);
  });

  it("starts the next slide with its UI shown, leaving the previous one's hidden", () => {
    render(<Feed />);
    pointer("pointermove", screen.getByTestId("video"));
    waitOutDelay();

    changeSlide("item-2");

    expect(uiIdle()).toBe(false);
    expect(useGlobalState.getState().uiIdleMediaItemId).toBe("item-1");
  });

  it("hides the next slide's UI once the mouse has been idle for the delay on it", () => {
    render(<Feed />);
    pointer("pointermove", screen.getByTestId("video"));
    act(() => { vi.advanceTimersByTime(DELAY_MS - 1000) });

    changeSlide("item-2");
    act(() => { vi.advanceTimersByTime(DELAY_MS - 1) });
    expect(uiIdle()).toBe(false);

    act(() => { vi.advanceTimersByTime(1) });
    expect(uiIdle()).toBe(true);
    expect(useGlobalState.getState().uiIdleMediaItemId).toBe("item-2");
  });

  it("doesn't hide the UI when auto-hide is off", () => {
    useTvConfig.getState().set("uiAutoHideDelay", 0);
    render(<Feed />);

    pointer("pointermove", screen.getByTestId("video"));
    waitOutDelay();

    expect(uiIdle()).toBe(false);
  });

  it("brings the UI back when auto-hide is turned off while it's hidden", () => {
    render(<Feed />);
    pointer("pointermove", screen.getByTestId("video"));
    waitOutDelay();

    act(() => useTvConfig.getState().set("uiAutoHideDelay", 0));

    expect(uiIdle()).toBe(false);
  });

  it("lets a press that wakes the UI only wake it, not click the control under it", () => {
    const onClick = vi.fn();
    render(<Feed />);
    const button = screen.getByRole("button", { name: "Hide UI" });
    button.addEventListener("click", onClick);
    pointer("pointermove", screen.getByTestId("video"));
    waitOutDelay();

    pointer("pointerdown", button, "touch");
    fireEvent.click(button);

    expect(uiIdle()).toBe(false);
    expect(onClick).not.toHaveBeenCalled();

    // The next press isn't waking the UI, so it clicks as usual
    pointer("pointerdown", button, "touch");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("still lets a press that wakes the UI click the video", () => {
    const onClick = vi.fn();
    render(<Feed />);
    const video = screen.getByTestId("video");
    video.addEventListener("click", onClick);
    pointer("pointermove", video);
    waitOutDelay();

    pointer("pointerdown", video, "touch");
    fireEvent.click(video);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("stops and shows the UI once unmounted", () => {
    const { unmount } = render(<Feed />);
    pointer("pointermove", screen.getByTestId("video"));
    waitOutDelay();

    unmount();

    expect(uiIdle()).toBe(false);
  });
});
