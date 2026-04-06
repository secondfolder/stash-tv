import {Options as PopperOptions} from '@popperjs/core';

type Props = {
  onOffscreen?: () => void,
  waitBeforeRegisteringOffscreen?: number
}

export const useOffscreenModifier = ({
  onOffscreen,
  waitBeforeRegisteringOffscreen = 1000
}: Props) => {
  const modifier: PopperOptions['modifiers'][number] = {
    name: "closeWhenOffscreen",
    enabled: true,
    phase: 'main',
    effect: ({state, instance}) => {
      const popperElement = state.elements.popper
      let timeoutId: ReturnType<typeof setTimeout> | null = null

      const observer = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) {
          timeoutId = setTimeout(() => {
            onOffscreen?.()
            instance.update()
          }, waitBeforeRegisteringOffscreen)
        } else {
          if (timeoutId !== null) {
            clearTimeout(timeoutId)
            timeoutId = null
          }
        }
      })

      observer.observe(popperElement)

      return () => {
        observer.disconnect()
        if (timeoutId !== null) clearTimeout(timeoutId)
      }
    },
  }
  return modifier
}
