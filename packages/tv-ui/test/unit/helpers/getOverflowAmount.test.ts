import { describe, it, expect, vi, afterEach } from "vitest";
import { getOverflowAmount } from "../../../src/helpers/getOverflowAmount";

/**
 * Tests for getOverflowAmount — walks an element's descendants and reports
 * how far the furthest-extending child spills past the parent on each side,
 * stopping descent at elements that clip their contents.
 */

describe("getOverflowAmount", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function layout(element: Element, rect: DOMRect) {
    element.getBoundingClientRect = () => rect;
  }

  it("returns zero overflow when children stay within the parent", () => {
    const parent = document.createElement("div");
    const child = document.createElement("div");
    parent.append(child);

    layout(parent, new DOMRect(0, 0, 100, 100));
    layout(child, new DOMRect(10, 10, 50, 50));

    expect(getOverflowAmount(parent)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it("reports the spill on each side from children extending past the parent", () => {
    const parent = document.createElement("div");
    const wideChild = document.createElement("div");
    const tallChild = document.createElement("div");
    parent.append(wideChild, tallChild);

    layout(parent, new DOMRect(100, 100, 100, 100));
    layout(wideChild, new DOMRect(50, 100, 200, 50)); // spills left (50) and right (50)
    layout(tallChild, new DOMRect(100, 50, 50, 200)); // spills top (50) and bottom (50)

    expect(getOverflowAmount(parent)).toEqual({ top: 50, right: 50, bottom: 50, left: 50 });
  });

  it("takes the furthest spill across multiple children per side", () => {
    const parent = document.createElement("div");
    const nearChild = document.createElement("div");
    const farChild = document.createElement("div");
    parent.append(nearChild, farChild);

    layout(parent, new DOMRect(0, 0, 100, 100));
    layout(nearChild, new DOMRect(-10, 0, 20, 20));
    layout(farChild, new DOMRect(-30, 0, 20, 20));

    expect(getOverflowAmount(parent).left).toBe(30);
  });

  it("ignores display:none children and does not descend into clipping containers", () => {
    const parent = document.createElement("div");
    const hiddenChild = document.createElement("div");
    const clippingChild = document.createElement("div");
    const clippedGrandchild = document.createElement("div");
    parent.append(hiddenChild, clippingChild);
    clippingChild.append(clippedGrandchild);

    layout(parent, new DOMRect(0, 0, 100, 100));
    layout(hiddenChild, new DOMRect(-500, 0, 20, 20));
    layout(clippingChild, new DOMRect(0, 0, 100, 100));
    layout(clippedGrandchild, new DOMRect(-400, 0, 20, 20));

    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
      const elm = element as HTMLElement;
      if (elm === hiddenChild) {
        return { display: "none" } as CSSStyleDeclaration;
      }
      if (elm === clippingChild) {
        return { display: "block", overflow: "hidden" } as CSSStyleDeclaration;
      }
      return { display: "block" } as CSSStyleDeclaration;
    });

    // Neither the hidden child nor the clipped descendant contributes
    expect(getOverflowAmount(parent)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});
