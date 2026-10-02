import { DependencyList, useLayoutEffect, useRef } from "react";

type Targets = Element | null | undefined | Iterable<Element | null | undefined>;

/**
 * Calls `onResize` whenever any of the elements `getTargets` gives changes size, and once as it starts observing them
 * (in a layout effect, so before the browser paints). It only observes while `enabled`, and gets the elements again
 * whenever `deps` change. `onResize` is always the latest one passed, so it can read the latest state.
 */
export function useResizeObserver(
  getTargets: () => Targets,
  onResize: () => void,
  { enabled = true, deps = [] }: { enabled?: boolean, deps?: DependencyList } = {},
) {
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  useLayoutEffect(() => {
    if (!enabled) return;
    const found = getTargets();
    const targets = (found instanceof Element || !found ? [found] : [...found]).filter((target): target is Element => !!target);
    if (!targets.length) return;
    onResizeRef.current();
    const observer = new ResizeObserver(() => onResizeRef.current());
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [enabled, ...deps]);
}
