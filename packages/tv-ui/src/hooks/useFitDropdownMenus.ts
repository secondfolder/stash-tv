import { useEffect } from "react";
import { DROPDOWN_MENU_SELECTOR, fitDropdownMenu } from "../helpers/fitDropdownMenu";

/**
 * Keep every dropdown menu opened inside the given element on screen, opening it above its input when there's no room
 * below (see `fitDropdownMenu`). Covers dropdowns we don't render ourselves, like those in Stash's marker form.
 *
 * Takes the element rather than a ref so it starts watching whenever the element mounts (pass it from a callback ref).
 * Refits whenever a menu opens or its options change (e.g. while typing to filter them). Mutation observer callbacks
 * run before the browser paints, so the menu never visibly jumps.
 */
export function useFitDropdownMenus(container: HTMLElement | null) {
  useEffect(() => {
    if (!container) return;
    const fitAll = () => container.querySelectorAll<HTMLElement>(DROPDOWN_MENU_SELECTOR).forEach(fitDropdownMenu);
    // Only watch for added/removed elements: fitting a menu changes its styles, which mustn't trigger another fit
    const observer = new MutationObserver(fitAll);
    observer.observe(container, { childList: true, subtree: true });
    fitAll();
    return () => observer.disconnect();
  }, [container]);
}
