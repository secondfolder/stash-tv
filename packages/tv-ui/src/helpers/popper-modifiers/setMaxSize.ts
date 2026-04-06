import {Options as PopperOptions} from '@popperjs/core';
import { detectOverflow } from '@popperjs/core';
import getBasePlacement from '@popperjs/core/dist/esm/utils/getBasePlacement';
import getMainAxisFromPlacement from '@popperjs/core/dist/esm/utils/getMainAxisFromPlacement';
export const setMaxSizeModifier: PopperOptions['modifiers'][number] = {
  name: 'setMaxSize',
  enabled: true,
  phase: 'beforeWrite',
  fn({state}) {
    const preventOverflowOptions = state.orderedModifiers.find(mod => mod.name === "preventOverflow")?.options
    if (!preventOverflowOptions) {
      console.warn("preventOverflow options not found")
      return
    }
    const offsetOptions = state.orderedModifiers.find(mod => mod.name === "offset")?.options
    let offsetDistance = 0
    if (typeof offsetOptions?.offset === "function") {
      const [_, distance] = offsetOptions.offset(state)
      offsetDistance = distance
    } else if (Array.isArray(offsetOptions?.offset)) {
      const [_, distance] = offsetOptions.offset
      offsetDistance = distance
    }
    const {
      boundary,
      rootBoundary,
      altBoundary,
      padding,
    } = preventOverflowOptions;

    const overflow = detectOverflow(state, {
      boundary,
      rootBoundary,
      padding,
      altBoundary,
    });

    const basePlacement = getBasePlacement(state.placement);
    // mainAxis is perpendicular to the placement (so placement of "left" would have the main axis "y")
    const mainAxis = getMainAxisFromPlacement(basePlacement);
    let width
    let height
    console.log("mainAxis", mainAxis)
    if (mainAxis === "x") {
      const availableSpaceSide = basePlacement
      height = (overflow[availableSpaceSide] * -1) + state.rects.popper.height + offsetDistance
      width = (overflow["left"] * -1) + (overflow["right"] * -1) + state.rects.popper.width
    } else if (mainAxis === "y") {
      const availableSpaceSide = basePlacement
      height = (overflow["top"] * -1) + (overflow["bottom"] * -1) + state.rects.popper.height
      width = (overflow[availableSpaceSide] * -1) + state.rects.popper.width
    } else {
      throw new Error(`Unexpected mainAxis "${mainAxis}"`)
    }
    const availableSpace = {
      height,
      width,
    }

    state.styles.popper = {
      ...state.styles.popper,
      maxWidth: `${availableSpace.width}px`,
      maxHeight: `${availableSpace.height}px`
    };
  }
}
