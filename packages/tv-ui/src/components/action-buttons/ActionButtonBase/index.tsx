import React, {
  useEffect,
  useMemo,
} from "react";
import cx from "classnames";
import "./ActionButtonBase.css";
import { useUID } from "react-uid";
import { OverlayTrigger, Popover } from "react-bootstrap";
import { create } from "zustand";
import { useTvConfig } from "../../../store/tvConfig";
import { OverlayTriggerProps } from "react-bootstrap/esm/OverlayTrigger";
import { includeChildOverflowInPopperSizeModifier } from "../../../helpers/popper-modifiers/includeChildOverflowInPopperSize";
import { applyArrowHideModifier } from "../../../helpers/popper-modifiers/applyArrowHide";
import { actionButtonIcons, ActionButtonIconSource } from "../icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { getLogger } from "@logtape/logtape";
import { setMaxSizeModifier } from "../../../helpers/popper-modifiers/setMaxSize";
import { useOffscreenModifier } from "../../../hooks/useOffscreenModifier";
import { useOutsideClickModifier } from "../../../hooks/useOutsideClickModifier";

const logger = getLogger(["stash-tv", "ActionButtonBase"]);

export const useCurrentOpenPopover = create<null | string>(() => (null))

export type SidePanelContent = React.ReactNode | ((props: {isOpen: boolean, close: () => void}) => React.ReactNode)

export type ActionButtonBaseProps<State extends string> = {
  /** Indicates if the buttons associated action is active. */
  state: State;
  icon: Record<State, ActionButtonIconSource> | ActionButtonIconSource;
  title: Record<string, string> | React.FC<{state: string, config?: Record<string, unknown>}> | string;
  sideInfo?: React.ReactNode;
  sidePanel?: SidePanelContent;
  sidePanelClassName?: string;
  onSidePanelToggle?: (isOpen: boolean) => void,
  size?: "auto",
  displayOnly?: boolean;
  className?: string;
  onClick?: () => void;
  config?: Record<string, unknown>;
}

const ActionButtonBase = <State extends string>(props: ActionButtonBaseProps<State>) => {
  const {
    state,
    icon,
    title,
    className,
    sideInfo,
    sidePanel,
    size,
    displayOnly,
    onClick,
    onSidePanelToggle,
    sidePanelClassName,
    config,
  } = props;
  const ButtonElement = displayOnly ? "div" : "button";
  const { leftHandedUi } = useTvConfig();

  const getOnClickHandler = (sidePanelClick: (event: React.MouseEvent<HTMLElement>) => void) => {
    if (displayOnly) return;
    return (event: React.MouseEvent<HTMLElement>) => {
      onClick?.()
      sidePanel && sidePanelClick(event)
    }
  }

  return (
    <div
      className={cx("ActionButton", className, { state, 'left-handed': leftHandedUi, [`size-${size}`]: size })}
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
              <ActionButtonIcon iconDefinition={icon} state={state} config={config} />
              <span className="sr-only">
                <ActionButtonTitle title={title} state={state} config={config} />
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

  const outsideClickModifier = useOutsideClickModifier({
    onOutsideClick: () => useCurrentOpenPopover.setState(null)
  })

  const offscreenModifier = useOffscreenModifier({
    onOffscreen: () => useCurrentOpenPopover.setState(null)
  })

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
          includeChildOverflowInPopperSizeModifier,
          applyArrowHideModifier,
          {
            name: 'preventOverflow',
            options: {
              padding: safeInsetPadding,
              tether: false,
            },
          },
          setMaxSizeModifier,
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

export default ActionButtonBase;


export function ActionButtonIcon<State extends string>({
  iconDefinition,
  state,
  size = "standard",
  config,
}: {
  iconDefinition: ActionButtonBaseProps<State>["icon"],
  state: State,
  size?: "standard" | "small" | "max"
  config?: Record<string, unknown>,
}) {
  const className = cx("ActionButtonIcon", `size-${size}`)

  let iconSource: ActionButtonIconSource | undefined

  try {
    if (config && 'iconId' in config && typeof config.iconId === "string" && config.iconId in actionButtonIcons) {
      iconSource = actionButtonIcons[config.iconId as keyof typeof actionButtonIcons].states[state]
    } else if (typeof iconDefinition === "function") {
      iconSource = iconDefinition
    } else if ('icon' in iconDefinition && 'iconName' in iconDefinition) {
      iconSource = iconDefinition
    } else if ('render' in iconDefinition) {
      iconSource = iconDefinition
    } else {
      iconSource = iconDefinition[state]
    }

    if (typeof iconSource === "function") {
      const IconComponent = iconSource
      return (
        <IconComponent
          className={className}
        />
      )
    } else if ('icon' in iconSource && 'iconName' in iconSource) {
      return (
        <FontAwesomeIcon
          icon={iconSource}
          className={className}
        />
      )
    } else if ('render' in iconSource) {
      const IconComponent = iconSource as unknown as React.ComponentType<{className?: string}>
      return (
        <IconComponent
          className={className}
        />
      )
    } else {
      iconSource satisfies never
      logger.error("Unable to determine icon for action button {*}", {iconDefinition, iconSource, state})
    }
  } catch(error) {
    logger.error("Error rendering action button icon {*}", {error, iconDefinition, state})
  }
  return <div className={className}>?</div>
}


export const ActionButtonTitle = <State extends string>({
  title,
  state,
  config,
}: {
  title: ActionButtonBaseProps<State>["title"],
  state: State,
  config?: Record<string, unknown>,
}) => {
  if (typeof title === "string") {
    return <>{title}</>
  } else if (typeof title === "function") {
    const Title = title
    return <Title state={state} config={config} />
  } else if (state in title) {
    return <>{title[state]}</>
  }
  logger.error("Unable to determine title for action button", {title, state})
  return <strong>"?"</strong>
}
