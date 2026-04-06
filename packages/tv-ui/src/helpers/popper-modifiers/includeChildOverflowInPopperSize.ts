import { getOverflowAmount } from "../getOverflowAmount";
import { Options as PopperOptions } from '@popperjs/core';

export const includeChildOverflowInPopperSizeModifier: PopperOptions['modifiers'][number] = {
  name: 'includeChildOverflowInPopperSize',
  enabled: true,
  phase: "beforeRead",
  fn: ({state}) => {
    const overflowAmount = getOverflowAmount(state.elements.popper)
    state.rects.popper.height += overflowAmount.top + overflowAmount.bottom
    state.rects.popper.width += overflowAmount.left + overflowAmount.right
  },
  effect: ({state, instance}) => {
    const popperElement = state.elements.popper
    let previousPopperHeightWithOverflow = popperElement.clientHeight
    let previousPopperWidthWithOverflow = popperElement.clientWidth

    // I haven't tested this assumption but I'm guessing it's more performant to check if the overflow amount has changed
    // by comparing the height and width of the popper with overflow included, rather than traversing the children
    // of the popper to find out how much overflow there is on each side.
    const overflowAmountChanged = () => {
      const heightWithOverflow = popperElement.scrollHeight
      const widthWithOverflow = popperElement.scrollWidth
      const changed = (heightWithOverflow !== previousPopperHeightWithOverflow) || (widthWithOverflow !== previousPopperWidthWithOverflow)
      previousPopperHeightWithOverflow = heightWithOverflow
      previousPopperWidthWithOverflow = widthWithOverflow
      return changed
    }

    const intervalId = setInterval(() => {
      if (overflowAmountChanged()) {
        instance.forceUpdate()
      }
    }, 100)
    return () => {
      clearInterval(intervalId);
    }
  },
}
