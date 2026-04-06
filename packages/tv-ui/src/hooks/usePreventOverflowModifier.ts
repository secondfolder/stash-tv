import { useCallback, useEffect, useMemo } from "react"
import { objectEntries } from "ts-extras"
import {Options as PopperOptions} from '@popperjs/core';

/*
This is mostly to include safe area insets in the padding used to calculate overflow
*/

type Padding = {
  top?: number,
  left?: number,
  right?: number,
  bottom?: number,
}

export function usePreventOverflowModifier({
  boundary,
  accountForKeyboard = false,
  boundaryPadding = {
    top: 0,
    right: 0,
    bottom: 50, // Avoid overlapping with progress bar
    left: 0,
  },
  rootBoundaryPadding = {
    top: 10,
    right: 10,
    bottom: 10,
    left: 10,
  },
}: {
  boundary?: Element
  accountForKeyboard?: boolean
  boundaryPadding?: Padding,
  rootBoundaryPadding?: Padding
}) {
  const getPadding = useCallback(() => {
    const viewportStyle = getComputedStyle(document.documentElement);

    // Detect how much of the layout viewport is obscured by the visual viewport
    // (e.g. iOS on-screen keyboard shrinks the visual viewport but not the layout viewport)
    const visualViewport = accountForKeyboard ? window.visualViewport : null
    const visualViewportObscured = visualViewport ? {
      top: Math.max(0, visualViewport.offsetTop),
      left: Math.max(0, visualViewport.offsetLeft),
      right: Math.max(0, window.innerWidth - (visualViewport.offsetLeft + visualViewport.width)),
      bottom: Math.max(0, window.innerHeight - (visualViewport.offsetTop + visualViewport.height)),
    } : { top: 0, left: 0, right: 0, bottom: 0 }

    const padding = {
      top:
        Math.max(
          Math.max(
            (parseInt(viewportStyle.getPropertyValue('--safe-inset-top')) || 0),
            visualViewportObscured.top,
          ),
          (boundaryPadding?.top ?? 0),
        )
        + (rootBoundaryPadding?.top ?? 0),
      left:
        Math.max(
          Math.max(
            (parseInt(viewportStyle.getPropertyValue('--safe-inset-left')) || 0),
            visualViewportObscured.left,
          ),
          (boundaryPadding?.left ?? 0),
        )
        + (rootBoundaryPadding?.left ?? 0),
      right: Math.max(
          Math.max(
            (parseInt(viewportStyle.getPropertyValue('--safe-inset-right')) || 0),
            visualViewportObscured.right,
          ),
          (boundaryPadding?.right ?? 0),
        )
        + (rootBoundaryPadding?.right ?? 0),
      bottom: Math.max(
          Math.max(
            (parseInt(viewportStyle.getPropertyValue('--safe-inset-bottom')) || 0),
            visualViewportObscured.bottom
          ),
          (boundaryPadding?.bottom ?? 0),
        )
        + (rootBoundaryPadding?.bottom ?? 0),
    }

    return padding
  }, [boundaryPadding, rootBoundaryPadding, accountForKeyboard])
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
    if (accountForKeyboard) {
      window.visualViewport?.addEventListener("resize", updatePadding)
      window.visualViewport?.addEventListener("scroll", updatePadding)
    }
    return () => {
      window.removeEventListener("resize", updatePadding)
      if (accountForKeyboard) {
        window.visualViewport?.removeEventListener("resize", updatePadding)
        window.visualViewport?.removeEventListener("scroll", updatePadding)
      }
    }
  }, [updatePadding, accountForKeyboard])

  const modifier = useMemo((): PopperOptions['modifiers'][number] => ({
    name: 'preventOverflow',
    options: {
      padding: padding,
      tether: false,
      boundary,
      rootBoundary: "document",
    },
    effect: ({instance}) => {
      if (!accountForKeyboard) return

      const update = () => instance.update()

      // Fallback for environments where visualViewport events don't fire reliably (e.g. iOS Safari):
      // keyboard open/close is tied to focus, so re-run positioning after focus changes.
      // A delay is needed to let the keyboard finish its open/close animation first.
      let keyboardTimer: ReturnType<typeof setTimeout> | undefined
      const onFocusIn = () => { clearTimeout(keyboardTimer); keyboardTimer = setTimeout(update, 300) }
      const onFocusOut = () => { clearTimeout(keyboardTimer); keyboardTimer = setTimeout(update, 100) }
      window.addEventListener("focusin", onFocusIn)
      window.addEventListener("focusout", onFocusOut)

      return () => {
        window.removeEventListener("focusin", onFocusIn)
        window.removeEventListener("focusout", onFocusOut)
        clearTimeout(keyboardTimer)
      }
    }
  }), [padding, boundary, accountForKeyboard])

  return modifier
}


