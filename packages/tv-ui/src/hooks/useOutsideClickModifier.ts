import {Options as PopperOptions} from '@popperjs/core';

type Props = {
  onOutsideClick?: () => void,
}

export const useOutsideClickModifier = ({onOutsideClick}: Props): PopperOptions['modifiers'][number] => ({
  name: 'outsideClick',
  phase: 'main',
  enabled: true,
  effect({state}) {
    const {popper} = state.elements

    const backdrop = document.createElement('div')
    let backdropCss = `position: fixed; inset: 0;`
    const popperZIndex = parseInt(window.getComputedStyle(popper).zIndex)
    if (!isNaN(popperZIndex)) {
      backdropCss += ` z-index: ${popperZIndex - 1}`
    }
    backdrop.style.cssText = backdropCss
    popper.before(backdrop)

    // Only a press that also started on the backdrop counts as an outside click. Otherwise a press inside the popper can
    // end up clicking the backdrop if the popper moves before it's released: on iOS, pressing on a label in a side panel
    // closes the on-screen keyboard, the panel moves back down, and the click lands where it used to be.
    let pressStartedOnBackdrop = false
    const pointerDownHandler = (event: PointerEvent) => {
      pressStartedOnBackdrop = event.target === backdrop
    }
    const backdropClickHandler = () => {
      if (pressStartedOnBackdrop) onOutsideClick?.()
      pressStartedOnBackdrop = false
    }

    window.addEventListener("pointerdown", pointerDownHandler, { capture: true })
    backdrop.addEventListener("click", backdropClickHandler)

    return () => {
      window.removeEventListener("pointerdown", pointerDownHandler, { capture: true })
      backdrop.removeEventListener("click", backdropClickHandler)
      backdrop.remove()
    };
  },
})
