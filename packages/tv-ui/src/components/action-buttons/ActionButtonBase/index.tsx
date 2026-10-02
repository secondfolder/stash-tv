import React, { useContext } from "react";
import cx from "classnames";
import "./ActionButtonBase.css";
import { useTvConfig } from "../../../store/tvConfig";
import { actionButtonIcons, ActionButtonIconSource } from "../icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { getLogger } from "@logtape/logtape";
import { PopoverPanel, PopoverPanelContent } from "../../PopoverPanel";

const logger = getLogger(["stash-tv", "ActionButtonBase"]);

/**
 * Set for the buttons in a folder (see ActionButtonStack's Folder).
 *
 * `iconOnly` renders just the button's icon, for the folder's preview. The buttons themselves are still rendered so
 * that the preview reflects their own logic: whether they show at all, their state and their icon.
 *
 * `buttonId` marks the button's icon so that the folder can match it with the same button's icon in the preview, to
 * animate between them.
 */
export const ActionButtonFolderContext = React.createContext<{ iconOnly: boolean, buttonId: string } | null>(null)

export type ActionButtonBaseProps<State extends string> = {
  /** Indicates if the buttons associated action is active. */
  state: State;
  icon: Record<State, ActionButtonIconSource> | ActionButtonIconSource;
  title: Record<string, string> | React.FC<{state: string, config?: Record<string, unknown>}> | string;
  sideInfo?: React.ReactNode;
  sidePanel?: PopoverPanelContent;
  sidePanelClassName?: string;
  onSidePanelToggle?: (isOpen: boolean) => void,
  size?: "auto",
  displayOnly?: boolean;
  className?: string;
  onClick?: (props: {toggleSidePanel: () => void}) => void;
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
  const folderContext = useContext(ActionButtonFolderContext);

  let iconElement = <ActionButtonIcon iconDefinition={icon} state={state} config={config} />
  if (folderContext) {
    iconElement = <div className="folder-icon" data-folder-button={folderContext.buttonId}>{iconElement}</div>
  }

  if (folderContext?.iconOnly) {
    return <div className={cx("ActionButton", "icon-only", className, `state-${state}`)}>{iconElement}</div>
  }

  const getOnClickHandler = (sidePanelClick: (event: React.MouseEvent<HTMLElement>) => void) => {
    if (displayOnly) return;
    return (event: React.MouseEvent<HTMLElement>) => {
      if (onClick) {
        onClick({toggleSidePanel: () => sidePanelClick(event)})
      } else if (sidePanel) {
        sidePanelClick(event)
      }
    }
  }

  return (
    <div
      className={cx("ActionButton", className, `state-${state}`, { 'left-handed': leftHandedUi, [`size-${size}`]: size })}
    >
      {sideInfo && (
        <div className="side-info">
          {sideInfo}
        </div>
      )}
      <PopoverPanel
        content={sidePanel}
        onToggle={onSidePanelToggle}
        className={sidePanelClassName}
      >
        {({onClick: sidePanelClick, ref}) => {
          return (
            <ButtonElement
              className={cx("icon-container", {"button": !displayOnly})}
              type={displayOnly ? undefined : "button"}
              onClick={displayOnly ? undefined : getOnClickHandler(sidePanelClick)}
              ref={ref}
            >
              {iconElement}
              <span className="sr-only">
                <ActionButtonTitle title={title} state={state} config={config} />
              </span>
            </ButtonElement>
          )
        }}
      </PopoverPanel>
    </div>
  );
};

export default ActionButtonBase;


export function ActionButtonIcon<State extends string>({
  iconDefinition,
  state,
  size = "standard",
  config,
  className: providedClassName,
}: {
  iconDefinition: ActionButtonBaseProps<State>["icon"],
  state: State,
  size?: "standard" | "small" | "max"
  config?: Record<string, unknown>,
  className?: string,
}) {
  const className = cx("ActionButtonIcon", `size-${size}`, providedClassName)

  let iconSource: ActionButtonIconSource | undefined

  try {
    if (config && 'iconId' in config && typeof config.iconId === "string" && config.iconId in actionButtonIcons) {
      iconSource = actionButtonIcons[config.iconId as keyof typeof actionButtonIcons].states[state]
    } else if (typeof iconDefinition === "function" || typeof iconDefinition === "string") {
      iconSource = iconDefinition
    } else if (iconDefinition && typeof iconDefinition === "object" && 'icon' in iconDefinition && 'iconName' in iconDefinition) {
      iconSource = iconDefinition
    } else if (iconDefinition && typeof iconDefinition === "object" && 'render' in iconDefinition) {
      iconSource = iconDefinition
    } else {
      iconSource = (iconDefinition as any)?.[state]
    }

    if (typeof iconSource === "function") {
      const IconComponent = iconSource
      return (
        <IconComponent
          className={className}
        />
      )
    } else if (typeof iconSource === "string") {
      // Data URL or string-based icon source
      return <img src={iconSource} className={className} alt="" />
    } else if (iconSource && typeof iconSource === "object" && 'icon' in iconSource && 'iconName' in iconSource) {
      return (
        <FontAwesomeIcon
          icon={iconSource}
          className={className}
        />
      )
    } else if (iconSource && typeof iconSource === "object" && 'render' in iconSource) {
      const IconComponent = iconSource as unknown as React.ComponentType<{className?: string}>
      return (
        <IconComponent
          className={className}
        />
      )
    } else {
      // All non-undefined source shapes are handled above; this check keeps
      // future additions to ActionButtonIconSource from silently falling through.
      if (iconSource !== undefined) iconSource satisfies never
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
