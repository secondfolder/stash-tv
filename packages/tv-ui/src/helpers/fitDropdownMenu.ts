/**
 * Placing dropdown (react-select) menus that open inside an action button's side panel.
 *
 * @see docs/action-buttons.md § "`ActionButtonBase`"
 */

/** Matches the menu of any react-select dropdown, ours and Stash's (both use the "react-select" class name prefix). */
export const DROPDOWN_MENU_SELECTOR = ".react-select__menu";

/** react-select's default `maxMenuHeight`, which neither our dropdowns nor Stash's change. */
const DEFAULT_MAX_LIST_HEIGHT = 300;

export type MenuFit = {
  placement: "below" | "above";
  /** The tallest the menu's option list may be. */
  maxListHeight: number;
};

/**
 * Where a dropdown menu should open: below its input if it fits there, otherwise above if it fits there, otherwise on
 * whichever side has more room, with its option list shortened to fit.
 *
 * Heights are in pixels. `spaceAbove`/`spaceBelow` are the room between the input and the edge of the screen, already
 * less the gap the menu leaves between itself and the input.
 */
export function chooseMenuFit({
  spaceAbove,
  spaceBelow,
  listContentHeight,
  menuChromeHeight,
  preferredMaxListHeight = DEFAULT_MAX_LIST_HEIGHT,
}: {
  spaceAbove: number;
  spaceBelow: number;
  /** The full height of the option list's contents, as if it could grow without limit */
  listContentHeight: number;
  /** The menu's height outside its option list (padding, borders) */
  menuChromeHeight: number;
  preferredMaxListHeight?: number;
}): MenuFit {
  const menuHeight = Math.min(listContentHeight, preferredMaxListHeight) + menuChromeHeight;
  if (menuHeight <= spaceBelow) return { placement: "below", maxListHeight: preferredMaxListHeight };
  if (menuHeight <= spaceAbove) return { placement: "above", maxListHeight: preferredMaxListHeight };
  const placement = spaceBelow >= spaceAbove ? "below" : "above";
  const space = placement === "below" ? spaceBelow : spaceAbove;
  return { placement, maxListHeight: Math.max(0, space - menuChromeHeight) };
}

/** The visible part of the page, which shrinks when an on-screen keyboard opens. */
function visibleArea() {
  const viewport = window.visualViewport;
  return viewport
    ? { top: viewport.offsetTop, bottom: viewport.offsetTop + viewport.height }
    : { top: 0, bottom: window.innerHeight };
}

/**
 * Place an open react-select menu below or above its input, limiting its height if needed, so it stays on screen (see
 * `chooseMenuFit`). This overrides the placement react-select picked, which only knows to open below and push the page
 * to scroll.
 *
 * Positions the menu against its containing block rather than its input: in a side panel that's the panel itself, so
 * the menu can stick out of the panel's scrolling contents (the panel's CSS arranges that once the menu is marked
 * `data-fitted`, see ActionButtonBase.css). Call again when the contents scroll, as the menu doesn't move with them.
 */
export function fitDropdownMenu(menu: HTMLElement) {
  const list = menu.firstElementChild;
  // The select's container wraps just the input
  const container = menu.parentElement;
  if (!(list instanceof HTMLElement) || !container) return;
  // Lets the side panel's CSS unposition the menu's ancestors, making the panel its containing block
  menu.dataset.fitted = "";
  const containingBlock = menu.offsetParent;
  if (!containingBlock) return;

  const input = container.getBoundingClientRect();
  const area = visibleArea();
  const gap = parseFloat(getComputedStyle(menu).marginTop) || 0;
  const fit = chooseMenuFit({
    spaceAbove: input.top - area.top - gap,
    spaceBelow: area.bottom - input.bottom - gap,
    listContentHeight: list.scrollHeight,
    // Measured with fractional precision (offsetHeight rounds), or the menu can end up a fraction of a pixel off screen
    menuChromeHeight: menu.getBoundingClientRect().height - list.getBoundingClientRect().height,
  });

  // Absolute positions are measured from the containing block's padding box, inside its border
  const blockRect = containingBlock.getBoundingClientRect();
  const blockTop = blockRect.top + containingBlock.clientTop;
  const blockLeft = blockRect.left + containingBlock.clientLeft;
  const blockBottom = blockTop + containingBlock.clientHeight;
  menu.style.left = `${input.left - blockLeft}px`;
  menu.style.width = `${input.width}px`;
  menu.style.top = fit.placement === "below" ? `${input.bottom - blockTop}px` : "auto";
  menu.style.bottom = fit.placement === "above" ? `${blockBottom - input.top}px` : "auto";
  list.style.maxHeight = `${fit.maxListHeight}px`;
}
