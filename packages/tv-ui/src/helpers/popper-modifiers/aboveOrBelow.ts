import { Options as PopperOptions } from '@popperjs/core';
import { detectOverflow } from '@popperjs/core';

/**
 * Places the popper above what it's attached to if it fits there, otherwise below if it fits there, otherwise on
 * whichever side has more room. Popper's own `flip` falls back to the first placement when neither fits, however
 * little room it has. Room is measured within the preventOverflow modifier's boundary and padding (so as it keeps the
 * popper clear of e.g. the progress bar).
 */
export const aboveOrBelowModifier: PopperOptions['modifiers'][number] = {
  name: 'aboveOrBelow',
  enabled: true,
  phase: 'main',
  requiresIfExists: ['offset'],
  fn({ state }) {
    const preventOverflowOptions = state.orderedModifiers.find(mod => mod.name === "preventOverflow")?.options
    const overflowOptions = {
      boundary: preventOverflowOptions?.boundary,
      rootBoundary: preventOverflowOptions?.rootBoundary,
      padding: preventOverflowOptions?.padding,
    }
    // How far it'd stick out past each side, placed there (> 0 if it doesn't fit)
    const overflowAbove = detectOverflow(state, { ...overflowOptions, placement: 'top' }).top
    const overflowBelow = detectOverflow(state, { ...overflowOptions, placement: 'bottom' }).bottom
    let placement: 'top' | 'bottom'
    if (overflowAbove <= 0) placement = 'top'
    else if (overflowBelow <= 0) placement = 'bottom'
    else placement = overflowAbove <= overflowBelow ? 'top' : 'bottom'
    if (state.placement !== placement) {
      state.placement = placement
      state.reset = true
    }
  },
}
