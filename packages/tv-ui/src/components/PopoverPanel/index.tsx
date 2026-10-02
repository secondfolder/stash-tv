import React, { useEffect } from "react";
import cx from "classnames";
import "./PopoverPanel.css";
import { useUID } from "react-uid";
import { OverlayTrigger, Popover } from "react-bootstrap";
import { OverlayTriggerProps } from "react-bootstrap/esm/OverlayTrigger";
import { create } from "zustand";
import { MenuShouldScrollIntoViewContext } from "stash-ui/dist/src/components/Shared/FilterSelect";
import { useTvConfig } from "../../store/tvConfig";
import { hasMediaItemStateContext, useMediaItemState } from "../../store/mediaItemState";
import { applyArrowHideModifier } from "../../helpers/popper-modifiers/applyArrowHide";
import { setMaxSizeModifier } from "../../helpers/popper-modifiers/setMaxSize";
import { updateOnResizeModifier } from "../../helpers/popper-modifiers/updateOnResize";
import { usePreventOverflowModifier } from "../../hooks/usePreventOverflowModifier";
import { useOffscreenModifier } from "../../hooks/useOffscreenModifier";
import { useOutsideClickModifier } from "../../hooks/useOutsideClickModifier";
import { useFitDropdownMenus } from "../../hooks/useFitDropdownMenus";
import { useFocusWithoutScrolling } from "../../hooks/useFocusWithoutScrolling";

/** Which popover panel is open, by its id: only one is at a time, app-wide */
export const useCurrentOpenPopover = create<null | string>(() => (null))

/** What's in a popover panel, or a function rendering it (given whether it's open, and a way to close it) */
export type PopoverPanelContent = React.ReactNode | ((props: {isOpen: boolean, close: () => void}) => React.ReactNode)

type Children = (props: {onClick: (event: React.MouseEvent<HTMLElement>) => void, ref: React.Ref<any>}) => JSX.Element

/**
 * A popover opened by clicking what `children` renders (e.g. an action button's side panel), closing on a click outside
 * it or once that's scrolled off screen. Only one is open at a time (`useCurrentOpenPopover`). It opens beside the
 * action buttons, towards the screen's middle, unless given another `placement`. How it behaves, and why:
 * docs/action-buttons.md § "Side panels".
 */
export const PopoverPanel = ({
  content,
  children,
  onToggle,
  className,
  placement,
}: {
  content: PopoverPanelContent,
  /** Called as it opens and closes */
  onToggle?: (isOpen: boolean) => void,
  className?: string,
  placement?: "top" | "bottom",
  children: Children,
}): JSX.Element => {
  const currentOpenPopover = useCurrentOpenPopover()
  const { leftHandedUi } = useTvConfig();
  const id = `popover-panel-${useUID()}`
  const isOpen = id === currentOpenPopover
  let boundary
  // Action buttons can be placed outside of a MediaSlide instance
  if (hasMediaItemStateContext()) {
    const { mediaSlideElementRef } = useMediaItemState()
    boundary = mediaSlideElementRef.current ?? undefined
  } else {
    boundary = undefined
  }
  const preventOverflowModifier = usePreventOverflowModifier({
    boundary: boundary,
    accountForKeyboard: true,
  })

  const outsideClickModifier = useOutsideClickModifier({
    onOutsideClick: () => useCurrentOpenPopover.setState(null)
  })

  const offscreenModifier = useOffscreenModifier({
    onOffscreen: () => useCurrentOpenPopover.setState(null)
  })

  // Dropdowns in the panel stick out of its scrolling contents, opening above their input when there's no room below
  const [contentsElement, setContentsElement] = React.useState<HTMLDivElement | null>(null)
  useFitDropdownMenus(contentsElement)
  // On iOS, focusing a field would otherwise scroll the page (the feed) to keep it above the on-screen keyboard
  useFocusWithoutScrolling(contentsElement)

  const onToggleRef = React.useRef(onToggle)
  onToggleRef.current = onToggle

  useEffect(() => {
    onToggleRef.current?.(isOpen)
  }, [isOpen])

  // Without isOpenDelayedClose the popover content will be immediately removed from the DOM immediately where as the
  // popover itself takes a short amount of time to animate out
  const [isOpenDelayedClose, setIsOpenDelayedClose] = React.useState(isOpen)
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (!isOpen) {
      timeout = setTimeout(() => setIsOpenDelayedClose(false), 300)
    } else {
      setIsOpenDelayedClose(true)
    }
    return () => {
      if (timeout) clearTimeout(timeout);
    }
  }, [isOpen])


  if (!content) return children({onClick: () => {}, ref: null})
  return (
    <OverlayTrigger
      trigger="click"
      placement={placement ?? (leftHandedUi ? "right" : "left")}
      overlay={
        <Popover
          as="dialog"
          className={cx("PopoverPanel", className, { 'left-handed': leftHandedUi, vertical: placement })}
          id={id}
        >
          <div className="contents" ref={setContentsElement}>
            {/* Dropdowns in the panel mustn't scroll the page to bring their menu into view: the page is the feed, so
                that moves to another video. useFitDropdownMenus keeps their menus on screen instead. */}
            <MenuShouldScrollIntoViewContext.Provider value={false}>
              {isOpenDelayedClose && (
                typeof content === "function"
                  ? content({isOpen, close: () => useCurrentOpenPopover.setState(null)})
                  : content
              )}
            </MenuShouldScrollIntoViewContext.Provider>
          </div>
        </Popover>
      }
      show={isOpen}
      onToggle={(shouldOpen) => {
        // In practice it shouldn't be possible to trigger onToggle when the popper is open since it should be covered by
        // outsideClickModifier's backdrop but we play it safe and cover that situation
        const currentlyOpen = id === useCurrentOpenPopover.getState()
        if (shouldOpen && !currentlyOpen) {
          useCurrentOpenPopover.setState(id)
        } else if (!shouldOpen && currentlyOpen) {
          useCurrentOpenPopover.setState(null)
        }
      }}
      popperConfig={{
        modifiers: [
          applyArrowHideModifier,
          preventOverflowModifier,
          setMaxSizeModifier,
          updateOnResizeModifier,
          offscreenModifier,
          outsideClickModifier,
        ],
      }}
    >
      {
        // OverlayTrigger's children appear to be typed wrong
        children as unknown as OverlayTriggerProps['children']
      }
    </OverlayTrigger>
  )
}
