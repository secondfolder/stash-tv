import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import cx from "classnames";
import { Button, Overlay, Popover } from "react-bootstrap";
import { useUID } from "react-uid";
import { Options as PopperOptions } from "@popperjs/core";
import { useCurrentOpenPopover } from "../../PopoverPanel";
import { hasMediaItemStateContext, useMediaItemState } from "../../../store/mediaItemState";
import { usePreventOverflowModifier } from "../../../hooks/usePreventOverflowModifier";
import { useOutsideClickModifier } from "../../../hooks/useOutsideClickModifier";
import { useOffscreenModifier } from "../../../hooks/useOffscreenModifier";
import { setMaxSizeModifier } from "../../../helpers/popper-modifiers/setMaxSize";
import { aboveOrBelowModifier } from "../../../helpers/popper-modifiers/aboveOrBelow";
import { updateOnResizeModifier } from "../../../helpers/popper-modifiers/updateOnResize";
import { getStashUrl } from "../../../helpers/getStashOrigin";
import "./EntityPopover.css";

/** Closes the popover the component is in */
const CloseEntityPopoverContext = createContext<() => void>(() => {})

/** A button below (or above) an entity's card, e.g. "Show scenes with this tag", which closes the popover once clicked */
export function EntityPopoverAction({ id, label, icon, onClick }: {
  id: string
  label: string
  icon: ReactNode
  onClick: () => void
}) {
  const close = useContext(CloseEntityPopoverContext)
  return <Button
    variant="secondary"
    className={cx("entity-popover-action", `action-${id}`)}
    onClick={() => {
      close()
      onClick()
    }}
  >
    {icon}
    <span>{label}</span>
  </Button>
}

/** What the element opening the popover is given: spread them onto it */
export type EntityPopoverTriggerProps = {
  ref: (element: HTMLElement | null) => void
  onClick: (event: React.MouseEvent<HTMLElement>) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  "aria-haspopup": "dialog"
  "aria-expanded": boolean
}

// As Stash's popovers over tags, performers…
const hoverOpenDelay = 500
// Long enough to move from what opened it onto the popover
const hoverCloseDelay = 200

/**
 * A popover showing an entity's card (e.g. a tag's), with buttons for things to do with it, opened by hovering over or
 * clicking what `children` renders. Hovered, it closes once the pointer leaves it. Clicked, it stays open until a click
 * outside it. It opens above or below, whichever has room, with its buttons on the side nearest what opened it. Links
 * in the card open in Stash, in a new tab. Each kind of entity has its own popover built on this (e.g. `TagPopover`).
 * The card and buttons are rendered only while it's open, so they can fetch what they show and use hooks freely.
 *
 * @see docs/entity-popovers.md
 */
export function EntityPopover({
  label,
  card,
  actions,
  onOpenStashLink,
  className,
  children,
}: {
  /** Names the popover for screen readers, e.g. the entity's name */
  label: string
  card: ReactNode
  /** `EntityPopoverAction`s, or a component rendering them */
  actions: ReactNode
  /** Called as a link in the card opens a page in Stash, e.g. to pause the video */
  onOpenStashLink?: () => void
  className?: string
  children: (props: EntityPopoverTriggerProps) => JSX.Element
}) {
  const id = `entity-popover-${useUID()}`
  const [triggerElement, setTriggerElement] = useState<HTMLElement | null>(null)
  const [hovered, setHovered] = useState(false)
  const pinned = useCurrentOpenPopover() === id
  const show = hovered || pinned

  const hoverTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(hoverTimer.current), [])
  const onMouseEnter = useCallback(() => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHovered(true), hoverOpenDelay)
  }, [])
  const onMouseLeave = useCallback(() => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHovered(false), hoverCloseDelay)
  }, [])

  const close = useCallback(() => {
    clearTimeout(hoverTimer.current)
    setHovered(false)
    if (useCurrentOpenPopover.getState() === id) useCurrentOpenPopover.setState(null)
  }, [id])

  const onClick = (event: React.MouseEvent<HTMLElement>) => {
    // Let a link open in a new tab or window as usual
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    if (pinned) {
      close()
    } else {
      clearTimeout(hoverTimer.current)
      useCurrentOpenPopover.setState(id)
    }
  }

  let boundary
  // Popovers can be used outside of a MediaSlide instance
  if (hasMediaItemStateContext()) {
    const { mediaSlideElementRef } = useMediaItemState()
    boundary = mediaSlideElementRef.current ?? undefined
  }
  const preventOverflowModifier = usePreventOverflowModifier({ boundary })
  const outsideClickModifier = useOutsideClickModifier({ onOutsideClick: close })
  const offscreenModifier = useOffscreenModifier({ onOffscreen: close })
  const popperConfig: Partial<PopperOptions> = {
    modifiers: [
      // Above if there's room, otherwise below, or whichever has more room
      aboveOrBelowModifier,
      preventOverflowModifier,
      setMaxSizeModifier,
      updateOnResizeModifier,
      offscreenModifier,
      // Once clicked, it stays open until a click outside it. Hovered, a click elsewhere does what it would otherwise.
      ...(pinned ? [outsideClickModifier] : []),
    ],
  }

  // Stash's cards link to pages in Stash, which open in a new tab rather than in Stash TV
  const openLinksInStash = (event: React.MouseEvent) => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null
    if (!link) return
    // A button in a link (e.g. a card's favourite button) does something of its own
    const button = event.target instanceof Element ? event.target.closest("button") : null
    if (button && link.contains(button)) return
    event.preventDefault()
    event.stopPropagation()
    onOpenStashLink?.()
    const url = new URL(link.getAttribute("href") ?? "", location.origin)
    window.open(getStashUrl(url.pathname + url.search + url.hash), "_blank")
  }

  return <>
    {children({
      ref: setTriggerElement,
      onClick,
      onMouseEnter,
      onMouseLeave,
      "aria-haspopup": "dialog",
      "aria-expanded": show,
    })}
    <Overlay show={show && !!triggerElement} target={triggerElement} placement="top" popperConfig={popperConfig}>
      <Popover
        id={id}
        role="dialog"
        aria-label={label}
        className={cx("EntityPopover", className)}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <Popover.Content className="entity-popover-content">
          <CloseEntityPopoverContext.Provider value={close}>
            <div className="entity-popover-card" onClickCapture={openLinksInStash}>
              {card}
            </div>
            <div className="entity-popover-actions">
              {actions}
            </div>
          </CloseEntityPopoverContext.Provider>
        </Popover.Content>
      </Popover>
    </Overlay>
  </>
}
