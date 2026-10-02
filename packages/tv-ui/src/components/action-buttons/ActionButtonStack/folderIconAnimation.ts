const duration = 100
const easing = "cubic-bezier(0.4, 0, 0.2, 1)"

type Box = Pick<DOMRect, "x" | "y" | "width" | "height">

/** The transform that moves and scales an element whose box is `from` onto `to` */
function transformOnto(from: Box, to: Box) {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2)
  const dy = to.y + to.height / 2 - (from.y + from.height / 2)
  return `translate(${dx}px, ${dy}px) scale(${to.width / from.width})`
}

/**
 * Animate each icon in an open folder to its place in the open folder or in the folder's preview, starting from the
 * preview or from wherever it is now (part way there if it's already animating). Icons are matched to their preview by
 * their `data-folder-button`.
 *
 * Only the open folder's icons move, never the preview's: the preview is in the action button stack, which scrolls, so
 * icons moving across it would make it scrollable while they did (showing a scrollbar in Firefox).
 *
 * Resolves once they're all there, and never if they're animated again before they get there. Where the user prefers
 * reduced motion, or the browser can't animate them (e.g. jsdom), they go straight there and it resolves straight away.
 */
export function animateFolderIcons(
  openFolder: HTMLElement,
  preview: HTMLElement,
  { from, to }: { from: "preview" | "current", to: "open" | "preview" },
): Promise<void> {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  const previewIcons = new Map(
    [...preview.querySelectorAll<HTMLElement>(".folder-icon")].map(icon => [icon.dataset.folderButton, icon])
  )
  const animations = [...openFolder.querySelectorAll<HTMLElement>(".folder-icon")].flatMap(icon => {
    const previewIcon = previewIcons.get(icon.dataset.folderButton)
    if (!previewIcon || typeof icon.animate !== "function") return []

    const current = icon.getBoundingClientRect()
    icon.getAnimations().forEach(animation => animation.cancel())
    if (reduceMotion) return []
    const own = icon.getBoundingClientRect()
    const previewBox = previewIcon.getBoundingClientRect()

    return [icon.animate(
      [
        { transform: transformOnto(own, from === "preview" ? previewBox : current) },
        { transform: transformOnto(own, to === "preview" ? previewBox : own) },
      ],
      // Holds the icons in the preview once there, until the open folder is gone
      { duration, easing, fill: "forwards" },
    )]
  })
  // An animation that's cancelled (because the icons were animated again) never finishes
  return new Promise(resolve => {
    Promise.all(animations.map(animation => animation.finished)).then(() => resolve(), () => {})
  })
}
