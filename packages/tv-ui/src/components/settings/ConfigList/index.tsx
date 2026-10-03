import React, { ComponentProps, ReactNode } from "react";
import { Button } from "react-bootstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAdd, faGripVertical } from "@fortawesome/free-solid-svg-icons";
import cx from "classnames";
import DraggableList from "../../DraggableList";
import "./ConfigList.scss";

/** A reorderable list of config items in the settings panel, such as action buttons or channels */
export function ConfigList<Item>({ className, ...props }: ComponentProps<typeof DraggableList<Item>>) {
  return <DraggableList<Item> className={cx("ConfigList", className)} {...props} />
}

/** One row of a ConfigList */
export function ConfigListItem({
  className,
  dragHandleProps,
  icon,
  title,
  controls,
  children,
  ...props
}: {
  className?: string;
  /** From DraggableList's `getDragHandleProps()`, or undefined to disable dragging (e.g. when it's the only item) */
  dragHandleProps?: object;
  icon?: ReactNode;
  title: ReactNode;
  controls?: ReactNode;
  /** Rendered below the row, e.g. a folder's contents */
  children?: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "title">) {
  return <div className={cx("config-list-item", className)} {...props}>
    <div className="config-list-item-row">
      <div className="inline">
        <div className={cx("drag-handle", {disable: !dragHandleProps})} {...dragHandleProps}>
          {/* The same as the line layout editor's drag handle */}
          <FontAwesomeIcon className="drag-icon" icon={faGripVertical} />
          {icon}
        </div>
        {title}
      </div>
      {controls && <div className="inline controls">
        {controls}
      </div>}
    </div>
    {children}
  </div>
}

/** A button below a ConfigList for adding a new item to it */
export function AddConfigItemButton({
  className,
  variant = "link",
  icon,
  title,
  onClick,
}: {
  className?: string;
  /** "link" for a list with many kinds of item to add, "primary" to make a single add button stand out */
  variant?: "link" | "primary";
  icon?: ReactNode;
  title: ReactNode;
  onClick: () => void;
}) {
  return <Button
    variant={variant}
    className={cx("add-config-item", `add-config-item-${variant}`, className)}
    onClick={onClick}
  >
    <FontAwesomeIcon icon={faAdd} />
    <div className="info">
      {icon}
      {title}
    </div>
  </Button>
}
