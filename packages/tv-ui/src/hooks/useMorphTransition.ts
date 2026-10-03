import { RefObject, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { layoutOffset, layoutSize } from "../helpers/layoutOffset";

/** Marks an element as one that morphs into the element with the same key after the change (see useMorphTransition) */
export const morphKeyAttribute = "data-morph-key";
/**
 * Marks the unit framing the rest (e.g. a background), which looks the same before and after. It's stretched to its
 * new size rather than crossfaded (two copies of something translucent fading into each other look darker where they
 * overlap), and nothing in the root shows outside it as it morphs, so what's new is revealed as it grows and what's
 * going is hidden as it shrinks, rather than showing beyond it.
 */
export const morphFrameAttribute = "data-morph-frame";

/** Marks, in a copy, a unit inside the unit copied, by its key, so it can be hidden if it morphs on its own */
const nestedKeyAttribute = "data-morph-nested-key";

type Box = { left: number; top: number; width: number; height: number };
/** A unit as it is: where it's laid out (relative to the root's offset parent), and how it's related to the others */
type MeasuredUnit = Box & {
  element: HTMLElement;
  /** The element its box is (see unitBox) */
  box: HTMLElement;
  /** The key of the nearest unit it's inside, if any */
  parentKey: string | null;
  /** Whether it shows anything (text, or an icon or image): one that doesn't (e.g. a spacer) has no look to morph */
  hasContent: boolean;
};
/** A unit as it was, with a copy of it as it looked */
type SnapshotUnit = Box & Pick<MeasuredUnit, "parentKey" | "hasContent"> & { copy: { outer: HTMLElement; inner: HTMLElement } };
type MorphSnapshot = Map<string, SnapshotUnit>;

/** framer-motion's default layout transition, so what it slides (e.g. the containers of the units) keeps in step */
const easing = "cubic-bezier(0.4, 0, 0.1, 1)";

function canAnimate() {
  return typeof Element !== "undefined" && typeof Element.prototype.animate === "function"
    && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** The element a unit's box is: its first child if it has no box of its own (`display: contents`) */
function unitBox(element: HTMLElement) {
  return getComputedStyle(element).display === "contents" ? element.firstElementChild as HTMLElement | null : element;
}

/** Where `element` is laid out, relative to `root`'s offset parent (so it allows for the root moving) */
function layoutPosition(element: HTMLElement, root: HTMLElement) {
  const { left, top } = layoutOffset(element, root);
  return { left: left + root.offsetLeft, top: top + root.offsetTop };
}

/** The units in `root` shown (matching `scope`, a selector, if given), by key */
function measureUnits(root: HTMLElement, scope: string): Map<string, MeasuredUnit> {
  const selector = `[${morphKeyAttribute}]${scope}`;
  const units = new Map<string, MeasuredUnit>();
  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    const box = unitBox(element);
    // Not shown (e.g. `display: none`)
    if (!box || !box.offsetParent) continue;
    const parent = element.parentElement?.closest<HTMLElement>(selector);
    units.set(element.getAttribute(morphKeyAttribute)!, {
      ...layoutPosition(box, root),
      ...layoutSize(box),
      element,
      box,
      parentKey: parent && root.contains(parent) ? parent.getAttribute(morphKeyAttribute) : null,
      hasContent: !!box.textContent?.trim() || !!box.querySelector("svg, img, canvas, video"),
    });
  }
  return units;
}

/**
 * A copy of `element` to show in the morph's layer, in shells copying its ancestors up to `root` (`display: contents`,
 * so they take no space), so that styles applying to it as a descendant of them still do. Units in it are marked
 * (`nestedKeyAttribute`) so those that morph on their own can be hidden in it (`hideMorphing`).
 */
function copyInContext(element: HTMLElement, root: HTMLElement) {
  const inner = element.cloneNode(true) as HTMLElement;
  for (const nested of inner.querySelectorAll<HTMLElement>(`[${morphKeyAttribute}]`)) {
    nested.setAttribute(nestedKeyAttribute, nested.getAttribute(morphKeyAttribute)!);
    nested.removeAttribute(morphKeyAttribute);
  }
  for (const copied of [inner, ...inner.querySelectorAll<HTMLElement>("[id], [data-testid]")]) {
    copied.removeAttribute("id");
    copied.removeAttribute("data-testid");
  }
  inner.removeAttribute(morphKeyAttribute);
  let outer = inner;
  for (let ancestor = element.parentElement; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
    const shell = ancestor.cloneNode(false) as HTMLElement;
    shell.removeAttribute("id");
    shell.removeAttribute("data-testid");
    shell.removeAttribute(morphKeyAttribute);
    shell.removeAttribute("style");
    shell.style.display = "contents";
    shell.append(outer);
    outer = shell;
  }
  return { outer, inner };
}

/** Hides the units in a copy that morph on their own, so they're not shown twice */
function hideMorphing(copy: HTMLElement, morphing: Set<string>) {
  for (const nested of copy.querySelectorAll<HTMLElement>(`[${nestedKeyAttribute}]`)) {
    if (morphing.has(nested.getAttribute(nestedKeyAttribute)!)) nested.style.visibility = "hidden";
  }
}

/** Where every unit in `root` (matching `scope`) is, by its key, with a copy of it, to morph from */
function snapshot(root: HTMLElement, scope: string): MorphSnapshot {
  const units: MorphSnapshot = new Map();
  for (const [key, { element, box, ...unit }] of measureUnits(root, scope)) {
    units.set(key, { ...unit, copy: copyInContext(box, root) });
  }
  return units;
}

/**
 * Morphs the units in `root` (matching `scope`) from how they were (`before`) to how they are. Copies of them do the
 * moving, in a layer over the rest, so nothing about the real elements' layout changes (framer-motion, which lays some
 * of them out, measures them, transforms and all), and the real ones are hidden until it's done. Returns a function
 * stopping it. What's done, and why, is in docs/scene-info-panel.md § "Switching to and from editing".
 *
 * - A unit before and after slides in a straight line from where it was to where it is, resized evenly, centre to
 *   centre, so its text shrinks or grows rather than being squashed, while its new look fades in over its old one,
 *   which then fades out underneath (so it's never see-through partway). The frame (`morphFrameAttribute`) is
 *   stretched to fit instead, under the rest (not in the layer over it), and clips the rest.
 * - One that doesn't show anything (e.g. a spacer) before or after has no look to morph, so fades out or in in place.
 * - One only before fades out, and one only after fades in (later, once what's around it has mostly arrived), unless
 *   it's inside another unit, which it fades with: fading on their own as well, new things inside new things were
 *   faded twice over, so stayed faint until they suddenly weren't.
 */
function play(root: HTMLElement, before: MorphSnapshot, duration: number, scope: string) {
  const now = measureUnits(root, scope);
  const isFrame = (key: string) => !!now.get(key)?.element.hasAttribute(morphFrameAttribute);
  // Units morphing from one look to the other, rather than fading in or out
  const morphing = new Set([...now.keys()].filter(key => {
    const was = before.get(key);
    return was && (isFrame(key) || (was.hasContent && now.get(key)!.hasContent));
  }));

  const createLayer = (className: string) => {
    const layer = document.createElement("div");
    layer.className = className;
    layer.setAttribute("aria-hidden", "true");
    Object.assign(layer.style, { position: "absolute", inset: "0", pointerEvents: "none" });
    return layer;
  };
  const layer = createLayer("morph-layer");
  layer.style.zIndex = "10";
  // The frame's copy, under the rest of the root rather than over it: in the layer over it, what fades in for real
  // (e.g. the editor's toolbar) was shown through the frame, so dimmed by it if it's translucent, until it went
  const frameLayer = createLayer("morph-frame-layer");
  const animations: Animation[] = [];
  const timing = { duration, easing, fill: "both" } as const;
  const show = (unit: Box, copy: { outer: HTMLElement; inner: HTMLElement }, into = layer) => {
    hideMorphing(copy.inner, morphing);
    Object.assign(copy.inner.style, {
      position: "absolute",
      left: `${unit.left - root.offsetLeft}px`,
      top: `${unit.top - root.offsetTop}px`,
      width: `${unit.width}px`,
      height: `${unit.height}px`,
      margin: "0",
      maxWidth: "none",
      minWidth: "0",
      boxSizing: "border-box",
      transformOrigin: "50% 50%",
      pointerEvents: "none",
    });
    into.append(copy.outer);
    return copy.inner;
  };
  /** The transform taking a copy laid out at `from` to `to`: stretched to fit if `stretch`, or else evenly, centred */
  const fromTo = (from: Box, to: Box, stretch = false) => {
    const scaleX = to.width / Math.max(from.width, 1);
    const scaleY = to.height / Math.max(from.height, 1);
    const scale = stretch ? `${scaleX}, ${scaleY}` : `${Math.min(scaleX, scaleY)}`;
    const x = to.left + to.width / 2 - (from.left + from.width / 2);
    const y = to.top + to.height / 2 - (from.top + from.height / 2);
    return `translate(${x}px, ${y}px) scale(${scale})`;
  };

  // Going: fading out where it was, unless it's in another unit, whose copy (before) it's shown in
  for (const [key, was] of before) {
    if (morphing.has(key) || was.parentKey !== null) continue;
    animations.push(show(was, was.copy).animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, duration: duration / 2 }));
  }
  for (const [key, unit] of now) {
    const was = before.get(key);
    if (!was || !morphing.has(key)) {
      // Arriving: fading in, unless it's in another unit, which it's shown with
      if (unit.parentKey === null) {
        animations.push(unit.box.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], timing));
      }
      continue;
    }
    // Hidden until the morph's stopped, in step with its copies being removed
    animations.push(unit.box.animate([{ opacity: 0 }, { opacity: 0 }], timing));
    const arrivingCopy = copyInContext(unit.box, root);
    if (isFrame(key)) {
      animations.push(show(unit, arrivingCopy, frameLayer).animate([{ transform: fromTo(unit, was, true) }, { transform: "none" }], timing));
      // Relative to the root's box (now), which a bigger frame before reaches beyond
      const inset = (box: Box) => `inset(${box.top - root.offsetTop}px ${root.offsetLeft + root.offsetWidth - box.left - box.width}px ${root.offsetTop + root.offsetHeight - box.top - box.height}px ${box.left - root.offsetLeft}px)`;
      animations.push(root.animate([{ clipPath: inset(was) }, { clipPath: inset(unit) }], timing));
      continue;
    }
    // Its old look underneath (added first), fading out once its new look's faded in over it
    const leaving = show(was, was.copy);
    const arriving = show(unit, arrivingCopy);
    animations.push(leaving.animate([
      { transform: "none", opacity: 1 },
      { opacity: 1, offset: 0.5 },
      { transform: fromTo(was, unit), opacity: 0 },
    ], timing));
    animations.push(arriving.animate([
      { transform: fromTo(unit, was), opacity: 0 },
      { opacity: 1, offset: 0.5 },
      { transform: "none", opacity: 1 },
    ], timing));
  }

  root.append(layer);
  // First, so it's under the rest of what's positioned in the root
  root.prepend(frameLayer);
  const stop = () => {
    for (const animation of animations) animation.cancel();
    layer.remove();
    frameLayer.remove();
  };
  // Once they've all finished, in the same frame, so the real elements show as their copies go. (Cancelled, they reject.)
  Promise.all(animations.map(animation => animation.finished)).then(stop, () => {});
  return stop;
}

/**
 * Animates a change to what's shown in the element `rootRef` refers to: call the function it returns just before
 * making the change (e.g. in the click handler), and once it's rendered, each of the elements marked with
 * `data-morph-key` (`morphKeyAttribute`) slides and resizes from where the element with the same key was, its old look
 * fading into its new one. Elements with a key only before fade out, and those only after fade in (see `play`). Pass
 * it a selector (e.g. `".pill"`) to morph only the elements matching it, leaving the rest as they are (e.g. for
 * framer-motion to slide). Nothing's animated if the user prefers reduced motion. The root must be positioned. Used by the scene info panel: see
 * docs/scene-info-panel.md § "Switching to and from editing".
 */
export function useMorphTransition(rootRef: RefObject<HTMLElement>, { duration = 450 }: { duration?: number } = {}) {
  const pendingRef = useRef<{ before: MorphSnapshot, scope: string } | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const pending = pendingRef.current;
    const root = rootRef.current;
    if (!pending || !root) return;
    pendingRef.current = null;
    stopRef.current = play(root, pending.before, duration, pending.scope);
  });
  useEffect(() => () => stopRef.current?.(), []);
  return useCallback((scope = "") => {
    const root = rootRef.current;
    if (!root || !canAnimate()) return;
    // A morph still running ends where it was heading, which is then what's morphed from
    stopRef.current?.();
    stopRef.current = null;
    pendingRef.current = { before: snapshot(root, scope), scope };
  }, []);
}
