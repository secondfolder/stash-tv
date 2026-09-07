import { describe, it, expect } from "vitest"
import React from "react"
import { render } from "@testing-library/react"
import ClipTimestamp from "../../../src/components/slide/ClipTimestamp"
// RTL cleanup runs centrally in test/setup.ts

/**
 * ClipTimestamp is a styling component: its contract is the Video.js control
 * class, the marker type class, and the percentage position. Class/style
 * selectors are the sanctioned queries here — the classes ARE the contract.
 */

describe("ClipTimestamp", () => {
  it("renders as a Video.js control with the marker type class", () => {
    const { container } = render(<ClipTimestamp type="start" progressPercentage={50} />)
    const marker = container.querySelector(".ClipTimestamp")
    expect(marker).toHaveClass("vjs-control", "start-timestamp")
  })

  it("positions the marker at the given percentage", () => {
    const { container } = render(<ClipTimestamp type="end" progressPercentage={33.333} />)
    expect(container.querySelector(".ClipTimestamp")).toHaveStyle({ left: "33.333%" })
  })

  it("handles the range boundaries", () => {
    const { container } = render(
      <>
        <ClipTimestamp type="start" progressPercentage={0} />
        <ClipTimestamp type="end" progressPercentage={100} />
      </>
    )
    const markers = container.querySelectorAll(".ClipTimestamp")
    expect(markers[0]).toHaveStyle({ left: "0%" })
    expect(markers[1]).toHaveStyle({ left: "100%" })
  })
})
