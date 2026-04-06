import { useCallback, useEffect, useMemo } from "react"
import { objectEntries } from "ts-extras"
import {Options as PopperOptions} from '@popperjs/core';

/*
This is mostly to include safe area insets in the padding used to calculate overflow
*/

export function usePreventOverflowModifier({
  boundary,
  additionalPadding,
}: {
  boundary?: Element
  additionalPadding?: {
    top?: number,
    left?: number,
    right?: number,
    bottom?: number,
  }
}) {
  const getPadding = useCallback(() => {
    const viewportStyle = getComputedStyle(document.documentElement);

    const padding = {
      top: (parseInt(viewportStyle.getPropertyValue('--safe-inset-top')) || 0)
        + (additionalPadding?.top ?? 0),
      left: (parseInt(viewportStyle.getPropertyValue('--safe-inset-left')) || 0)
        + (additionalPadding?.left ?? 0),
      right: (parseInt(viewportStyle.getPropertyValue('--safe-inset-right')) || 0)
        + (additionalPadding?.right ?? 0),
      bottom: (parseInt(viewportStyle.getPropertyValue('--safe-inset-bottom')) || 0)
        +  (additionalPadding?.bottom ?? 0),
    }

    return padding
  }, [additionalPadding])
  // To make sure popper.js has access to the most up-to-date padding values we pass it an object and then update the values
  // for that reference directly rather than creating a new object and have react tear down and re-create the popper.js instance
  const padding = useMemo(() => getPadding(), [])
  const updatePadding = useCallback(() => {
    const updatedPadding = getPadding()
    for (const [key, value] of objectEntries(updatedPadding)) {
      padding[key] = value
    }
  }, [padding, getPadding])

  useEffect(() => {
    window.addEventListener("resize", updatePadding)
    return () => {
      window.removeEventListener("resize", updatePadding)
    }
  }, [updatePadding])

  const modifier = useMemo((): PopperOptions['modifiers'][number] => ({
    name: 'preventOverflow',
    options: {
      padding: padding,
      tether: false,
      boundary,
    },
  }), [padding, boundary])

  return modifier
}


