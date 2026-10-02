import { useEffect, useMemo, useState } from "react";
import "./useOverflowIndicators.css";
import { useResizeObserver } from "./useResizeObserver";

type ScrollClasses = "top-overflowing" | "bottom-overflowing" | "indicators-on-overflow" | "overflowing";

export default function useOverflowIndicators(stackElmRef: React.MutableRefObject<HTMLElement | null>) {
  const [isOverflowingTop, setIsOverflowingTop] = useState<boolean>(false);
  const [isOverflowingBottom, setIsOverflowingBottom] = useState<boolean>(false);
  const stackScrollClasses = useMemo<ScrollClasses[]>(() => {
    const classes: ScrollClasses[] = ["indicators-on-overflow"];
    if (isOverflowingTop) classes.push("top-overflowing");
    if (isOverflowingBottom) classes.push("bottom-overflowing");
    // if (isOverflowingTop || isOverflowingBottom) classes.push("overflowing");
    return classes;
  }, [isOverflowingTop, isOverflowingBottom]);

  function handleStackScroll(event: Event) {
    const target = event.currentTarget;
    if (!target || !(target instanceof HTMLElement)) return;
    updateStackScrollClasses(target);
  }

  useEffect(() => {
    if (!stackElmRef.current) return;
    stackElmRef.current.addEventListener("scroll", handleStackScroll);
    return () => {
      stackElmRef.current?.removeEventListener("scroll", handleStackScroll);
    };
  }, [stackElmRef.current]);

  useResizeObserver(() => stackElmRef.current, () => {
    if (stackElmRef.current) updateStackScrollClasses(stackElmRef.current);
  }, { deps: [stackElmRef.current] });

  function updateStackScrollClasses(element: HTMLElement) {
    const isScrollable = element.scrollHeight > element.offsetHeight;
    const scrollPercent = Math.abs(element.scrollTop) / (element.scrollHeight - element.offsetHeight);
    const isReversed = getComputedStyle(element).flexDirection?.includes('reverse');
    const scrollPercentDirectionCorrected = isReversed ? 1 - scrollPercent : scrollPercent;
    setIsOverflowingTop(isScrollable && scrollPercentDirectionCorrected > 0);
    setIsOverflowingBottom(isScrollable && scrollPercentDirectionCorrected < 1);
  }

  return stackScrollClasses
}
