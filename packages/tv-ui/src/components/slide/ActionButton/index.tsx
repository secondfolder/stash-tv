import React, {
  useEffect,
  useMemo,
} from "react";
import cx from "classnames";
import "./ActionButton.css";
import { useUID } from "react-uid";
import { OverlayTrigger, Popover } from "react-bootstrap";
import { create } from "zustand";
import { useTvConfig } from "../../../store/tvConfig";
import { ActionButtonIconComponent } from "../../../helpers/getActionButtonDetails";
import { OverlayTriggerProps } from "react-bootstrap/esm/OverlayTrigger";
import { preventMisclickOnMoveModifier } from "../../../helpers/popper-modifiers/preventMisclickOnMove";
import { preventChildOverflowModifier } from "../../../helpers/popper-modifiers/preventChildOverflow";
import { applyArrowHideModifier } from "../../../helpers/popper-modifiers/applyArrowHide";

export const useCurrentOpenPopover = create<null | string>(() => (null))

export type SidePanelContent = React.ReactNode | ((props: {isOpen: boolean, close: () => void}) => React.ReactNode)

export type Props = {
  /** Indicates if the buttons associated action is active. */
  active: boolean;
  activeIcon: ActionButtonIconComponent;
  activeText: string;
  inactiveIcon: ActionButtonIconComponent;
  inactiveText: string;
  sideInfo?: React.ReactNode;
  sidePanel?: SidePanelContent;
  sidePanelClassName?: string;
  onSidePanelToggle?: (isOpen: boolean) => void,
  size?: "auto",
  displayOnly?: boolean;
  className?: string;
  onClick?: () => void;
}

const ActionButton = (props: Props) => {
  const {
    active,
    activeIcon,
    activeText,
    inactiveIcon,
    inactiveText,
    className,
    sideInfo,
    sidePanel,
    size,
    displayOnly,
    onClick,
    onSidePanelToggle,
    sidePanelClassName,
  } = props;
  const Icon = active ? activeIcon : inactiveIcon;
  const ButtonElement = displayOnly ? "div" : "button";
  const { leftHandedUi } = useTvConfig();

  const displayText = active ? activeText : inactiveText

  const getOnClickHandler = (sidePanelClick: (event: React.MouseEvent<HTMLElement>) => void) => {
    if (displayOnly) return;
    return (event: React.MouseEvent<HTMLElement>) => {
      onClick?.()
      sidePanel && sidePanelClick(event)
    }
  }

  return (
    <div
      className={cx("ActionButton", className, { active, 'left-handed': leftHandedUi, [`size-${size}`]: size })}
    >
      {sideInfo && (
        <div className="side-info">
          {sideInfo}
        </div>
      )}
      <SidePanel
        content={sidePanel}
        onSidePanelToggle={onSidePanelToggle}
        sidePanelClassName={sidePanelClassName}
      >
        {({onClick: sidePanelClick, ref}) => {
          return (
            <ButtonElement
              className={cx("icon-container", {"button": !displayOnly})}
              type={displayOnly ? undefined : "button"}
              onClick={displayOnly ? undefined : getOnClickHandler(sidePanelClick)}
              ref={ref}
            >
              <Icon />
              <span className="sr-only">
                {displayText}
              </span>
            </ButtonElement>
          )
        }}
      </SidePanel>
    </div>
  );
};

type Children = (props: {onClick: (event: React.MouseEvent<HTMLElement>) => void, ref: React.Ref<any>}) => JSX.Element

const SidePanel = (
  {content, children, onSidePanelToggle, sidePanelClassName}: {
    content: SidePanelContent,
    onSidePanelToggle?: (isOpen: boolean) => void,
    sidePanelClassName?: string,
    children: Children
  }
): JSX.Element => {
  const currentOpenPopover = useCurrentOpenPopover()
  const { leftHandedUi, forceLandscape } = useTvConfig();
  const id = `action-button-side-panel-${useUID()}`
  const isOpen = id === currentOpenPopover

  const onSidePanelToggleRef = React.useRef(onSidePanelToggle)
  onSidePanelToggleRef.current = onSidePanelToggle

  useEffect(() => {
    onSidePanelToggleRef.current?.(isOpen)
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

  const safeInsetPadding = useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    const additionalPadding = parseInt(style.getPropertyValue('--overlay-edge-margin')) ?? 0
    return {
      top: (parseInt(style.getPropertyValue('--safe-inset-top')) || 0) + additionalPadding,
      left: (parseInt(style.getPropertyValue('--safe-inset-left')) || 0) + additionalPadding,
      right: (parseInt(style.getPropertyValue('--safe-inset-right')) || 0) + additionalPadding,
      bottom: (parseInt(style.getPropertyValue('--safe-inset-bottom')) || 0) + additionalPadding,
    };
  }, [forceLandscape])

  const processedClickEvents = useMemo(() => new WeakSet(), [])
  useEffect(() => {
    if (!isOpen) return;
    function handleEvent(event: Event) {
      if (!useCurrentOpenPopover.getState()) return; // The listeners should only be setup if a popover is open but we check to be safe
      const clickedActionButton = (event.target as HTMLElement).closest(".ActionButton")
      const clickedSidePanel = (event.target as HTMLElement).closest(".action-button-side-panel")
      if (useCurrentOpenPopover.getState() && !clickedSidePanel) {
        if (!clickedActionButton) {
          // We don't want any non-popover or action button elements receiving mouse/pointer events if the popover is open
          event.stopImmediatePropagation()
          event.stopPropagation()
          event.preventDefault()
        }
        if (event.type === "click" || event.type === "tap" || event.type === "touchend") {
          processedClickEvents.add(event)
          useCurrentOpenPopover.setState(null)
        }
      }
    }
    const eventTypes = ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "tap", "touchstart", "touchend", "touchcancel"] as const
    eventTypes.forEach(eventType => window.addEventListener(eventType, handleEvent, {capture: true}))
    return () => {
      eventTypes.forEach(eventType => window.removeEventListener(eventType, handleEvent, {capture: true}))
    }
  }, [isOpen])

  const renderChildren: Children = ({onClick, ref}) => children({
    onClick: (event) => {
      // We want to skip any events that have already been acted upon as part of the rootClose handling
      if (processedClickEvents.has(event.nativeEvent) || isOpen) return
      onClick?.(event)
    },
    ref
  })

  if (!content) return children({onClick: () => {}, ref: null})
  return (
    <OverlayTrigger
      trigger="click"
      placement={leftHandedUi ? "right" : "left"}
      overlay={
        <Popover
          className={cx("action-button-side-panel", sidePanelClassName, { 'left-handed': leftHandedUi })}
          id={id}
        >
          <div className="contents">
            {isOpenDelayedClose && (
              typeof content === "function"
                ? content({isOpen, close: () => useCurrentOpenPopover.setState(null)})
                : content
            )}
          </div>
        </Popover>
      }
      show={isOpen}
      onToggle={(shouldOpen) => {
        // We want to make sure to ignore any calls triggered by a rootClose event if the user has already clicked a
        // different action button and opened a different popover
        const currentlyOpen = id === useCurrentOpenPopover.getState()
        if (shouldOpen && !currentlyOpen) {
          useCurrentOpenPopover.setState(id)
        } else if (!shouldOpen && currentlyOpen) {
          useCurrentOpenPopover.setState(null)
        }
      }}
      popperConfig={{
        modifiers: [
          preventMisclickOnMoveModifier,
          preventChildOverflowModifier,
          applyArrowHideModifier,
          {
            name: 'preventOverflow',
            options: {
              padding: safeInsetPadding,
              tether: false,
            },
          },
        ],
      }}
    >
      {
        // OverlayTrigger's children appear to be typed wrong
        renderChildren as unknown as OverlayTriggerProps['children']
      }
    </OverlayTrigger>
  )
}

export default ActionButton;
