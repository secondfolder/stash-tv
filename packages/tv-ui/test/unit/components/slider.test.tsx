import { describe, it, expect, vi } from "vitest"
import React from "react"
// RTL cleanup runs centrally in test/setup.ts
import { render, screen, fireEvent } from "@testing-library/react"
import Slider from "../../../src/components/controls/slider"

/**
 * Tests the Slider wrapper's own behaviour: the volume thumb's accessible
 * name, conditional marks rendering, mark count/position math, and the
 * thumb pointer-event hooks. Radix's own slider behaviour is not re-tested.
 *
 * The mark positions are asserted via class selectors because the marks'
 * layout IS this component's contract (styling component rules apply).
 */

describe("Slider", () => {
  const defaultProps = {
    value: [50],
    min: 0,
    max: 100,
    step: 1,
  }

  it("labels the thumb as Volume for screen readers", () => {
    render(<Slider {...defaultProps} />)
    expect(screen.getByRole("slider")).toHaveAttribute("aria-label", "Volume")
  })

  it("renders marks only when the marks prop is set", () => {
    const withMarks = render(<Slider {...defaultProps} marks={true} />)
    expect(withMarks.container.querySelector(".marks")).toBeInTheDocument()

    const withoutMarks = render(<Slider {...defaultProps} />)
    expect(withoutMarks.container.querySelector(".marks")).not.toBeInTheDocument()
  })

  it("computes the mark count from the range and step", () => {
    const { container } = render(
      <Slider {...defaultProps} marks={true} min={0} max={10} step={1} />
    )
    // (10 - 0) / 1 + 1 = 11 marks
    expect(container.querySelectorAll(".mark").length).toBe(11)
  })

  it("counts marks for a range ending at 0", () => {
    const { container } = render(
      <Slider value={[0]} marks={true} min={-10} max={0} step={5} />
    )
    // (0 - -10) / 5 + 1 = 3 marks
    expect(container.querySelectorAll(".mark").length).toBe(3)
  })

  it("counts marks across Radix's default range of 0–100 when no max is given", () => {
    const { container } = render(<Slider value={[0]} marks={true} step={25} />)
    // (100 - 0) / 25 + 1 = 5 marks
    expect(container.querySelectorAll(".mark").length).toBe(5)
  })

  it("doesn't drop a mark to floating point error", () => {
    const { container } = render(<Slider value={[0]} marks={true} min={0} max={0.3} step={0.1} />)
    expect(container.querySelectorAll(".mark").length).toBe(4)
  })

  it("handles fractional steps", () => {
    const { container } = render(
      <Slider {...defaultProps} marks={true} min={0} max={1} step={0.1} />
    )
    // (1 - 0) / 0.1 + 1 = 11 marks
    expect(container.querySelectorAll(".mark").length).toBe(11)
  })

  it("spreads marks evenly across the track", () => {
    const { container } = render(
      <Slider {...defaultProps} marks={true} min={0} max={10} step={1} />
    )
    const marks = container.querySelectorAll(".mark")
    expect(marks[0]).toHaveStyle({ left: "0%" })
    expect(marks[marks.length - 1]).toHaveStyle({ left: "100%" })
  })

  it("renders the single mark of a degenerate range (min equals max) at the start", () => {
    const { container } = render(
      <Slider value={[5]} min={5} max={5} step={1} marks={true} />
    )
    const marks = container.querySelectorAll(".mark")
    expect(marks.length).toBe(1)
    // Regression: this used to render left: NaN%
    expect(marks[0]).toHaveStyle({ left: "0%" })
  })

  it("forwards thumb pointer events to the mouse hook props", () => {
    const onThumbMouseDown = vi.fn()
    const onThumbMouseUp = vi.fn()
    render(
      <Slider
        {...defaultProps}
        onThumbMouseDown={onThumbMouseDown}
        onThumbMouseUp={onThumbMouseUp}
      />
    )
    const thumb = screen.getByRole("slider")

    // fireEvent drives the two handlers directly. Radix's own thumb handlers
    // also run, and they need the Pointer Capture API that jsdom lacks — see
    // the polyfill in test/setup.ts.
    fireEvent.pointerDown(thumb)
    fireEvent.pointerUp(thumb)

    expect(onThumbMouseDown).toHaveBeenCalledTimes(1)
    expect(onThumbMouseUp).toHaveBeenCalledTimes(1)
  })
})
