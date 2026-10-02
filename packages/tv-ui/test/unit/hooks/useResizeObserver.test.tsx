import React, { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useResizeObserver } from "../../../src/hooks/useResizeObserver";

/** The observers made, each with the elements it's observing, to trigger by hand */
const observers: { callback: ResizeObserverCallback, targets: Set<Element>, disconnected: boolean }[] = [];

class FakeResizeObserver {
  private entry: typeof observers[number];
  constructor(callback: ResizeObserverCallback) {
    this.entry = { callback, targets: new Set(), disconnected: false };
    observers.push(this.entry);
  }
  observe(target: Element) { this.entry.targets.add(target); }
  unobserve(target: Element) { this.entry.targets.delete(target); }
  disconnect() { this.entry.disconnected = true; }
}

/** Every element being observed "resizing" */
function resizeAll() {
  for (const { callback, targets, disconnected } of observers) {
    if (!disconnected && targets.size) callback([], {} as ResizeObserver);
  }
}

function Measured({ enabled = true, onResize }: { enabled?: boolean, onResize: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useResizeObserver(() => ref.current, onResize, { enabled });
  return <div ref={ref} />;
}

describe("useResizeObserver", () => {
  beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("measures as it starts observing, and whenever the element resizes", () => {
    const onResize = vi.fn();
    render(<Measured onResize={onResize} />);
    expect(onResize).toHaveBeenCalledTimes(1);

    resizeAll();
    expect(onResize).toHaveBeenCalledTimes(2);
  });

  it("doesn't observe while it's not enabled, and stops when it's no longer enabled", () => {
    const onResize = vi.fn();
    const { rerender } = render(<Measured onResize={onResize} enabled={false} />);
    expect(onResize).not.toHaveBeenCalled();

    rerender(<Measured onResize={onResize} enabled />);
    expect(onResize).toHaveBeenCalledTimes(1);

    rerender(<Measured onResize={onResize} enabled={false} />);
    expect(observers.every(observer => observer.disconnected)).toBe(true);
    resizeAll();
    expect(onResize).toHaveBeenCalledTimes(1);
  });

  it("calls the latest callback it's been given", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(<Measured onResize={first} />);
    rerender(<Measured onResize={latest} />);

    resizeAll();
    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });
});
