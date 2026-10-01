import { Options as PopperOptions } from '@popperjs/core';

/**
 * Re-position the popper whenever its size changes, e.g. when a side panel swaps a short list for a long form. Popper
 * otherwise only re-positions on scroll and window resize, leaving a popper that grew hanging off screen.
 */
export const updateOnResizeModifier: PopperOptions['modifiers'][number] = {
  name: 'updateOnResize',
  enabled: true,
  phase: 'main',
  fn: () => {},
  effect: ({ state, instance }) => {
    const observer = new ResizeObserver(() => instance.update())
    observer.observe(state.elements.popper)
    // The panel's contents can change size without the panel itself doing so, e.g. once it's at its maximum size
    for (const child of state.elements.popper.children) observer.observe(child)
    return () => observer.disconnect()
  },
}
