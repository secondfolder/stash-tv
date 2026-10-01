import { useEffect } from "react";

const FOCUSABLE_SELECTOR = "input, textarea, select, [tabindex]";

/**
 * Make focusing anything inside the given element never scroll the page, by having its `focus()` always use
 * `preventScroll`.
 *
 * On iOS, focusing an input scrolls the page to keep it visible above the on-screen keyboard. In Stash TV the page is
 * the feed, so that moves to another video, dragging an open side panel off screen with it. Dropdowns call `focus()` on
 * their input themselves (react-select does when tapped), so this covers them; an input focused natively by a tap
 * doesn't go through `focus()` and isn't covered.
 *
 * Takes the element rather than a ref so it starts watching whenever the element mounts (pass it from a callback ref).
 */
export function useFocusWithoutScrolling(container: HTMLElement | null) {
  useEffect(() => {
    if (!container) return;
    const preventFocusScroll = (element: HTMLElement) => {
      if (Object.prototype.hasOwnProperty.call(element, "focus")) return;
      element.focus = (options?: FocusOptions) =>
        HTMLElement.prototype.focus.call(element, { ...options, preventScroll: true });
    };
    const preventFocusScrollForAll = () =>
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR).forEach(preventFocusScroll);
    const observer = new MutationObserver(preventFocusScrollForAll);
    observer.observe(container, { childList: true, subtree: true });
    preventFocusScrollForAll();
    return () => observer.disconnect();
  }, [container]);
}
