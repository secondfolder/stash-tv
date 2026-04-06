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

    const backdropClickHandler = () => {
      onOutsideClick?.()
    }

    backdrop.addEventListener("click", backdropClickHandler)

    return () => {
      backdrop.removeEventListener("click", backdropClickHandler)
      backdrop.remove()
    };
  },
})
