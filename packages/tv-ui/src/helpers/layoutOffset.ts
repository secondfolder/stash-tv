/**
 * Where `element` is laid out relative to `ancestor` (its padding box), which must be positioned. From offsets rather
 * than `getBoundingClientRect`, so it's where the element is laid out, not where a transform shows it (e.g. partway
 * through framer-motion sliding it, or rotated by forced landscape), allowing for anything between them being scrolled.
 */
export function layoutOffset(element: HTMLElement, ancestor: HTMLElement) {
  let left = 0;
  let top = 0;
  let current: HTMLElement | null = element;
  while (current && current !== ancestor) {
    left += current.offsetLeft;
    top += current.offsetTop;
    const parent = current.offsetParent as HTMLElement | null;
    for (let scrolled: HTMLElement | null = current.parentElement; scrolled && scrolled !== ancestor; scrolled = scrolled.parentElement) {
      left -= scrolled.scrollLeft;
      top -= scrolled.scrollTop;
      if (scrolled === parent) break;
    }
    current = parent;
  }
  return { left, top };
}

/**
 * How big `box` is laid out, to the fraction of a pixel: `offsetWidth` and `offsetHeight` are rounded (a copy of a
 * line of text a fraction narrower than it wraps, and a box held at a rounded height shrinks a fraction). From its
 * bounding box, unless that's been scaled or rotated (e.g. by forced landscape, swapping its sides), when the rounded
 * size will have to do.
 */
export function layoutSize(box: HTMLElement) {
  const rect = box.getBoundingClientRect();
  const matches = Math.abs(rect.width - box.offsetWidth) < 1 && Math.abs(rect.height - box.offsetHeight) < 1;
  return matches ? { width: rect.width, height: rect.height } : { width: box.offsetWidth, height: box.offsetHeight };
}
