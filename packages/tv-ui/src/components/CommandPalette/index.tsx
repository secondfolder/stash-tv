import React, { ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "react-bootstrap";
import { XLg } from "react-bootstrap-icons";
import type { ButtonVariant } from "react-bootstrap/esm/types";
import cx from "classnames";
import { Modal } from "../containers/Modal";
import "./CommandPalette.scss";

export type CommandPaletteItem = {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
};

export type CommandPaletteAction = {
  label: string;
  onClick: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Whether the input is focused again after the action, to carry on typing (e.g. after clearing it) */
  focusInput?: boolean;
};

export type CommandPaletteProps = {
  show: boolean;
  /** Called on Escape or a click outside it */
  onClose: () => void;
  /** The palette's accessible name */
  label: string;
  /** Shown in the input while it's empty */
  placeholder: string;
  /** Text mode (when `inputContent` isn't given): the text field's value */
  query?: string;
  onQueryChange?: (query: string) => void;
  /**
   * Custom contents for the input in place of a text field (e.g. keys pressed), in a focusable `role="textbox"`. Empty
   * (null, false or an empty array) shows the placeholder
   */
  inputContent?: ReactNode;
  /** Every key pressed in the input, before the palette's own handling (moving through the items). Call `preventDefault()` to stop that */
  onInputKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
  /** Every key let go of in the input */
  onInputKeyUp?: (event: React.KeyboardEvent<HTMLElement>) => void;
  /** Read-only content after the input's own */
  inputSuffix?: ReactNode;
  /** Results under the input, already filtered by the caller. ↑ and ↓ move between them, Enter or a click picks one */
  items?: CommandPaletteItem[];
  /** Shown when `items` is empty */
  emptyText?: ReactNode;
  /** Notes under the bar */
  status?: ReactNode;
  /** Buttons at the end of the bar */
  actions?: CommandPaletteAction[];
  /** Whether a backdrop fades in behind it, slightly blurring and darkening the page. A click outside closes it either way */
  backdrop?: boolean;
  className?: string;
};

/** Gives each palette's elements ids of their own (React 17 has no useId) */
let paletteCount = 0;

const isEmpty = (content: ReactNode) =>
  content === null || content === undefined || content === false || content === "" || (Array.isArray(content) && content.length === 0);

/**
 * A token in a palette's custom input (e.g. a key typed). Given `onRemove`, it's removed by clicking it: hovering over
 * it darkens it and shows an ×. Clicking it leaves focus in the input, to carry on typing, and Tab skips it. Without
 * `onRemove` it's fixed, looking the same but with nothing on hover.
 */
export function CommandPaletteToken({ children, removeLabel, onRemove, className }: {
  children: ReactNode;
  className?: string;
} & (
  | {
    /** The accessible name of clicking it, e.g. "Remove g" */
    removeLabel: string;
    onRemove: () => void;
  }
  | { removeLabel?: undefined, onRemove?: undefined }
)) {
  if (!onRemove) {
    return <span className={cx("command-palette-token", "fixed", "badge", "badge-secondary", "tag-item", className)}>
      <span className="command-palette-token-label">{children}</span>
    </span>;
  }
  return <button
    type="button"
    className={cx("command-palette-token", "badge", "badge-secondary", "tag-item", className)}
    aria-label={removeLabel}
    tabIndex={-1}
    // Focus stays in the input
    onMouseDown={(event) => event.preventDefault()}
    onClick={onRemove}
  >
    <span className="command-palette-token-label">{children}</span>
    <span className="command-palette-token-remove" aria-hidden><XLg /></span>
  </button>;
}

/**
 * A command palette: a bar dropping down from the top of the screen, holding an input and buttons, with optional
 * results to pick from and notes in a panel under it. Its input is a text field by default, or any content the caller
 * renders (e.g. keys recorded, as `CommandPaletteToken`s), whose key presses the caller handles.
 *
 * @see docs/keyboard-shortcuts.md § "The command palette"
 */
export function CommandPalette({
  show,
  onClose,
  label,
  placeholder,
  query = "",
  onQueryChange,
  inputContent,
  onInputKeyDown,
  onInputKeyUp,
  inputSuffix,
  items,
  emptyText,
  status,
  actions,
  backdrop = true,
  className,
}: CommandPaletteProps) {
  const [id] = useState(() => `CommandPalette-${++paletteCount}`);
  const inputRef = useRef<HTMLInputElement & HTMLDivElement>(null);
  const [highlighted, setHighlighted] = useState(0);
  const customInput = inputContent !== undefined;
  const selectable = items?.filter((item) => !item.disabled) ?? [];
  const highlightedItem = selectable[Math.min(highlighted, selectable.length - 1)];

  // The first result is highlighted whenever the results change
  const itemIds = items?.map((item) => item.id).join("\n");
  useEffect(() => setHighlighted(0), [itemIds]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    onInputKeyDown?.(event);
    if (event.defaultPrevented || !selectable.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlighted((index) => (Math.min(index, selectable.length - 1) + step + selectable.length) % selectable.length);
    } else if (event.key === "Enter" && highlightedItem) {
      event.preventDefault();
      highlightedItem.onSelect();
    }
  };

  // Only shown with something in it, so the palette is just its bar otherwise
  const showPanel = !isEmpty(status) || (items !== undefined && (items.length > 0 || !isEmpty(emptyText)));

  /**
   * Keeps Tab within the palette, going round from its last control to its first (and the other way with Shift), so
   * it never reaches the page behind. (react-bootstrap's `enforceFocus` only brings focus back once it's left.)
   */
  const trapFocus = (event: React.KeyboardEvent<HTMLElement>) => {
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
      "input, button, textarea, select, [tabindex]"
    )].filter((element) => element.tabIndex >= 0 && !element.matches(":disabled"));
    if (!focusable.length) return;
    const index = focusable.findIndex((element) => element === document.activeElement);
    // Within the palette, Tab moves as usual until it would leave it
    if (index !== -1 && index !== (event.shiftKey ? 0 : focusable.length - 1)) return;
    event.preventDefault();
    focusable[event.shiftKey ? focusable.length - 1 : 0].focus();
  };

  const optionId = (item: CommandPaletteItem) => `${id}-option-${item.id}`;
  const inputProps = {
    ref: inputRef,
    className: "command-palette-input-field",
    "aria-label": label,
    "aria-controls": items ? `${id}-listbox` : undefined,
    "aria-activedescendant": highlightedItem ? optionId(highlightedItem) : undefined,
    onKeyDown: handleKeyDown,
    onKeyUp: onInputKeyUp,
  };

  return <Modal
    show={show}
    onHide={onClose}
    onEntered={() => inputRef.current?.focus()}
    aria-label={label}
    className={cx("CommandPalette", className)}
    // Without its backdrop it still has one, but unseen, as that's what closes it on a click outside
    backdropClassName={cx("CommandPalette-backdrop", { "unseen": !backdrop })}
    // Escape is handled below, by its `key`: react-bootstrap only knows it by the legacy `keyCode`
    keyboard={false}
  >
    <div
      className="command-palette"
      onKeyDown={(event) => {
        if (event.defaultPrevented) return;
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        } else if (event.key === "Tab") {
          trapFocus(event);
        }
      }}
    >
      <div className="command-palette-bar form-control">
        {customInput
          ? <div {...inputProps} role="textbox" tabIndex={0} aria-placeholder={placeholder} aria-readonly>
            {isEmpty(inputContent) ? <span className="command-palette-placeholder">{placeholder}</span> : inputContent}
          </div>
          : <input
            {...inputProps}
            type="text"
            role={items ? "combobox" : undefined}
            aria-expanded={items ? true : undefined}
            placeholder={placeholder}
            value={query}
            onChange={(event) => onQueryChange?.(event.target.value)}
            autoFocus
          />}
        {!isEmpty(inputSuffix) && <span className="command-palette-input-suffix">{inputSuffix}</span>}
        {actions?.map((action) => (
          <Button
            key={action.label}
            className="command-palette-action"
            size="sm"
            variant={action.variant ?? "secondary"}
            disabled={action.disabled}
            onClick={() => {
              action.onClick();
              if (action.focusInput) inputRef.current?.focus();
            }}
          >
            {action.label}
          </Button>
        ))}
      </div>
      {showPanel && <div className="command-palette-panel">
        {!isEmpty(status) && <div className="command-palette-status" role="status">{status}</div>}
        {items && (items.length
          ? <ul className="command-palette-items" role="listbox" id={`${id}-listbox`} aria-label={label}>
            {items.map((item) => (
              <li
                key={item.id}
                id={optionId(item)}
                role="option"
                aria-selected={item === highlightedItem}
                aria-disabled={item.disabled || undefined}
                className={cx("command-palette-item", { highlighted: item === highlightedItem, disabled: item.disabled })}
                onMouseMove={() => !item.disabled && setHighlighted(selectable.indexOf(item))}
                onClick={() => !item.disabled && item.onSelect()}
              >
                <span className="command-palette-item-label">{item.label}</span>
                {item.description && <span className="command-palette-item-description text-muted">{item.description}</span>}
              </li>
            ))}
          </ul>
          : <div className="command-palette-empty text-muted">{emptyText}</div>)}
      </div>}
    </div>
  </Modal>;
}
