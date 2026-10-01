import React from "react"
import ActionButtonBase from "../ActionButtonBase";
import type { ActionButtonIconSource } from "../icons";
import cx from "classnames";
import { useFeedback } from "../../FeedbackOverlay";
import { getNextOption } from "../../../helpers";

type Option<Value extends string> = { readonly value: Value, readonly label: string, readonly shortLabel: string }

/**
 * Builds the title for a button that cycles through the options `useOptions` returns: the current option's
 * label when rendered in the stack, or `fallback` when rendered without a current option (e.g. in the
 * settings list, which uses the "inactive" state). Options come from a hook because labels can depend on
 * other settings.
 */
export function cycleOptionTitle<Value extends string>(
  name: string,
  useOptions: () => readonly Option<Value>[],
  fallback: string,
): React.FC<{state: string}> {
  return ({state}) => {
    const options = useOptions()
    const option = options.find(option => option.value === state)
    return <>{option ? option.label : fallback}</>
  }
}

/**
 * Shared shell for buttons that step through the options of a tvConfig setting. Each click selects the
 * next option (wrapping around) and briefly shows the newly selected option in the feedback overlay. The
 * current option's short label is shown beside the button unless it's `unlabelledValue`.
 */
export function CycleOptionActionButton<Value extends string>({
  id,
  name,
  options,
  value,
  unlabelledValue,
  onChange,
  icon,
  title,
}: {
  id: string,
  name: string,
  options: readonly Option<Value>[],
  value: Value,
  /** The option that needs no side label, typically the one that leaves playback unchanged */
  unlabelledValue: Value,
  onChange: (value: Value) => void,
  icon: ActionButtonIconSource,
  title: React.FC<{state: string}>,
}) {
  const { setFeedback } = useFeedback();
  const currentOption = options.find(option => option.value === value)

  return <ActionButtonBase
    state={value}
    icon={icon}
    title={title}
    className={cx(id, "hide-on-ui-hide")}
    sideInfo={value !== unlabelledValue && currentOption?.shortLabel}
    onClick={() => {
      const nextOption = getNextOption(options, value)
      if (!nextOption) return
      onChange(nextOption.value)
      setFeedback(nextOption.label, { displayDuration: 3000 })
    }}
  />
}
