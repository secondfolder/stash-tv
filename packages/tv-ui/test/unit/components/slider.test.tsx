import { describe, it, expect, vi } from "vitest"
import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import Slider from "../../../src/components/controls/slider"

describe("Slider", () => {
  const defaultProps = {
    value: [50],
    min: 0,
    max: 100,
    step: 1
  }

  it("renders RadixSlider root with Slider class", () => {
    const { container } = render(<Slider {...defaultProps} />)
    expect(container.querySelector(".Slider")).toBeInTheDocument()
  })

  it("renders track and range elements", () => {
    const { container } = render(<Slider {...defaultProps} />)
    expect(container.querySelector(".track")).toBeInTheDocument()
    expect(container.querySelector(".range")).toBeInTheDocument()
  })

  it("renders thumb element", () => {
    const { container } = render(<Slider {...defaultProps} />)
    expect(container.querySelector(".thumb")).toBeInTheDocument()
  })

  it("has aria-label on thumb", () => {
    const { container } = render(<Slider {...defaultProps} />)
    const thumb = container.querySelector(".thumb")
    expect(thumb).toHaveAttribute("aria-label", "Volume")
  })

  it("renders marks when marks prop is true", () => {
    const { container } = render(<Slider {...defaultProps} marks={true} />)
    expect(container.querySelector(".marks")).toBeInTheDocument()
  })

  it("does not render marks when marks prop is false or undefined", () => {
    const { container } = render(<Slider {...defaultProps} />)
    expect(container.querySelector(".marks")).not.toBeInTheDocument()
  })

  it("calculates correct number of marks for given min/max/step", () => {
    const { container } = render(
      <Slider {...defaultProps} marks={true} min={0} max={10} step={1} />
    )
    const marks = container.querySelectorAll(".mark")
    // (10 - 0) / 1 + 1 = 11 marks
    expect(marks.length).toBe(11)
  })

  it("positions marks correctly with percentage", () => {
    const { container } = render(
      <Slider {...defaultProps} marks={true} min={0} max={10} step={1} />
    )
    const marks = container.querySelectorAll(".mark")
    const lastMark = marks[marks.length - 1]
    expect(lastMark).toHaveStyle({ left: "100%" })
  })

  it("passes through RadixSlider props", () => {
    const { container } = render(
      <Slider {...defaultProps} disabled={true} />
    )
    const slider = container.querySelector(".Slider")
    expect(slider).toBeInTheDocument()
  })

  it("handles step of 10 for 0-100 range", () => {
    const { container } = render(
      <Slider {...defaultProps} marks={true} min={0} max={100} step={10} />
    )
    const marks = container.querySelectorAll(".mark")
    // (100 - 0) / 10 + 1 = 11 marks
    expect(marks.length).toBe(11)
  })

  it("handles fractional step values", () => {
    const { container } = render(
      <Slider {...defaultProps} marks={true} min={0} max={1} step={0.1} />
    )
    const marks = container.querySelectorAll(".mark")
    // (1 - 0) / 0.1 + 1 = 11 marks
    expect(marks.length).toBe(11)
  })

  it("works with max value of 1 and no step (defaults to 1)", () => {
    const { container } = render(
      <Slider value={[0.5]} min={0} max={1} marks={true} />
    )
    const marks = container.querySelectorAll(".mark")
    // (1 - 0) / 1 + 1 = 2 marks
    expect(marks.length).toBe(2)
  })

  it("handles single mark range (min equals max)", () => {
    const { container } = render(
      <Slider value={[5]} min={5} max={5} step={1} marks={true} />
    )
    const marks = container.querySelectorAll(".mark")
    // (5 - 5) / 1 + 1 = 1 mark
    expect(marks.length).toBe(1)
  })
})
